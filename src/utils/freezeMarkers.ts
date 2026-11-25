import { useDrawingStore, type Annotation } from '@/stores/drawingStore'
import { frameIndexAt } from '@/utils/frames'
import { MIN_RECORDED_HOLD_SECONDS, MAX_RECORDED_HOLD_SECONDS, MAX_PAUSE_DRIFT_SECONDS, findFreezeCarrierAt, freezeMarkerAnnotation } from '@/utils/freezeFrame'

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

/** True when `time`'s frame has an automatic freeze, or a freeze on a drawn-on frame (set from its drawings or the inspector): H must not overwrite it. */
export function autoFreezeOwnsFrame(annotations: Annotation[], time: number, fps: number): boolean {
  const carrier = findFreezeCarrierAt(annotations, time, fps)
  if (!carrier) return false
  if (carrier.freezeAuto === true) return true
  return frameHasDrawings(annotations, time, fps)
}

/** True when `time`'s frame has at least one drawing (freeze markers aside). */
export function frameHasDrawings(annotations: Annotation[], time: number, fps: number): boolean {
  const frame = frameIndexAt(time, fps)
  return annotations.some((a) => a.toolType !== 'freeze' && frameIndexAt(a.startTime, fps) === frame)
}

/** Adds an invisible freeze-frame marker annotation at `time`; returns its id. */
export function addFreezeMarker(time: number, seconds: number, opts?: { auto?: boolean; history?: boolean }): string | null {
  const { addAnnotation, canvas } = useDrawingStore.getState()
  if (!canvas) return null
  const marker = freezeMarkerAnnotation(time, seconds, opts?.auto)
  canvas.add(marker.object)
  const before = new Set(useDrawingStore.getState().annotations.map((a) => a.id))
  addAnnotation(marker, { history: opts?.history })
  // addAnnotation may de-duplicate the id; report the one it actually used.
  return useDrawingStore.getState().annotations.find((a) => !before.has(a.id))?.id ?? null
}

/** Sets the frame's freeze through its carrier, creating a marker if none. `opts.history: false` must not save undo state. Returns the carrier id. */
export function setFrameFreeze(time: number, seconds: number, fps: number, opts: { auto: boolean; history?: boolean }): string | null {
  return writeFrameFreeze(time, seconds, fps, opts.auto, opts)
}

/** Writes the hold through the frame's carrier (or a new marker); `auto: undefined` leaves a carrier's `freezeAuto` key absent unless it was automatic. */
function writeFrameFreeze(time: number, seconds: number, fps: number, auto: boolean | undefined, opts?: { history?: boolean }): string | null {
  const carrier = findFreezeCarrierAt(useDrawingStore.getState().annotations, time, fps)
  if (!carrier) return addFreezeMarker(time, seconds, { auto, history: opts?.history })
  const freezeAuto = auto ?? (carrier.freezeAuto ? false : undefined)
  useDrawingStore.getState().updateAnnotation(
    carrier.id,
    freezeAuto === undefined ? { freezeDuration: seconds } : { freezeDuration: seconds, freezeAuto },
  )
  return carrier.id
}

/** Sets a hand-set hold of `seconds` on `time`'s frame, reusing the frame's freeze carrier. Returns the annotation id. */
export function setFreezeAt(time: number, seconds: number, fps: number): string | null {
  return writeFrameFreeze(time, seconds, fps, undefined)
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
