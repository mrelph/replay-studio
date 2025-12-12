import { Canvas, Circle, Group } from 'fabric'

export interface MagnifierOptions {
  x: number
  y: number
  radius: number
  zoomLevel?: number
  borderColor?: string
  borderWidth?: number
}

export class MagnifierTool {
  private canvas: Canvas
  private videoElement: HTMLVideoElement | null = null
  private magnifierGroup: Group | null = null
  private zoomCanvas: HTMLCanvasElement | null = null
  private animationFrame: number | null = null

  constructor(canvas: Canvas, videoElement?: HTMLVideoElement) {
    this.canvas = canvas
    this.videoElement = videoElement || null
  }

  setVideoElement(video: HTMLVideoElement) {
    this.videoElement = video
  }

  create(options: MagnifierOptions): Group {
    const {
      x,
      y,
      radius,
      zoomLevel = 2,
      borderColor = '#00d4ff',
      borderWidth = 4,
    } = options

    // Create off-screen canvas for magnified content
    this.zoomCanvas = document.createElement('canvas')
    this.zoomCanvas.width = radius * 2
    this.zoomCanvas.height = radius * 2

    // Create the magnifier lens (circular border)
    const lens = new Circle({
      left: 0,
      top: 0,
      radius: radius,
      fill: 'transparent',
      stroke: borderColor,
      strokeWidth: borderWidth,
      originX: 'center',
      originY: 'center',
    })

    // Create crosshairs
    const crosshairH = new (require('fabric').Line)(
      [-radius * 0.3, 0, radius * 0.3, 0],
      {
        stroke: borderColor,
        strokeWidth: 2,
        originX: 'center',
        originY: 'center',
      }
    )

    const crosshairV = new (require('fabric').Line)(
      [0, -radius * 0.3, 0, radius * 0.3],
      {
        stroke: borderColor,
        strokeWidth: 2,
        originX: 'center',
        originY: 'center',
      }
    )

    // Group all elements
    this.magnifierGroup = new Group([lens, crosshairH, crosshairV], {
      left: x,
      top: y,
      originX: 'center',
      originY: 'center',
      selectable: true,
      evented: true,
    })

    // Store zoom level in the group for later use
    ;(this.magnifierGroup as any).zoomLevel = zoomLevel
    ;(this.magnifierGroup as any).magnifierRadius = radius

    this.canvas.add(this.magnifierGroup)

    return this.magnifierGroup
  }

  // Start updating the magnified view (call this when video is playing)
  startUpdating() {
    if (!this.videoElement || !this.magnifierGroup) return

    const update = () => {
      this.updateMagnifiedView()
      this.animationFrame = requestAnimationFrame(update)
    }
    update()
  }

  stopUpdating() {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame)
      this.animationFrame = null
    }
  }

  private updateMagnifiedView() {
    if (!this.videoElement || !this.magnifierGroup || !this.zoomCanvas) return

    const ctx = this.zoomCanvas.getContext('2d')
    if (!ctx) return

    const group = this.magnifierGroup
    const center = group.getCenterPoint()
    const zoomLevel = (group as any).zoomLevel || 2
    const radius = (group as any).magnifierRadius || 50

    // Calculate the source rectangle from the video
    const videoScaleX = this.videoElement.videoWidth / this.canvas.width!
    const videoScaleY = this.videoElement.videoHeight / this.canvas.height!

    const sourceX = (center.x - radius / zoomLevel) * videoScaleX
    const sourceY = (center.y - radius / zoomLevel) * videoScaleY
    const sourceWidth = (radius * 2) / zoomLevel * videoScaleX
    const sourceHeight = (radius * 2) / zoomLevel * videoScaleY

    // Clear and draw magnified portion
    ctx.clearRect(0, 0, radius * 2, radius * 2)

    // Create circular clip
    ctx.save()
    ctx.beginPath()
    ctx.arc(radius, radius, radius - 2, 0, Math.PI * 2)
    ctx.clip()

    // Draw the magnified video portion
    ctx.drawImage(
      this.videoElement,
      sourceX,
      sourceY,
      sourceWidth,
      sourceHeight,
      0,
      0,
      radius * 2,
      radius * 2
    )

    ctx.restore()
  }

  remove() {
    this.stopUpdating()
    if (this.magnifierGroup) {
      this.canvas.remove(this.magnifierGroup)
      this.magnifierGroup = null
    }
    this.zoomCanvas = null
  }

  getGroup() {
    return this.magnifierGroup
  }
}

// Simple magnifier marker (visual indicator without live zoom)
export function createMagnifierMarker(
  canvas: Canvas,
  x: number,
  y: number,
  radius: number,
  color: string = '#00d4ff'
): Circle {
  const marker = new Circle({
    left: x - radius,
    top: y - radius,
    radius: radius,
    fill: 'rgba(0, 212, 255, 0.15)',
    stroke: color,
    strokeWidth: 3,
    selectable: true,
    evented: true,
  })

  // Add a "+" indicator
  const plusSize = radius * 0.4
  const plusH = new (require('fabric').Line)(
    [x - plusSize, y, x + plusSize, y],
    { stroke: color, strokeWidth: 2 }
  )
  const plusV = new (require('fabric').Line)(
    [x, y - plusSize, x, y + plusSize],
    { stroke: color, strokeWidth: 2 }
  )

  canvas.add(marker)
  canvas.add(plusH)
  canvas.add(plusV)

  return marker
}
