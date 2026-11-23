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
  armed: Set<string>
}

/** Returns the reveal fraction for every annotation id (1 = finished). */
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
    if (arrived || heldOnStart) armed.add(id)
    if (time < startTime - frameTolerance || time > endTime) armed.delete(id)

    if (!armed.has(id)) {
      result.set(id, 1)
      continue
    }

    const holdElapsed = holdOnStart && autoHold ? ((autoHold.endedAt ?? now) - autoHold.startedAt) / 1000 : 0
    result.set(id, revealFraction(revealElapsed(startTime, time, holdElapsed), drawIn))
  }

  return result
}
