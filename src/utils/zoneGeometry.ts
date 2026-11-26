import type { ToolPoint } from '@/components/Canvas/tools/types'

export const ZONE_FILL_ALPHA = 0.25, ZONE_CLOSE_PX = 10, ZONE_MIN_CORNERS = 3, ZONE_DUPLICATE_PX = 2

/** A closed path through the corners: 'M 10 10 L 50 10 L 50 40 Z'. */
export function zonePathData(points: ToolPoint[]): string {
  return `${points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')} Z`
}

export type ZoneClick = { type: 'add'; point: ToolPoint } | { type: 'finish' } | { type: 'ignore' }

const distance = (a: ToolPoint, b: ToolPoint) => Math.hypot(a.x - b.x, a.y - b.y)

/** A click near the first corner (with ≥ 3 corners) finishes; a click within ZONE_DUPLICATE_PX of the last corner is ignored (double-click's second click). */
export function zoneClick(points: ToolPoint[], point: ToolPoint): ZoneClick {
  if (points.length >= ZONE_MIN_CORNERS && distance(points[0], point) <= ZONE_CLOSE_PX) return { type: 'finish' }
  if (points.length > 0 && distance(points[points.length - 1], point) <= ZONE_DUPLICATE_PX) return { type: 'ignore' }
  return { type: 'add', point }
}

export type ZoneKey = 'finish' | 'cancel' | 'undo-corner' | 'swallow' | 'pass'

/** With no corners every key passes. With corners: Enter → finish, Escape → cancel, Backspace/Delete → undo-corner, any other key → swallow. */
export function zoneKey(cornerCount: number, key: string): ZoneKey {
  if (cornerCount === 0) return 'pass'
  if (key === 'Enter') return 'finish'
  if (key === 'Escape') return 'cancel'
  if (key === 'Backspace' || key === 'Delete') return 'undo-corner'
  return 'swallow'
}
