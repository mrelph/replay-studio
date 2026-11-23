import { fabric } from '@/lib/fabric'

export type RevealKind = 'stroke' | 'arrow' | 'none'

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

function revealStroke(object: fabric.Object, fraction: number): void {
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
  object.strokeDashArray = [length, length]
  object.strokeDashOffset = length * (1 - Math.max(0, fraction))
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

function arrowParts(object: fabric.Object): [fabric.Object, fabric.Object] | null {
  if (!(object instanceof fabric.Group)) return null
  const items = object.getObjects()
  return items.length === 2 ? [items[0], items[1]] : null
}

function revealArrow(group: fabric.Object, parts: [fabric.Object, fabric.Object], fraction: number): void {
  const [shaft, head] = parts
  if (fraction >= 1) {
    restoreStroke(shaft)
    restoreHead(head)
    group.dirty = true
    return
  }
  revealStroke(shaft, Math.min(1, fraction / HEAD_START))
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

export function applyReveal(object: fabric.Object, toolType: string, fraction: number): void {
  const kind = revealKind(toolType)
  if (kind === 'stroke') {
    revealStroke(object, fraction)
  } else if (kind === 'arrow') {
    const parts = arrowParts(object)
    if (parts) revealArrow(object, parts, fraction)
  }
}

export function stripReveal(object: fabric.Object): void {
  restoreStroke(object)
  const parts = arrowParts(object)
  if (parts) {
    restoreStroke(parts[0])
    restoreHead(parts[1])
    object.dirty = true
  }
}
