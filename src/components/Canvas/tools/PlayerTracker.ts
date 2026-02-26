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
  strokeWidth?: number
  showLabel?: boolean
  label?: string
  showTrail?: boolean
  trailLength?: number // number of previous positions to show
}

export interface TrackerState {
  id: string
  marker: fabric.Circle | fabric.Group
  keyframes: TrackPoint[]
  options: PlayerTrackerOptions
  trail: fabric.Line[]
}

interface AutoTrackingState {
  template: TemplateData
  videoElement: HTMLVideoElement
  canvasW: number
  canvasH: number
  lastConfidence: number
  paused: boolean
  lastProcessedTime: number
}

export class PlayerTracker {
  private canvas: fabric.Canvas
  private trackers: Map<string, TrackerState> = new Map()
  private currentTime: number = 0
  private colorTracker: ColorTracker = new ColorTracker()
  private autoTracking: Map<string, AutoTrackingState> = new Map()
  private frameCount: number = 0

  constructor(canvas: fabric.Canvas) {
    this.canvas = canvas
  }

  create(id: string, initialPosition: TrackPoint, options: PlayerTrackerOptions = {}): fabric.Circle | fabric.Group {
    const {
      color = '#ff0000',
      radius = 25,
      strokeWidth = 3,
      showLabel = false,
      label = '',
      showTrail = true,
    } = options

    let marker: fabric.Circle | fabric.Group

    if (showLabel && label) {
      // Create marker with label
      const circle = new fabric.Circle({
        radius: radius,
        fill: 'transparent',
        stroke: color,
        strokeWidth: strokeWidth,
        originX: 'center',
        originY: 'center',
      })

      const text = new fabric.IText(label, {
        fontSize: 14,
        fill: color,
        fontFamily: 'Arial',
        fontWeight: 'bold',
        originX: 'center',
        originY: 'center',
        top: -radius - 15,
      })

      marker = new fabric.Group([circle, text], {
        left: initialPosition.x,
        top: initialPosition.y,
        originX: 'center',
        originY: 'center',
        selectable: true,
        evented: true,
      })
    } else {
      // Simple circle marker
      marker = new fabric.Circle({
        left: initialPosition.x - radius,
        top: initialPosition.y - radius,
        radius: radius,
        fill: 'transparent',
        stroke: color,
        strokeWidth: strokeWidth,
        selectable: true,
        evented: true,
      })
    }

    // Add visual indicator (crosshair inside circle)
    const crossSize = radius * 0.5
    const crossH = new fabric.Line([
      initialPosition.x - crossSize,
      initialPosition.y,
      initialPosition.x + crossSize,
      initialPosition.y,
    ], {
      stroke: color,
      strokeWidth: 2,
      selectable: false,
      evented: false,
    })

    const crossV = new fabric.Line([
      initialPosition.x,
      initialPosition.y - crossSize,
      initialPosition.x,
      initialPosition.y + crossSize,
    ], {
      stroke: color,
      strokeWidth: 2,
      selectable: false,
      evented: false,
    })

    this.canvas.add(marker)
    this.canvas.add(crossH)
    this.canvas.add(crossV)

    // Store tracker state
    ;(marker as any).trackerId = id
    ;(marker as any).crossH = crossH
    ;(marker as any).crossV = crossV

    // Handle marker movement to add keyframes + re-sample for auto-tracking
    marker.on('modified', () => {
      this.addKeyframeFromMarker(id)
      this.resampleTemplate(id)
    })

    this.trackers.set(id, {
      id,
      marker,
      keyframes: [initialPosition],
      options: { ...options, color, radius, strokeWidth, showTrail },
      trail: [],
    })

    return marker
  }

  // Add a keyframe at the current time based on marker position
  addKeyframeFromMarker(id: string) {
    const state = this.trackers.get(id)
    if (!state) return

    const center = state.marker.getCenterPoint()
    this.addKeyframe(id, {
      time: this.currentTime,
      x: center.x,
      y: center.y,
    })
  }

