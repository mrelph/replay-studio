import fabricModule from 'fabric'
import { ColorTracker, type TemplateData } from './ColorTracker'

// Handle CommonJS/ESM interop - fabric exports { fabric: ... } structure
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fabric: any = (fabricModule as any).fabric || fabricModule

export interface TrackPoint {
  time: number
  x: number
  y: number
}

export interface PlayerTrackerOptions {
  color?: string
  radius?: number
}

interface TrackerEntry {
  id: string
  group: fabric.Group          // The annotation's fabric group (owned by drawingStore)
  keyframes: TrackPoint[]
  options: PlayerTrackerOptions
  statusLabel: fabric.Text | null
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
  private autoTracking: Map<string, AutoTrackingState> = new Map()

  constructor(canvas: fabric.Canvas) {
    this.canvas = canvas
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
    const radius = options.radius || 30
    const label = new fabric.Text('Tracking', {
      fontSize: 10,
      fill: options.color || '#ff0000',
      fontFamily: 'Arial',
      fontWeight: 'bold',
      originX: 'center',
      originY: 'top',
      top: radius + 4,
      left: 0,
      shadow: new fabric.Shadow({
        color: 'rgba(0,0,0,0.8)',
        blur: 3,
        offsetX: 0,
        offsetY: 0,
      }),
    })
    group.addWithUpdate(label)

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
    })
  }

  /**
   * Enable auto-tracking using color template matching.
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
          const lastPos = this.getPositionAtTime(entry.id, currentTime)
          if (lastPos) {
            const match = this.colorTracker.findBestMatch(
              at.videoElement, lastPos.x, lastPos.y, at.template,
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
          at.lastProcessedTime = currentTime
        }
      }

      // Interpolate position and move the group
      const pos = this.getPositionAtTime(entry.id, currentTime)
      if (!pos) return

      const radius = entry.options.radius || 30
      entry.group.set({
        left: pos.x - radius,
        top: pos.y - radius,
      })
      entry.group.setCoords()
    })

    this.canvas.renderAll()
  }

  private getGroupCenter(entry: TrackerEntry): { x: number; y: number } {
    const radius = entry.options.radius || 30
    return {
      x: (entry.group.left || 0) + radius,
      y: (entry.group.top || 0) + radius,
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

  getPositionAtTime(id: string, time: number): { x: number; y: number } | null {
    const entry = this.trackers.get(id)
    if (!entry || entry.keyframes.length === 0) return null

    const kf = entry.keyframes

    if (time <= kf[0].time) return { x: kf[0].x, y: kf[0].y }
    if (time >= kf[kf.length - 1].time) {
      const last = kf[kf.length - 1]
      return { x: last.x, y: last.y }
    }

    // Interpolate between surrounding keyframes
    for (let i = 0; i < kf.length - 1; i++) {
      if (time >= kf[i].time && time <= kf[i + 1].time) {
        const t = (time - kf[i].time) / (kf[i + 1].time - kf[i].time)
        return {
          x: kf[i].x + (kf[i + 1].x - kf[i].x) * t,
          y: kf[i].y + (kf[i + 1].y - kf[i].y) * t,
        }
      }
    }

    return null
  }

  private updateStatusLabel(entry: TrackerEntry, confidence: number) {
    if (!entry.statusLabel) return

    if (confidence > 0.7) {
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
