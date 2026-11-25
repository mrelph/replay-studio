import { frameIndexAt } from '@/utils/frames'
import { hasPresentationTiming, isRevealDue, revealElapsed, revealFraction } from './annotationTiming'

export interface LiveRevealAnnotation {
  id: string
  startTime: number
  endTime: number
  drawIn?: number
  revealDelay?: number
}

/** An armed annotation's peak reveal fraction so far, and whether its turn has come (latched). */
export interface ArmedReveal {
  peak: number
  due: boolean
}

export interface LiveRevealState {
  fraction: number
  due: boolean
}

export interface LiveRevealInput {
  annotations: LiveRevealAnnotation[]
  prevTime: number
  time: number
  playing: boolean
  autoHold: { time: number; startedAt: number; endedAt: number | null } | null
  now: number
  fps: number
  armed: Map<string, ArmedReveal>
}

const FINISHED: LiveRevealState = { fraction: 1, due: true }

/**
 * Returns the reveal fraction (1 = finished) and whether the annotation's
 * `revealDelay` has passed, for every annotation id. Unarmed annotations are
 * finished and due. `armed` holds each armed id's peak fraction and latched due.
 */
export function stepLiveReveal(input: LiveRevealInput): Map<string, LiveRevealState> {
  const { annotations, prevTime, time, playing, autoHold, now, fps, armed } = input
  const result = new Map<string, LiveRevealState>()
  const holdActive = autoHold !== null && autoHold.endedAt === null

  if (!playing && !holdActive) {
    armed.clear()
    for (const annotation of annotations) result.set(annotation.id, FINISHED)
    return result
  }

  const holdFrame = autoHold ? frameIndexAt(autoHold.time, fps) : null
  const frameTolerance = 1 / fps

  for (const annotation of annotations) {
    const { id, startTime, endTime, drawIn, revealDelay } = annotation
    if (!hasPresentationTiming(annotation)) {
      armed.delete(id)
      result.set(id, FINISHED)
      continue
    }

    // A freeze is often recorded a frame or two after the drawing's start frame;
    // every hold from the start frame onward counts toward its presentation time.
    const holdCounts = holdFrame !== null && holdFrame >= frameIndexAt(startTime, fps) && holdFrame <= frameIndexAt(time, fps)
    const arrived = playing && prevTime < startTime && startTime <= time && time - prevTime < 1
    const heldOnStart = holdActive && holdCounts && time >= startTime - frameTolerance && time <= endTime
    if ((arrived || heldOnStart) && !armed.has(id)) armed.set(id, { peak: 0, due: false })
    if (time < startTime - frameTolerance || time > endTime) armed.delete(id)

    const state = armed.get(id)
    if (state === undefined) {
      result.set(id, FINISHED)
      continue
    }

    // A freeze snaps playback back to the start frame after it ran a little
    // past it; never let an armed shape un-draw or disappear again.
    const holdElapsed = holdCounts && autoHold ? ((autoHold.endedAt ?? now) - autoHold.startedAt) / 1000 : 0
    const due = state.due || isRevealDue(startTime, time, holdElapsed, revealDelay)
    const fraction = Math.max(state.peak, revealFraction(revealElapsed(startTime, time, holdElapsed, revealDelay), drawIn))
    armed.set(id, { peak: fraction, due })
    result.set(id, { fraction, due })
  }

  return result
}
