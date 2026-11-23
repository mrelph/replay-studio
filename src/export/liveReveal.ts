import { frameIndexAt } from '@/utils/frames'
import { revealElapsed, revealFraction } from './annotationTiming'

export interface LiveRevealAnnotation {
  id: string
  startTime: number
  endTime: number
  drawIn?: number
}

export interface LiveRevealInput {
  annotations: LiveRevealAnnotation[]
  prevTime: number
  time: number
  playing: boolean
  autoHold: { time: number; startedAt: number; endedAt: number | null } | null
  now: number
  fps: number
  armed: Map<string, number>
}

/**
 * Returns the reveal fraction for every annotation id (1 = finished).
 * `armed` maps each armed id to its peak fraction so far.
 */
export function stepLiveReveal(input: LiveRevealInput): Map<string, number> {
  const { annotations, prevTime, time, playing, autoHold, now, fps, armed } = input
  const result = new Map<string, number>()
  const holdActive = autoHold !== null && autoHold.endedAt === null

  if (!playing && !holdActive) {
    armed.clear()
    for (const annotation of annotations) result.set(annotation.id, 1)
    return result
  }

  const holdFrame = autoHold ? frameIndexAt(autoHold.time, fps) : null
  const frameTolerance = 1 / fps

  for (const annotation of annotations) {
    const { id, startTime, endTime, drawIn } = annotation
    if (!(drawIn !== undefined && drawIn > 0)) {
      armed.delete(id)
      result.set(id, 1)
      continue
    }

    const holdOnStart = holdFrame !== null && holdFrame === frameIndexAt(startTime, fps)
    const arrived = playing && prevTime < startTime && startTime <= time && time - prevTime < 1
    const heldOnStart = holdActive && holdOnStart && time >= startTime - frameTolerance
    if ((arrived || heldOnStart) && !armed.has(id)) armed.set(id, 0)
    if (time < startTime - frameTolerance || time > endTime) armed.delete(id)

    const peak = armed.get(id)
    if (peak === undefined) {
      result.set(id, 1)
      continue
    }

    // A freeze snaps playback back to the start frame after it ran a little
    // past it; never let an armed shape un-draw.
    const holdElapsed = holdOnStart && autoHold ? ((autoHold.endedAt ?? now) - autoHold.startedAt) / 1000 : 0
    const fraction = Math.max(peak, revealFraction(revealElapsed(startTime, time, holdElapsed), drawIn))
    armed.set(id, fraction)
    result.set(id, fraction)
  }

  return result
}
