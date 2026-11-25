import { useDrawingStore, type Annotation } from '@/stores/drawingStore'
import { MIN_RECORDED_HOLD_SECONDS, MAX_RECORDED_HOLD_SECONDS, MAX_PAUSE_DRIFT_SECONDS, findFreezeCarrierAt, createFreezeMarkerObject } from '@/utils/freezeFrame'

export { MIN_RECORDED_HOLD_SECONDS, MAX_RECORDED_HOLD_SECONDS, MAX_PAUSE_DRIFT_SECONDS, findFreezeCarrierAt }

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

/** The frame's freeze carrier when it actually holds the video (duration > 0). */
export function findFreezeAt(annotations: Annotation[], time: number, fps: number): Annotation | undefined {
  const carrier = findFreezeCarrierAt(annotations, time, fps)
  return carrier && (carrier.freezeDuration ?? 0) > 0 ? carrier : undefined
}

/** Adds an invisible freeze-frame marker annotation at `time`; returns its id. */
export function addFreezeMarker(time: number, seconds: number, opts?: { auto?: boolean; history?: boolean }): string | null {
  const { addAnnotation, canvas } = useDrawingStore.getState()
  if (!canvas) return null
  const marker = createFreezeMarkerObject()
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
    freezeAuto: opts?.auto,
  }, { history: opts?.history })
  // addAnnotation may de-duplicate the id; report the one it actually used.
  return useDrawingStore.getState().annotations.find((a) => !before.has(a.id))?.id ?? null
}

/** Sets the frame's freeze through its carrier, creating a marker if none. `opts.history: false` must not save undo state. Returns the carrier id. */
export function setFrameFreeze(time: number, seconds: number, fps: number, opts: { auto: boolean; history?: boolean }): string | null {
  const carrier = findFreezeCarrierAt(useDrawingStore.getState().annotations, time, fps)
  if (!carrier) return addFreezeMarker(time, seconds, opts)
  useDrawingStore.getState().updateAnnotation(carrier.id, { freezeDuration: seconds, freezeAuto: opts.auto })
  return carrier.id
}

/** Sets a hand-set hold of `seconds` on `time`'s frame, reusing the frame's freeze carrier. Returns the annotation id. */
export function setFreezeAt(time: number, seconds: number, fps: number): string | null {
  const carrier = findFreezeCarrierAt(useDrawingStore.getState().annotations, time, fps)
  if (!carrier) return addFreezeMarker(time, seconds)
  useDrawingStore.getState().updateAnnotation(
    carrier.id,
    carrier.freezeAuto ? { freezeDuration: seconds, freezeAuto: false } : { freezeDuration: seconds },
  )
  return carrier.id
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
