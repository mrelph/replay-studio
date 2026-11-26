import { frameIndexAt } from '@/utils/frames'
import { hasPresentationTiming, isRevealDue, revealElapsed, revealFraction, type ElapsedBetween } from './annotationTiming'
import { presentationOffset, type SpeedStep } from './speedMap'

export interface LiveRevealAnnotation {
  id: string
  startTime: number
  endTime: number
  drawIn?: number
  revealDelay?: number
  fadeIn?: number
}

/** An armed annotation's peak reveal fraction so far, and whether its turn has come (latched). */
export interface ArmedReveal {
  peak: number
  due: boolean
}

export interface LiveRevealState {
  fraction: number
  due: boolean
  /** Automatic-hold seconds that count toward the fade-in; set only for annotations with a fade-in. */
  holdElapsed?: number
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
  /** Speed steps for the loaded video; omitted means source time is on-screen time. */
  speedSteps?: SpeedStep[]
}

const FINISHED: LiveRevealState = { fraction: 1, due: true }

/**
 * Returns the reveal fraction (1 = finished) and whether the annotation's
 * `revealDelay` has passed, for every annotation id. Unarmed annotations are
 * finished and due. `armed` holds each armed id's peak fraction and latched due.
 * Annotations with a fade-in also get the hold time that counts toward it
 * (`annotationStateAt`'s `holdElapsed`), 0 while paused by the user or unarmed.
 */
export function stepLiveReveal(input: LiveRevealInput): Map<string, LiveRevealState> {
  const { annotations, prevTime, time, playing, autoHold, now, fps, armed, speedSteps } = input
  const elapsed: ElapsedBetween | undefined = speedSteps ? (a, b) => presentationOffset(speedSteps, a, b) : undefined
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
    const { id, startTime, endTime, drawIn, revealDelay, fadeIn } = annotation
    // A freeze is often recorded a frame or two after the drawing's start frame;
    // every hold from the start frame onward counts toward its presentation time.
    const holdCounts = holdFrame !== null && holdFrame >= frameIndexAt(startTime, fps) && holdFrame <= frameIndexAt(time, fps)
    const holdElapsed = holdCounts && autoHold ? ((autoHold.endedAt ?? now) - autoHold.startedAt) / 1000 : 0
    const withFade = (state: LiveRevealState, fadeHold: number): LiveRevealState => (fadeIn !== undefined && fadeIn > 0 ? { ...state, holdElapsed: fadeHold } : state)

    if (!hasPresentationTiming(annotation)) {
      armed.delete(id)
      result.set(id, withFade(FINISHED, holdElapsed))
      continue
    }

    const arrived = playing && prevTime < startTime && startTime <= time && time - prevTime < 1
    const heldOnStart = holdActive && holdCounts && time >= startTime - frameTolerance && time <= endTime
    if ((arrived || heldOnStart) && !armed.has(id)) armed.set(id, { peak: 0, due: false })
    if (time < startTime - frameTolerance || time > endTime) armed.delete(id)

    const state = armed.get(id)
    if (state === undefined) {
      result.set(id, withFade(FINISHED, 0))
      continue
    }

    // A freeze snaps playback back to the start frame after it ran a little
    // past it; never let an armed shape un-draw or disappear again.
    const due = state.due || isRevealDue(startTime, time, holdElapsed, revealDelay, elapsed)
    const fraction = Math.max(state.peak, revealFraction(revealElapsed(startTime, time, holdElapsed, revealDelay, elapsed), drawIn))
    armed.set(id, { peak: fraction, due })
    result.set(id, withFade({ fraction, due }, holdElapsed))
  }

  return result
}
