import { fabric } from '@/lib/fabric'
import { useDrawingStore, type Annotation } from '@/stores/drawingStore'
import { frameIndexAt } from '@/utils/frames'

/** Recorded pauses shorter than this are treated as a double-tap, not a hold. */
export const MIN_RECORDED_HOLD_SECONDS = 0.3
/** A coach talking over a paused frame for minutes shouldn't become a minutes-long hold. */
export const MAX_RECORDED_HOLD_SECONDS = 30
/** Moving the playhead further than this while paused is navigation (a rewind), not a hold; ~15 frames still allows stepping to the exact frame. */
export const MAX_PAUSE_DRIFT_SECONDS = 0.5

export type RecordedHold =
  | { record: true; seconds: number; capped: boolean }
  | { record: false; reason: 'too-short' | 'moved' }

/**
 * Decides whether a pause → resume becomes a hold, and for how long.
 * The hold lands on the resume frame, so frame-stepping to the exact
 * frame while paused still records; scrubbing away does not.
 */
export function recordedHold(pauseTime: number, resumeTime: number, pausedSeconds: number): RecordedHold {
  if (Math.abs(resumeTime - pauseTime) > MAX_PAUSE_DRIFT_SECONDS) return { record: false, reason: 'moved' }
  const seconds = Math.round(pausedSeconds * 10) / 10
  if (seconds < MIN_RECORDED_HOLD_SECONDS) return { record: false, reason: 'too-short' }
  return { record: true, seconds: Math.min(seconds, MAX_RECORDED_HOLD_SECONDS), capped: seconds > MAX_RECORDED_HOLD_SECONDS }
}

/** The annotation holding the video on the same frame as `time`, if any (a freeze marker or a drawing with a freeze). */
export function findFreezeAt(annotations: Annotation[], time: number, fps: number): Annotation | undefined {
  const frame = frameIndexAt(time, fps)
  return annotations.find((a) => (a.freezeDuration ?? 0) > 0 && frameIndexAt(a.startTime, fps) === frame)
}

/** Adds an invisible freeze-frame marker annotation at `time`; returns its id. */
export function addFreezeMarker(time: number, seconds: number): string | null {
  const { addAnnotation, canvas } = useDrawingStore.getState()
  if (!canvas) return null
  const marker = new fabric.Rect({
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
  canvas.add(marker)
  const before = new Set(useDrawingStore.getState().annotations.map((a) => a.id))
  addAnnotation({
    id: `freeze-${Date.now()}`,
    object: marker,
    startTime: time,
    endTime: time + 0.1,
    layer: 1,
    toolType: 'freeze',
    freezeDuration: seconds,
  })
  // addAnnotation may de-duplicate the id; report the one it actually used.
  return useDrawingStore.getState().annotations.find((a) => !before.has(a.id))?.id ?? null
}

/** Sets a hold of `seconds` on `time`'s frame, reusing an existing freeze there. Returns the annotation id. */
export function setFreezeAt(time: number, seconds: number, fps: number): string | null {
  const existing = findFreezeAt(useDrawingStore.getState().annotations, time, fps)
  if (existing) {
    useDrawingStore.getState().updateAnnotation(existing.id, { freezeDuration: seconds })
    return existing.id
  }
  return addFreezeMarker(time, seconds)
}

/** Removes the hold on `time`'s frame: deletes a bare marker, or clears a drawing's freeze. Returns false if there was none. */
export function clearFreezeAt(time: number, fps: number): boolean {
  const store = useDrawingStore.getState()
  const existing = findFreezeAt(store.annotations, time, fps)
  if (!existing) return false
  if (existing.toolType === 'freeze') store.removeAnnotations([existing.id])
  else store.updateAnnotation(existing.id, { freezeDuration: undefined })
  return true
}
