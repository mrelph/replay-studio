import fabricModule from 'fabric'

// Handle CommonJS/ESM interop - fabric exports { fabric: ... } structure
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fabric: any = (fabricModule as any).fabric || fabricModule

export interface SpotlightOptions {
  x: number
  y: number
  radiusX: number
  radiusY: number
  dimOpacity?: number
}

export class SpotlightTool {
  private canvas: fabric.Canvas
  private overlay: fabric.Rect | null = null
  private spotlight: fabric.Ellipse | null = null
  private clipPath: fabric.Ellipse | null = null

  constructor(canvas: fabric.Canvas) {
    this.canvas = canvas
  }

  create(options: SpotlightOptions): { overlay: fabric.Rect; spotlight: fabric.Ellipse } {
    const { x, y, radiusX, radiusY, dimOpacity = 0.7 } = options

    // Create the dark overlay that covers everything
    this.overlay = new fabric.Rect({
      left: 0,
      top: 0,
      width: this.canvas.width,
      height: this.canvas.height,
      fill: `rgba(0, 0, 0, ${dimOpacity})`,
      selectable: false,
      evented: false,
      excludeFromExport: false,
    })

    // Create the spotlight ellipse (the visible hole)
    this.spotlight = new fabric.Ellipse({
      left: x - radiusX,
      top: y - radiusY,
      rx: radiusX,
      ry: radiusY,
      fill: 'transparent',
      stroke: '#ffff00',
      strokeWidth: 3,
      strokeDashArray: [5, 5],
      selectable: true,
      evented: true,
    })

    // Create clip path for the overlay (inverted spotlight)
    this.clipPath = new fabric.Ellipse({
      left: x,
      top: y,
      rx: radiusX,
      ry: radiusY,
      absolutePositioned: true,
      inverted: true,
    })

    this.overlay.set('clipPath', this.clipPath)

    this.canvas.add(this.overlay)
    this.canvas.add(this.spotlight)

    // Sync spotlight movement with clip path
    this.spotlight.on('moving', () => this.syncClipPath())
    this.spotlight.on('scaling', () => this.syncClipPath())
    this.spotlight.on('modified', () => this.syncClipPath())

    return { overlay: this.overlay, spotlight: this.spotlight }
  }

  private syncClipPath() {
    if (!this.spotlight || !this.clipPath || !this.overlay) return

    const center = this.spotlight.getCenterPoint()
    const scaleX = this.spotlight.scaleX || 1
    const scaleY = this.spotlight.scaleY || 1

    this.clipPath.set({
      left: center.x,
      top: center.y,
      rx: (this.spotlight.rx || 50) * scaleX,
      ry: (this.spotlight.ry || 50) * scaleY,
    })

    this.overlay.set('clipPath', this.clipPath)
    this.canvas.renderAll()
  }

  updatePosition(x: number, y: number) {
    if (!this.spotlight) return

    this.spotlight.set({
      left: x - (this.spotlight.rx || 50),
      top: y - (this.spotlight.ry || 50),
    })
    this.syncClipPath()
  }

  updateSize(radiusX: number, radiusY: number) {
    if (!this.spotlight) return

    this.spotlight.set({ rx: radiusX, ry: radiusY })
    this.syncClipPath()
  }

  remove() {
    if (this.overlay) {
      this.canvas.remove(this.overlay)
      this.overlay = null
    }
    if (this.spotlight) {
      this.canvas.remove(this.spotlight)
      this.spotlight = null
    }
    this.clipPath = null
  }

  getObjects() {
    return {
      overlay: this.overlay,
      spotlight: this.spotlight,
    }
  }
}

export function createSimpleSpotlight(
  canvas: fabric.Canvas,
  x: number,
  y: number,
  rx: number,
  ry: number
): fabric.Ellipse {
  // Simple spotlight without the full overlay effect
  // Uses a semi-transparent yellow fill to highlight
  const spotlight = new fabric.Ellipse({
    left: x - rx,
    top: y - ry,
    rx,
    ry,
    fill: 'rgba(255, 255, 0, 0.2)',
    stroke: '#ffff00',
    strokeWidth: 3,
    selectable: true,
    evented: true,
  })

  canvas.add(spotlight)
  return spotlight
}
