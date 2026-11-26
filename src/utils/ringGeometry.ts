import type { ToolPoint } from '@/components/Canvas/tools/types'

export const RING_FLATTEN = 2.5
export const RING_FILL_ALPHA = 0.18
export const RING_MIN_RX = 12
export const RING_CLICK_RX = 40

/** Horizontal radius is the pointer's distance from the centre (at least RING_MIN_RX); the ring is flattened into a floor ellipse. */
export function ringRadii(center: ToolPoint, pointer: ToolPoint): { rx: number; ry: number } {
  const rx = Math.max(RING_MIN_RX, Math.hypot(pointer.x - center.x, pointer.y - center.y))
  return { rx, ry: rx / RING_FLATTEN }
}
