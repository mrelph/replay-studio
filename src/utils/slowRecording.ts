import { normalizeRegion } from './speedRegions'

export const MIN_SLOW_HOLD_SECONDS = 0.3

export type SlowRecordingResult =
  | { record: true; region: { start: number; end: number; speed: number } }
  | { record: false; reason: 'too-short' | 'no-motion' }

/** Decides what a finished hold becomes. `heldSeconds` is wall-clock. */
export function finishSlowRecording(
  startSrc: number,
  endSrc: number,
  heldSeconds: number,
  speed: number,
  duration: number,
  fps: number,
): SlowRecordingResult {
  if (heldSeconds < MIN_SLOW_HOLD_SECONDS) return { record: false, reason: 'too-short' }
  const region = normalizeRegion({ id: '', start: startSrc, end: endSrc, speed }, duration, fps)
  if (!region) return { record: false, reason: 'no-motion' }
  return { record: true, region: { start: region.start, end: region.end, speed } }
}
