import { fabric } from '@/lib/fabric'
import { surfaceParts } from '@/utils/surfaceShape'
import { dashPattern, revealDashArray } from '@/utils/lineDash'

export type RevealKind = 'stroke' | 'arrow' | 'ring' | 'callout' | 'none'

const HEAD_START = 0.85

interface StrokeOriginals {
  strokeDashArray: number[] | undefined
  strokeDashOffset: number | undefined
}

interface HeadOriginals {
  scaleX: number | undefined
  scaleY: number | undefined
  visible: boolean | undefined
}

const strokeOriginals = new WeakMap<fabric.Object, StrokeOriginals>()
const headOriginals = new WeakMap<fabric.Object, HeadOriginals>()
const fillOriginals = new WeakMap<fabric.Object, number | undefined>()

type PathSegmentsInfo = (path: unknown) => Array<{ length: number }>

export function revealKind(toolType: string): RevealKind {
  switch (toolType) {
    case 'pen':
    case 'path':
    case 'line':
    case 'rectangle':
    case 'circle':
      return 'stroke'
    case 'arrow':
    case 'arc-arrow':
      return 'arrow'
    case 'ring':
      return 'ring'
    case 'callout':
      return 'callout'
    default:
      return 'none'
  }
}

export function strokeLength(object: fabric.Object): number {
  if (object instanceof fabric.Path) {
    const getInfo = (fabric.util as unknown as { getPathSegmentsInfo: PathSegmentsInfo }).getPathSegmentsInfo
    const info = getInfo(object.path)
    return info.length ? info[info.length - 1].length : 0
  }
  if (object instanceof fabric.Line) {
    return Math.hypot((object.x2 ?? 0) - (object.x1 ?? 0), (object.y2 ?? 0) - (object.y1 ?? 0))
  }
  if (object instanceof fabric.Ellipse) {
    const rx = object.rx ?? 0
    const ry = object.ry ?? 0
    const h = ((rx - ry) / (rx + ry)) ** 2
    return Math.PI * (rx + ry) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)))
  }
  if (object instanceof fabric.Circle) {
    return 2 * Math.PI * (object.radius ?? 0)
  }
  if (object instanceof fabric.Rect) {
    return 2 * ((object.width ?? 0) + (object.height ?? 0))
  }
  return 0
}

function restoreStroke(object: fabric.Object): void {
  const original = strokeOriginals.get(object)
  if (!original) return
  object.strokeDashArray = original.strokeDashArray
  object.strokeDashOffset = original.strokeDashOffset
  strokeOriginals.delete(object)
  object.dirty = true
}

/**
 * With strokeUniform, Fabric strokes (and dashes) after undoing the object's
 * scale, so a dash array is in screen units rather than the object's own.
 * Exact for a line; for a path under non-uniform scaling the larger scale is
 * used, so the trailing gap always covers the whole stroke.
 */
function dashUnitScale(object: fabric.Object): number {
  if (!object.strokeUniform) return 1
  const { scaleX, scaleY } = object.getObjectScaling()
  if (object instanceof fabric.Line) {
    const dx = (object.x2 ?? 0) - (object.x1 ?? 0)
    const dy = (object.y2 ?? 0) - (object.y1 ?? 0)
    const local = Math.hypot(dx, dy)
    if (local > 0) return Math.hypot(dx * scaleX, dy * scaleY) / local
  }
  return Math.max(scaleX, scaleY)
}

function revealStroke(object: fabric.Object, fraction: number, dashed = false): void {
  if (fraction >= 1) {
    restoreStroke(object)
    return
  }
  const length = strokeLength(object)
  if (length <= 0) return
  if (!strokeOriginals.has(object)) {
    strokeOriginals.set(object, {
      strokeDashArray: object.strokeDashArray,
      strokeDashOffset: object.strokeDashOffset,
    })
  }
  if (dashed) {
    object.strokeDashArray = revealDashArray(dashPattern(object.strokeWidth ?? 1), length * dashUnitScale(object), Math.max(0, fraction))
    object.strokeDashOffset = 0
  } else {
    object.strokeDashArray = [length, length]
    object.strokeDashOffset = length * (1 - Math.max(0, fraction))
  }
  object.dirty = true
}

function restoreHead(head: fabric.Object): void {
  const original = headOriginals.get(head)
  if (!original) return
  head.scaleX = original.scaleX
  head.scaleY = original.scaleY
  head.visible = original.visible as boolean
  headOriginals.delete(head)
  head.dirty = true
}

function restoreFill(fill: fabric.Object): void {
  if (!fillOriginals.has(fill)) return
  fill.opacity = fillOriginals.get(fill)
  fillOriginals.delete(fill)
  fill.dirty = true
}

/** Outline draws around its edge over the first 0.85; the fill fades up from 0 to its own opacity over the rest. */
function revealRing(group: fabric.Object, fraction: number): void {
  const parts = surfaceParts(group)
  if (!parts) return
  const { fill, outline } = parts
  if (fraction >= 1) {
    restoreStroke(outline)
    restoreFill(fill)
    group.dirty = true
    return
  }
  revealStroke(outline, Math.min(1, fraction / HEAD_START))
  if (!fillOriginals.has(fill)) fillOriginals.set(fill, fill.opacity)
  const original = fillOriginals.get(fill) ?? 1
  fill.opacity = fraction < HEAD_START ? 0 : original * ((fraction - HEAD_START) / (1 - HEAD_START))
  fill.dirty = true
  group.dirty = true
}

function arrowParts(object: fabric.Object): [fabric.Object, fabric.Object] | null {
  if (!(object instanceof fabric.Group)) return null
  const items = object.getObjects()
  return items.length === 2 ? [items[0], items[1]] : null
}

function revealArrow(group: fabric.Object, parts: [fabric.Object, fabric.Object], fraction: number, dashed: boolean): void {
  const [shaft, head] = parts
  if (fraction >= 1) {
    restoreStroke(shaft)
    restoreHead(head)
    group.dirty = true
    return
  }
  revealStroke(shaft, Math.min(1, fraction / HEAD_START), dashed)
  if (!headOriginals.has(head)) {
    headOriginals.set(head, { scaleX: head.scaleX, scaleY: head.scaleY, visible: head.visible })
  }
  const original = headOriginals.get(head) as HeadOriginals
  if (fraction < HEAD_START) {
    head.visible = false
  } else {
    const t = (fraction - HEAD_START) / (1 - HEAD_START)
    head.visible = true
    head.scaleX = (original.scaleX ?? 1) * t
    head.scaleY = (original.scaleY ?? 1) * t
  }
  head.dirty = true
  group.dirty = true
}

export function applyReveal(object: fabric.Object, toolType: string, fraction: number, opts?: { dashed?: boolean }): void {
  const kind = revealKind(toolType)
  const dashed = opts?.dashed === true
  if (kind === 'stroke') {
    revealStroke(object, fraction, dashed)
  } else if (kind === 'arrow') {
    const parts = arrowParts(object)
    if (parts) revealArrow(object, parts, fraction, dashed)
  } else if (kind === 'ring') {
    revealRing(object, fraction)
  }
}

/** Restores whatever a reveal saved on the object and its children; anything it did not touch is left alone. */
export function stripReveal(object: fabric.Object): void {
  restoreStroke(object)
  if (object instanceof fabric.Group) {
    object.getObjects().forEach((child) => {
      restoreStroke(child)
      restoreHead(child)
      restoreFill(child)
    })
    object.dirty = true
  }
}
