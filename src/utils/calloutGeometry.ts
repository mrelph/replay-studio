import { fabric } from '@/lib/fabric'
import { plateRect } from '@/lib/textPlate'
import type { ToolPoint } from '@/components/Canvas/tools/types'

/** Pointer travel below this is a click, which places the label at CALLOUT_CLICK_OFFSET from the target. */
export const CALLOUT_DRAG_MIN = 8
export const CALLOUT_CLICK_OFFSET = { x: 80, y: -80 }

export function calloutDotRadius(strokeWidth: number): number {
  return Math.max(3, 1.5 * strokeWidth)
}

export interface Box { left: number; top: number; width: number; height: number }

/** The label's plate box: the text box grown by the plate's padding (same numbers as src/lib/textPlate.ts). */
export function plateBox(textBox: Box, fontSize: number): Box {
  const r = plateRect(textBox.width, textBox.height, fontSize)
  return {
    left: textBox.left + textBox.width / 2 + r.x,
    top: textBox.top + textBox.height / 2 + r.y,
    width: r.width,
    height: r.height,
  }
}

/** Where the leader meets the label: the point of the box's edge nearest to `target`. */
export function leaderEnd(target: ToolPoint, box: Box): ToolPoint {
  const right = box.left + box.width
  const bottom = box.top + box.height
  const x = Math.min(Math.max(target.x, box.left), right)
  const y = Math.min(Math.max(target.y, box.top), bottom)
  if (x !== target.x || y !== target.y) return { x, y }
  // Inside the box: out through the nearest side.
  const sides = [
    { d: target.x - box.left, p: { x: box.left, y: target.y } },
    { d: right - target.x, p: { x: right, y: target.y } },
    { d: target.y - box.top, p: { x: target.x, y: box.top } },
    { d: bottom - target.y, p: { x: target.x, y: bottom } },
  ]
  return sides.reduce((best, side) => (side.d < best.d ? side : best)).p
}

export function labelPosition(target: ToolPoint, release: ToolPoint): ToolPoint {
  if (Math.hypot(release.x - target.x, release.y - target.y) >= CALLOUT_DRAG_MIN) return { x: release.x, y: release.y }
  return { x: target.x + CALLOUT_CLICK_OFFSET.x, y: target.y + CALLOUT_CLICK_OFFSET.y }
}

/**
 * Moves the label position out along the axis facing the target (the one the
 * release is further along) until the plate, padded around the text, clears
 * the dot by its radius. A label already that far away is left where it is.
 */
export function labelClearOfDot(target: ToolPoint, at: ToolPoint, fontSize: number, dotRadius: number): ToolPoint {
  const pad = plateRect(0, 0, fontSize)
  const dx = at.x - target.x
  const dy = at.y - target.y
  if (Math.abs(dx) > Math.abs(dy)) {
    const min = -pad.x + dotRadius
    return { x: dx < 0 ? Math.min(at.x, target.x - min) : Math.max(at.x, target.x + min), y: at.y }
  }
  const min = -pad.y + dotRadius
  return { x: at.x, y: dy < 0 ? Math.min(at.y, target.y - min) : Math.max(at.y, target.y + min) }
}

/** The label's corner nearest the target sits at the label position, so the text grows away from the target as it is typed. */
export function labelOrigin(target: ToolPoint, at: ToolPoint): { originX: 'left' | 'right'; originY: 'top' | 'bottom' } {
  return { originX: at.x < target.x ? 'right' : 'left', originY: at.y < target.y ? 'bottom' : 'top' }
}

export function calloutParts(object: fabric.Object): { dot: fabric.Object; leader: fabric.Object; label: fabric.Object } | null {
  if (!(object instanceof fabric.Group)) return null
  const items = object.getObjects()
  return items.length === 3 ? { dot: items[0], leader: items[1], label: items[2] } : null
}

/**
 * Settings Fabric does not save, re-set on an object rebuilt from data (project
 * load, undo/redo, export clone). A callout's plate is drawn outside its label's
 * box, so a cached group would clip it.
 */
export function prepareRebuiltObject(object: fabric.Object, toolType: string): void {
  if (toolType === 'callout') object.objectCaching = false
}
