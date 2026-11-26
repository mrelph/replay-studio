import { fabric } from '@/lib/fabric'
import { restyleObject, type AnnotationStyle } from '@/utils/annotationStyle'
import { buildSurfaceShape, withAlpha } from '@/utils/surfaceShape'
import { RING_CLICK_RX, RING_FILL_ALPHA, RING_FLATTEN, ringRadii } from '@/utils/ringGeometry'
import type { CanvasTool, ToolContext, ToolPoint } from './types'

/** Pointer travel below this is a click, which places a ring of RING_CLICK_RX. */
const CLICK_SLOP = 4

export interface RingOptions {
  center: ToolPoint
  rx: number
  ry: number
  color: string
  strokeWidth: number
  style: AnnotationStyle
}

/** A floor ring: translucent fill ellipse under an outline ellipse, both centred on `center`. */
export function buildRing({ center, rx, ry, color, strokeWidth, style }: RingOptions): fabric.Group {
  const fill = new fabric.Ellipse({
    left: center.x,
    top: center.y,
    originX: 'center',
    originY: 'center',
    rx,
    ry,
    fill: withAlpha(color, RING_FILL_ALPHA),
    strokeWidth: 0,
  })
  const outline = new fabric.Ellipse({
    left: center.x,
    top: center.y,
    originX: 'center',
    originY: 'center',
    rx,
    ry,
    fill: 'transparent',
    stroke: color,
    strokeWidth,
  })
  const ring = buildSurfaceShape(fill, outline)
  restyleObject(ring, 'ring', style)
  return ring
}

export function createRingTool(): CanvasTool {
  let center: ToolPoint | null = null
  let preview: fabric.Group | null = null
  let dragged = false

  const ringAt = (ctx: ToolContext, rx: number, ry: number, interactive: boolean) => {
    const ring = buildRing({ center: center as ToolPoint, rx, ry, color: ctx.color, strokeWidth: ctx.strokeWidth, style: ctx.style })
    ring.set({ selectable: interactive, evented: interactive })
    return ring
  }

  const showPreview = (ctx: ToolContext, pointer: ToolPoint) => {
    if (preview) ctx.canvas.remove(preview)
    const { rx, ry } = ringRadii(center as ToolPoint, pointer)
    preview = ringAt(ctx, rx, ry, false)
    ctx.canvas.add(preview)
    ctx.canvas.requestRenderAll()
  }

  const clear = (ctx: ToolContext) => {
    if (preview) ctx.canvas.remove(preview)
    preview = null
    center = null
    dragged = false
  }

  return {
    onDown(ctx, p) {
      clear(ctx)
      center = { x: p.x, y: p.y }
      showPreview(ctx, p)
    },
    onMove(ctx, p) {
      if (!center) return
      if (Math.hypot(p.x - center.x, p.y - center.y) >= CLICK_SLOP) dragged = true
      showPreview(ctx, p)
    },
    onUp(ctx, p) {
      if (!center) return
      if (Math.hypot(p.x - center.x, p.y - center.y) >= CLICK_SLOP) dragged = true
      const { rx, ry } = dragged ? ringRadii(center, p) : { rx: RING_CLICK_RX, ry: RING_CLICK_RX / RING_FLATTEN }
      const ring = ringAt(ctx, rx, ry, true)
      clear(ctx)
      ctx.commit(ring, 'ring')
    },
    cancel(ctx) {
      clear(ctx)
      ctx.canvas.requestRenderAll()
    },
    isBusy() {
      return center !== null
    },
  }
}

export const ringTool = createRingTool()