  // Add a keyframe manually
  addKeyframe(id: string, point: TrackPoint) {
    const state = this.trackers.get(id)
    if (!state) return

    // Remove any existing keyframe at this time
    state.keyframes = state.keyframes.filter((k) => Math.abs(k.time - point.time) > 0.01)

    // Add new keyframe and sort by time
    state.keyframes.push(point)
    state.keyframes.sort((a, b) => a.time - b.time)
  }

  // Enable auto-tracking for a tracker using color template matching
  enableAutoTracking(id: string, videoElement: HTMLVideoElement, canvasW: number, canvasH: number) {
    const state = this.trackers.get(id)
    if (!state) return false

    // Sample template at current marker position
    const center = state.marker.getCenterPoint()
    const template = this.colorTracker.sampleTemplate(
      videoElement, center.x, center.y, canvasW, canvasH
    )
    if (!template) return false

    this.autoTracking.set(id, {
      template,
      videoElement,
      canvasW,
      canvasH,
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

  // Re-sample template after manual correction
  resampleTemplate(id: string) {
    const at = this.autoTracking.get(id)
    const state = this.trackers.get(id)
    if (!at || !state) return

    const center = state.marker.getCenterPoint()
    const template = this.colorTracker.sampleTemplate(
      at.videoElement, center.x, center.y, at.canvasW, at.canvasH
    )
    if (template) {
      at.template = template
      at.paused = false
      at.lastConfidence = 1
    }
  }

  // Get interpolated position at a given time
  getPositionAtTime(id: string, time: number): { x: number; y: number } | null {
    const state = this.trackers.get(id)
    if (!state || state.keyframes.length === 0) return null

    const keyframes = state.keyframes

    // Before first keyframe
    if (time <= keyframes[0].time) {
      return { x: keyframes[0].x, y: keyframes[0].y }
    }

    // After last keyframe
    if (time >= keyframes[keyframes.length - 1].time) {
      const last = keyframes[keyframes.length - 1]
      return { x: last.x, y: last.y }
    }

    // Find surrounding keyframes and interpolate
    for (let i = 0; i < keyframes.length - 1; i++) {
      if (time >= keyframes[i].time && time <= keyframes[i + 1].time) {
        const t = (time - keyframes[i].time) / (keyframes[i + 1].time - keyframes[i].time)

        // Linear interpolation
        return {
          x: keyframes[i].x + (keyframes[i + 1].x - keyframes[i].x) * t,
          y: keyframes[i].y + (keyframes[i + 1].y - keyframes[i].y) * t,
        }
      }
    }

    return null
  }

  // Update all trackers based on current time
  update(currentTime: number) {
    this.currentTime = currentTime
    this.frameCount++

    this.trackers.forEach((state) => {
      // Auto-tracking: run every 2nd frame for performance
      const at = this.autoTracking.get(state.id)
      if (at && !at.paused && this.frameCount % 2 === 0) {
        // Only process if time has changed (new frame)
        if (Math.abs(currentTime - at.lastProcessedTime) > 0.01) {
          const lastPos = this.getPositionAtTime(state.id, currentTime)
          if (lastPos) {
            const match = this.colorTracker.findBestMatch(
              at.videoElement, lastPos.x, lastPos.y, at.template,
              at.canvasW, at.canvasH
            )
            if (match) {
              at.lastConfidence = match.confidence
              if (match.confidence > 0.4) {
                this.addKeyframe(state.id, { time: currentTime, x: match.x, y: match.y })
              } else {
                at.paused = true
              }
              // Update shadow color based on confidence
              this.updateConfidenceIndicator(state, match.confidence)
            }
          }
          at.lastProcessedTime = currentTime
        }
      }

      const pos = this.getPositionAtTime(state.id, currentTime)
      if (!pos) return

      const { marker, options } = state
      const radius = options.radius || 25

      // Update marker position
      if (marker instanceof fabric.Group) {
        marker.set({ left: pos.x, top: pos.y })
      } else {
        marker.set({ left: pos.x - radius, top: pos.y - radius })
      }

      // Update crosshairs
      const crossH = (marker as any).crossH as fabric.Line
      const crossV = (marker as any).crossV as fabric.Line
      const crossSize = radius * 0.5

      if (crossH && crossV) {
        crossH.set({
          x1: pos.x - crossSize,
          y1: pos.y,
          x2: pos.x + crossSize,
          y2: pos.y,
        })
        crossV.set({
          x1: pos.x,
          y1: pos.y - crossSize,
          x2: pos.x,
          y2: pos.y + crossSize,
        })
      }

      // Update trail
      if (options.showTrail) {
        this.updateTrail(state, currentTime)
      }
    })

    this.canvas.renderAll()
  }

  // Update the tracker's glow color to indicate confidence
  private updateConfidenceIndicator(state: TrackerState, confidence: number) {
    const marker = state.marker
    let shadowColor: string

    if (confidence > 0.7) {
      shadowColor = '#22c55e' // green
    } else if (confidence > 0.4) {
      shadowColor = '#eab308' // yellow
    } else {
      shadowColor = '#ef4444' // red
    }

    if (marker instanceof fabric.Group) {
      const objects = (marker as any)._objects || []
      for (const obj of objects) {
        if (obj.shadow) {
          obj.shadow.color = shadowColor
        }
      }
    } else if ((marker as any).shadow) {
      ;(marker as any).shadow.color = shadowColor
    }
  }

  private updateTrail(state: TrackerState, currentTime: number) {
    const { keyframes, options, trail } = state
    const trailLength = options.trailLength || 10
    const color = options.color || '#ff0000'

    // Remove old trail
    trail.forEach((line) => this.canvas.remove(line))
    state.trail = []

    // Find keyframes before current time for trail
    const pastKeyframes = keyframes.filter((k) => k.time <= currentTime).slice(-trailLength)

    if (pastKeyframes.length < 2) return

    // Draw trail lines with fading opacity
    for (let i = 0; i < pastKeyframes.length - 1; i++) {
      const opacity = (i + 1) / pastKeyframes.length * 0.5
      const line = new fabric.Line([
        pastKeyframes[i].x,
        pastKeyframes[i].y,
        pastKeyframes[i + 1].x,
        pastKeyframes[i + 1].y,
      ], {
        stroke: color,
        strokeWidth: 2,
        opacity: opacity,
        selectable: false,
        evented: false,
      })

      this.canvas.add(line)
      state.trail.push(line)
    }

    // Send trail to back
    state.trail.forEach((line) => this.canvas.sendToBack(line))
  }

  remove(id: string) {
    const state = this.trackers.get(id)
    if (!state) return

    this.canvas.remove(state.marker)

    const crossH = (state.marker as any).crossH
    const crossV = (state.marker as any).crossV
    if (crossH) this.canvas.remove(crossH)
    if (crossV) this.canvas.remove(crossV)

    state.trail.forEach((line) => this.canvas.remove(line))

    this.trackers.delete(id)
  }

  removeAll() {
    this.trackers.forEach((state) => {
      this.canvas.remove(state.marker)
      const crossH = (state.marker as any).crossH
      const crossV = (state.marker as any).crossV
      if (crossH) this.canvas.remove(crossH)
      if (crossV) this.canvas.remove(crossV)
      state.trail.forEach((line) => this.canvas.remove(line))
    })
    this.trackers.clear()
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

// Simple tracker marker without keyframe support
export function createTrackerMarker(
  canvas: fabric.Canvas,
  x: number,
  y: number,
  radius: number = 25,
  color: string = '#ff0000'
): fabric.Circle {
  const marker = new fabric.Circle({
    left: x - radius,
    top: y - radius,
    radius: radius,
    fill: 'transparent',
    stroke: color,
    strokeWidth: 3,
    selectable: true,
    evented: true,
  })

  canvas.add(marker)
  return marker
}
