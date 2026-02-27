import fabricModule from 'fabric'
import { ColorTracker, type TemplateData } from './ColorTracker'
import { YoloDetector, type Detection } from './YoloDetector'

// Handle CommonJS/ESM interop - fabric exports { fabric: ... } structure
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fabric: any = (fabricModule as any).fabric || fabricModule

export interface TrackPoint {
  time: number
  x: number
  y: number
  width?: number
  height?: number
}

export interface PlayerTrackerOptions {
  color?: string
  radius?: number
  width?: number   // initial bbox width (default 60)
  height?: number  // initial bbox height (default 60)
}

interface TrackerEntry {
  id: string
  group: fabric.Group          // The annotation's fabric group (owned by drawingStore)
  keyframes: TrackPoint[]
  options: PlayerTrackerOptions
  statusLabel: fabric.Text | null
  currentWidth: number         // smoothed current bbox width
  currentHeight: number        // smoothed current bbox height
}

interface AutoTrackingState {
  template: TemplateData
  videoElement: HTMLVideoElement
  nativeW: number              // Video-native coordinate width
  nativeH: number              // Video-native coordinate height
  lastConfidence: number
  paused: boolean
  lastProcessedTime: number
}

export class PlayerTracker {
  private canvas: fabric.Canvas
  private trackers: Map<string, TrackerEntry> = new Map()
  private currentTime: number = 0
  private colorTracker: ColorTracker = new ColorTracker()
  private yoloDetector: YoloDetector = new YoloDetector()
  private autoTracking: Map<string, AutoTrackingState> = new Map()
  private pendingDetection: Promise<Detection[]> | null = null
  private cachedDetections: Detection[] = []

  constructor(canvas: fabric.Canvas) {
    this.canvas = canvas
    // Load YOLO model in background — silent fallback to ColorTracker if it fails
    this.yoloDetector.initialize()
  }

  /**
   * Register an existing annotation group for tracking.
   * The group was already created and added to the canvas by DrawingCanvas.
   */
  track(
    id: string,
    group: fabric.Group,
    initialPosition: TrackPoint,
    options: PlayerTrackerOptions = {}
  ) {
    // Add a small status label below the tracker
    const initW = options.width || 60
    const initH = options.height || 60
    const label = new fabric.Text('Tracking', {
      fontSize: 10,
      fill: options.color || '#ff0000',
      fontFamily: 'Arial',
      fontWeight: 'bold',
      originX: 'center',
      originY: 'top',
      top: initH / 2 + 4,
      left: 0,
      shadow: new fabric.Shadow({
        color: 'rgba(0,0,0,0.8)',
        blur: 3,
        offsetX: 0,
        offsetY: 0,
      }),
    })
    group.add(label)

    // Listen for manual moves to record keyframes + resample
    group.on('modified', () => {
      this.addKeyframeFromGroup(id)
      this.resampleTemplate(id)
    })

    this.trackers.set(id, {
      id,
      group,
      keyframes: [initialPosition],
      options,
      statusLabel: label,
      currentWidth: initW,
      currentHeight: initH,
    })
  }

  /**
   * Enable auto-tracking using YOLO detection (preferred) or color template matching (fallback).
   * nativeW/nativeH should be the video-native coordinate dimensions (refDims).
   */
  enableAutoTracking(
    id: string,
    videoElement: HTMLVideoElement,
    nativeW: number,
    nativeH: number
  ): boolean {
    const entry = this.trackers.get(id)
    if (!entry) return false

    const center = this.getGroupCenter(entry)

    // Always sample a color template as fallback
    const template = this.colorTracker.sampleTemplate(
      videoElement, center.x, center.y, nativeW, nativeH
    )
    if (!template) return false

    this.autoTracking.set(id, {
      template,
      videoElement,
      nativeW,
      nativeH,
      lastConfidence: 1,
      paused: false,
      lastProcessedTime: this.currentTime,
    })

    // If YOLO is ready, run an initial detection to snap to the closest person bbox
    if (this.yoloDetector.modelLoaded) {
      this.updateStatusLabel(entry, 1, 'AI Ready')
      this.yoloDetector.detectAll(videoElement, nativeW, nativeH).then((dets) => {
        this.cachedDetections = dets
        const closest = this.yoloDetector.findClosestDetection(dets, center.x, center.y)
        if (closest && closest.distance < Math.max(nativeW, nativeH) * 0.15) {
          this.addKeyframe(id, {
            time: this.currentTime,
            x: closest.x,
            y: closest.y,
            width: closest.width,
            height: closest.height,
          })
        }
      })
    }

    return true
  }

