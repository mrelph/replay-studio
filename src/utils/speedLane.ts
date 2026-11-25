import { RAMP_SOURCE_SECONDS } from '@/export/speedMap'
import { snapTime, frameWithin } from './timelineSnap'
import { MIN_REGION_FRAMES, normalizeRegion, type SpeedRegion } from './speedRegions'

export interface SpeedDragContext {
  duration: number
  fps: number
  playhead: number
  pxPerSecond: number
  /** Alt held: no playhead snap (whole frames still apply). */
  free: boolean
}

/**
 * The region a drag turns `origin` into, with the pointer at `pointerTime`
 * (`grabOffset` is how far into the region a body drag grabbed it). Edges land
 * on whole frames and the region never gets shorter than MIN_REGION_FRAMES.
 */
export function dragSpeedRegion(
  origin: SpeedRegion,
  edge: 'move' | 'start' | 'end',
  pointerTime: number,
  grabOffset: number,
  ctx: SpeedDragContext,
): SpeedRegion {
  const { duration, fps } = ctx
  const snap = (t: number) => snapTime(t, [ctx.playhead], ctx.pxPerSecond, fps, ctx.free)
  const minLength = MIN_REGION_FRAMES / fps
  const length = origin.end - origin.start

  let start = origin.start
  let end = origin.end
  if (edge === 'move') {
    start = frameWithin(snap(pointerTime - grabOffset), 0, duration - length, fps, true)
    end = start + length
  } else if (edge === 'start') {
    start = frameWithin(snap(pointerTime), 0, origin.end - minLength, fps, true)
  } else {
    end = frameWithin(snap(pointerTime), origin.start + minLength, duration, fps, true)
  }

  return normalizeRegion({ ...origin, start, end }, duration, fps) ?? origin
}

/** Share of a region's width, per end, covered by the speed ramp (each ramp takes at most half). */
export function rampFraction(region: Pick<SpeedRegion, 'start' | 'end'>): number {
  const length = region.end - region.start
  if (length <= 0) return 0.5
  return Math.min(0.5, RAMP_SOURCE_SECONDS / length)
}

export interface DeleteKeyEvent {
  key: string
  tagName: string
  isContentEditable: boolean
}

/**
 * What Delete / Backspace removes: a selected speed region first, else the
 * selected annotation. Escape clears a selected speed region instead (regions
 * have no undo, so a stale selection should not wait for a later Delete).
 * Nothing while typing.
 */
export function deleteKeyTarget(
  event: DeleteKeyEvent,
  selectedRegionId: string | null,
  selectedAnnotationId: string | null,
): 'region' | 'annotation' | 'deselect-region' | null {
  if (event.key !== 'Delete' && event.key !== 'Backspace' && event.key !== 'Escape') return null
  if (event.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.tagName)) return null
  if (event.key === 'Escape') return selectedRegionId ? 'deselect-region' : null
  if (selectedRegionId) return 'region'
  return selectedAnnotationId ? 'annotation' : null
}
