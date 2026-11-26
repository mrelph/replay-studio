import { fabric } from '@/lib/fabric'
import { restyleObject, type AnnotationStyle } from '@/utils/annotationStyle'
import { buildSurfaceShape, withAlpha } from '@/utils/surfaceShape'
import { ZONE_FILL_ALPHA, ZONE_MIN_CORNERS, zoneClick, zoneKey, zonePathData } from '@/utils/zoneGeometry'
import type { CanvasTool, ToolContext, ToolPoint } from './types'

export interface ZoneOptions {
  points: ToolPoint[]
  color: string
  strokeWidth: number
  style: AnnotationStyle
}

/** A path centred on its corners' bounding box, so a stroked and an unstroked copy land on the same spot. */
function cornerPath(d: string, points: ToolPoint[], options: fabric.IPathOptions): fabric.Path {
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  return new fabric.Path(d, {
    left: (Math.min(...xs) + Math.max(...xs)) / 2,
    top: (Math.min(...ys) + Math.max(...ys)) / 2,
    originX: 'center',
    originY: 'center',
    ...options,
  })
}

/** A zone: translucent fill path under an outline path, both closed through the corners. */
export function buildZone({ points, color, strokeWidth, style }: ZoneOptions): fabric.Group {
  const d = zonePathData(points)
  const fill = cornerPath(d, points, { fill: withAlpha(color, ZONE_FILL_ALPHA), strokeWidth: 0 })
  const outline = cornerPath(d, points, { fill: 'transparent', stroke: color, strokeWidth, strokeLineJoin: 'round' })
  const zone = buildSurfaceShape(fill, outline)
  restyleObject(zone, 'zone', style)
  return zone
}

/** Preview objects are never picked, saved or snapshotted (snapshots keep only objects tagged with an annotation id). */
const PREVIEW_PROPS = { selectable: false, evented: false, excludeFromExport: true }

/** A disposed Fabric canvas has no drawing context; touching its objects would schedule a render that throws. */
const isLive = (canvas: fabric.Canvas) => Boolean(canvas.getContext())

export function createZoneTool(): CanvasTool {
  let points: ToolPoint[] = []
  let pointer: ToolPoint | null = null
  // The canvas the corners were placed on; a different one means the old gesture is gone.
  let canvas: fabric.Canvas | null = null
  let preview: fabric.Object[] = []

  const removePreview = () => {
    if (canvas && isLive(canvas) && preview.length > 0) {
      const target = canvas
      preview.forEach((object) => target.remove(object))
      target.requestRenderAll()
    }
    preview = []
  }

  const reset = () => {
    removePreview()
    points = []
    pointer = null
    canvas = null
  }

  const draw = (ctx: ToolContext) => {
    removePreview()
    if (!canvas || !isLive(canvas)) return
    const { color, strokeWidth } = ctx
    const objects: fabric.Object[] = []
    if (points.length >= ZONE_MIN_CORNERS) {
      objects.push(cornerPath(zonePathData(points), points, { fill: withAlpha(color, ZONE_FILL_ALPHA), strokeWidth: 0 }))
    }
    if (points.length >= 2) {
      const open = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
      objects.push(cornerPath(open, points, { fill: '', stroke: color, strokeWidth, strokeLineJoin: 'round', strokeLineCap: 'round' }))
    }
    const last = points[points.length - 1]
    if (pointer && (pointer.x !== last.x || pointer.y !== last.y)) {
      objects.push(new fabric.Line([last.x, last.y, pointer.x, pointer.y], {
        stroke: color,
        strokeWidth: Math.max(1, strokeWidth / 2),
        strokeDashArray: [6, 4],
      }))
    }
    // The first corner, so it's clear where to click to close the zone.
    objects.push(new fabric.Circle({
      left: points[0].x,
      top: points[0].y,
      originX: 'center',
      originY: 'center',
      radius: Math.max(4, strokeWidth),
      fill: color,
      strokeWidth: 0,
    }))
    const target = canvas
    preview = objects
    preview.forEach((object) => {
      object.set(PREVIEW_PROPS)
      target.add(object)
    })
    target.requestRenderAll()
  }

  const finish = (ctx: ToolContext) => {
    if (points.length < ZONE_MIN_CORNERS) {
      reset()
      return
    }
    const zone = buildZone({ points, color: ctx.color, strokeWidth: ctx.strokeWidth, style: ctx.style })
    reset()
    ctx.commit(zone, 'zone')
  }

  return {
    onDown(ctx, p) {
      if (canvas && canvas !== ctx.canvas) reset()
      const click = zoneClick(points, p, ctx.canvas.getZoom())
      if (click.type === 'finish') {
        finish(ctx)
        return
      }
      if (click.type === 'ignore') return
      if (points.length === 0) canvas = ctx.canvas
      points = [...points, click.point]
      pointer = click.point
      draw(ctx)
    },
    onMove(ctx, p) {
      if (points.length === 0 || canvas !== ctx.canvas) return
      pointer = { x: p.x, y: p.y }
      draw(ctx)
    },
    onDoubleClick(ctx) {
      if (points.length > 0) finish(ctx)
    },
    onKey(ctx, e) {
      // Menu accelerators (Save, Open, Export, Quit) only see keys the page leaves alone.
      if (e.metaKey || e.ctrlKey) return false
      const action = zoneKey(points.length, e.key)
      if (action === 'finish') finish(ctx)
      else if (action === 'cancel') reset()
      else if (action === 'undo-corner') {
        points = points.slice(0, -1)
        if (points.length === 0) reset()
        else draw(ctx)
      }
      return action !== 'pass'
    },
    cancel() {
      reset()
    },
    isBusy() {
      return points.length > 0
    },
  }
}

export const zoneTool = createZoneTool()