  disableAutoTracking(id: string) {
    this.autoTracking.delete(id)
  }

  isAutoTracking(id: string): boolean {
    const at = this.autoTracking.get(id)
    return !!at && !at.paused
  }

  getAutoTrackingConfidence(id: string): number {
    return this.autoTracking.get(id)?.lastConfidence ?? 0
  }

  /**
   * Update all trackers based on current video time.
   */
  update(currentTime: number) {
    this.currentTime = currentTime

    this.trackers.forEach((entry) => {
      const at = this.autoTracking.get(entry.id)

      // Auto-tracking: process when time has changed by at least one frame (~30fps)
      if (at && !at.paused) {
        if (Math.abs(currentTime - at.lastProcessedTime) > 0.03) {
          const lastState = this.getStateAtTime(entry.id, currentTime)
          if (lastState) {
            if (this.yoloDetector.modelLoaded) {
              // YOLO path: fire-and-forget async detection, use cached results
              this.runYoloDetection(at)
              if (this.cachedDetections.length > 0) {
                const closest = this.yoloDetector.findClosestDetection(
                  this.cachedDetections, lastState.x, lastState.y
                )
                if (closest) {
                  // Use a distance-based confidence: close match = high confidence
                  const maxDist = Math.max(at.nativeW, at.nativeH) * 0.15
                  const distConf = Math.max(0, 1 - closest.distance / maxDist)
                  const confidence = Math.min(closest.confidence, distConf > 0.3 ? closest.confidence : distConf)
                  at.lastConfidence = confidence
                  if (confidence > 0.4) {
                    this.addKeyframe(entry.id, {
                      time: currentTime,
                      x: closest.x,
                      y: closest.y,
                      width: closest.width,
                      height: closest.height,
                    })
                  } else {
                    at.paused = true
                  }
                  this.updateStatusLabel(entry, confidence)
                }
              }
            } else {
              // Fallback: ColorTracker (no bbox dimensions available)
              const match = this.colorTracker.findBestMatch(
                at.videoElement, lastState.x, lastState.y, at.template,
                at.nativeW, at.nativeH
              )
              if (match) {
                at.lastConfidence = match.confidence
                if (match.confidence > 0.4) {
                  this.addKeyframe(entry.id, { time: currentTime, x: match.x, y: match.y })
                } else {
                  at.paused = true
                }
                this.updateStatusLabel(entry, match.confidence)
              }
            }
          }
          at.lastProcessedTime = currentTime
        }
      }

      // Interpolate position and move the group
      const state = this.getStateAtTime(entry.id, currentTime)
      if (!state) return

      // Track target size from YOLO data for future use
      if (state.width != null) {
        entry.currentWidth += (Math.max(30, state.width) - entry.currentWidth) * 0.3
      }
      if (state.height != null) {
        entry.currentHeight += (Math.max(30, state.height) - entry.currentHeight) * 0.3
      }

      const halfW = entry.currentWidth / 2
      const halfH = entry.currentHeight / 2
      entry.group.set({
        left: state.x - halfW,
        top: state.y - halfH,
      })
      entry.group.setCoords()
    })

    this.canvas.renderAll()
  }

  /**
   * Fire-and-forget async YOLO detection. Caches results for use in the next sync update cycle.
   */
  private runYoloDetection(at: AutoTrackingState) {
    if (this.pendingDetection) return
    this.pendingDetection = this.yoloDetector
      .detectAll(at.videoElement, at.nativeW, at.nativeH)
      .then((dets) => {
        this.cachedDetections = dets
        this.pendingDetection = null
        return dets
      })
      .catch(() => {
        this.pendingDetection = null
        return []
      })
  }

  private getGroupCenter(entry: TrackerEntry): { x: number; y: number } {
    return {
      x: (entry.group.left || 0) + entry.currentWidth / 2,
      y: (entry.group.top || 0) + entry.currentHeight / 2,
    }
  }

