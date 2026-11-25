import { fabric } from '@/lib/fabric'
import type { Annotation } from '@/stores/drawingStore'
import { frameIndexAt } from '@/utils/frames'

// Frame-level freeze primitives with no store dependency, so the drawing store
// and freezeSequence can use them without an import cycle through freezeMarkers.

/** Recorded pauses shorter than this are treated as a double-tap, not a hold. */
export const MIN_RECORDED_HOLD_SECONDS = 0.3
/** A coach talking over a paused frame for minutes shouldn't become a minutes-long hold. */
export const MAX_RECORDED_HOLD_SECONDS = 30
/** Moving the playhead further than this while paused is navigation (a rewind), not a hold; ~15 frames still allows stepping to the exact frame. */
export const MAX_PAUSE_DRIFT_SECONDS = 0.5

/** The frame's freeze carrier: an annotation on `time`'s frame whose `freezeDuration` is a number (0 included). Prefers toolType 'freeze'. */
export function findFreezeCarrierAt(annotations: Annotation[], time: number, fps: number): Annotation | undefined {
  const frame = frameIndexAt(time, fps)
  const carriers = annotations.filter(
    (a) => typeof a.freezeDuration === 'number' && frameIndexAt(a.startTime, fps) === frame,
  )
  return carriers.find((a) => a.toolType === 'freeze') ?? carriers[0]
}

/** The invisible Fabric object a freeze marker annotation wraps. */
export function createFreezeMarkerObject() {
  return new fabric.Rect({
    left: 0,
    top: 0,
    width: 1,
    height: 1,
    fill: 'transparent',
    stroke: 'transparent',
    selectable: false,
    evented: false,
    visible: false,
  })
}