  private addKeyframeFromGroup(id: string) {
    const entry = this.trackers.get(id)
    if (!entry) return

    const center = this.getGroupCenter(entry)
    this.addKeyframe(id, {
      time: this.currentTime,
      x: center.x,
      y: center.y,
    })
  }

  addKeyframe(id: string, point: TrackPoint) {
    const entry = this.trackers.get(id)
    if (!entry) return

    // Remove existing keyframe at this time
    entry.keyframes = entry.keyframes.filter((k) => Math.abs(k.time - point.time) > 0.01)
    entry.keyframes.push(point)
    entry.keyframes.sort((a, b) => a.time - b.time)
  }

  getStateAtTime(id: string, time: number): { x: number; y: number; width?: number; height?: number } | null {
    const entry = this.trackers.get(id)
    if (!entry || entry.keyframes.length === 0) return null

    const kf = entry.keyframes

    if (time <= kf[0].time) return { x: kf[0].x, y: kf[0].y, width: kf[0].width, height: kf[0].height }
    if (time >= kf[kf.length - 1].time) {
      const last = kf[kf.length - 1]
      return { x: last.x, y: last.y, width: last.width, height: last.height }
    }

    // Interpolate between surrounding keyframes
    for (let i = 0; i < kf.length - 1; i++) {
      if (time >= kf[i].time && time <= kf[i + 1].time) {
        const t = (time - kf[i].time) / (kf[i + 1].time - kf[i].time)
        const result: { x: number; y: number; width?: number; height?: number } = {
          x: kf[i].x + (kf[i + 1].x - kf[i].x) * t,
          y: kf[i].y + (kf[i + 1].y - kf[i].y) * t,
        }
        // Interpolate size when both keyframes have dimensions
        const w0 = kf[i].width
        const w1 = kf[i + 1].width
        const h0 = kf[i].height
        const h1 = kf[i + 1].height
        if (w0 != null && w1 != null) {
          result.width = w0 + (w1 - w0) * t
        } else {
          result.width = w1 ?? w0  // carry forward last known size
        }
        if (h0 != null && h1 != null) {
          result.height = h0 + (h1 - h0) * t
        } else {
          result.height = h1 ?? h0
        }
        return result
      }
    }

    return null
  }

  private updateStatusLabel(entry: TrackerEntry, confidence: number, overrideText?: string) {
    if (!entry.statusLabel) return

    if (overrideText) {
      entry.statusLabel.set({ text: overrideText, fill: '#3b82f6' })
    } else if (confidence > 0.7) {
      entry.statusLabel.set({ text: 'Tracking', fill: '#22c55e' })
    } else if (confidence > 0.4) {
      entry.statusLabel.set({ text: 'Tracking', fill: '#eab308' })
    } else {
      entry.statusLabel.set({ text: 'Lost', fill: '#ef4444' })
    }

    // Also update glow color on the group's children
    const objects = (entry.group as any)._objects || []
    const shadowColor = confidence > 0.7 ? '#22c55e' : confidence > 0.4 ? '#eab308' : '#ef4444'
    for (const obj of objects) {
      if (obj.shadow && obj !== entry.statusLabel) {
        obj.shadow.color = shadowColor
      }
    }
  }

  private resampleTemplate(id: string) {
    const at = this.autoTracking.get(id)
    const entry = this.trackers.get(id)
    if (!at || !entry) return

    const center = this.getGroupCenter(entry)
    const template = this.colorTracker.sampleTemplate(
      at.videoElement, center.x, center.y, at.nativeW, at.nativeH
    )
    if (template) {
      at.template = template
      at.paused = false
      at.lastConfidence = 1
    }
  }

  remove(id: string) {
    this.trackers.delete(id)
    this.autoTracking.delete(id)
  }

  removeAll() {
    this.trackers.clear()
    this.autoTracking.clear()
    this.cachedDetections = []
    this.pendingDetection = null
  }

  dispose() {
    this.removeAll()
    this.yoloDetector.dispose()
  }

  getTracker(id: string) {
    return this.trackers.get(id)
  }

  getAllTrackers() {
    return Array.from(this.trackers.values())
  }

  getKeyframes(id: string) {
    return this.trackers.get(id)?.keyframes || []
  }
}
