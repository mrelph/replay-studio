/**
 * Shared annotation visibility/opacity rule, at a single point in time.
 *
 * This is a pure extraction of the effect in
 * `src/components/Canvas/DrawingCanvas.tsx` ("Control annotation visibility
 * based on current time with fade effects"), used both by the live canvas
 * (evaluated at `currentTime`) and by the clip export renderer (evaluated at
 * each output frame's source time). Keeping the two in lockstep is the whole
 * point: whatever a coach sees in the live view during scrubbing is exactly
 * what gets burned into the exported clip.
 *
 * Presentation time: fades, draw-on reveal and reveal delays run on their own
 * clock, not the video's. `revealElapsed` is on-screen seconds since the
 * annotation started (an `ElapsedBetween`, so a slow-motion region does not
 * stretch it) plus any hold time (video paused or frozen while the shape keeps
 * drawing), and `revealFraction` maps that onto 0..1 with an ease-out curve.
 * Annotations without a positive `drawIn` are always fully revealed.
 */

/** On-screen seconds between two source times, excluding holds. */
export type ElapsedBetween = (fromSrc: number, toSrc: number) => number

const sourceElapsed: ElapsedBetween = (fromSrc, toSrc) => toSrc - fromSrc

export interface AnnotationTimingInput {
  startTime: number
  endTime: number
  fadeIn?: number
  fadeOut?: number
  drawIn?: number
  revealDelay?: number
}

/** Whether an annotation runs on presentation time (a draw-on or a reveal delay), so hold time must be tracked for it. */
export function hasPresentationTiming(annotation: Pick<AnnotationTimingInput, 'drawIn' | 'revealDelay'>): boolean {
  const { drawIn, revealDelay } = annotation
  return (drawIn !== undefined && drawIn > 0) || (revealDelay !== undefined && revealDelay > 0)
}

export function revealElapsed(startTime: number, t: number, holdElapsed: number, revealDelay?: number, elapsed: ElapsedBetween = sourceElapsed): number {
  return Math.max(0, Math.max(0, elapsed(startTime, t)) + holdElapsed - (revealDelay ?? 0))
}

export function isRevealDue(startTime: number, t: number, holdElapsed: number, revealDelay?: number, elapsed: ElapsedBetween = sourceElapsed): boolean {
  if (revealDelay === undefined || !(revealDelay > 0)) return true
  return Math.max(0, elapsed(startTime, t)) + holdElapsed >= revealDelay - 1e-6
}

export function revealFraction(elapsed: number, drawIn: number | undefined): number {
  if (drawIn === undefined || !(drawIn > 0)) return 1
  const x = Math.min(1, Math.max(0, elapsed / drawIn))
  return 1 - Math.pow(1 - x, 3)
}

export interface AnnotationTimingState {
  visible: boolean
  opacity: number
}

/**
 * Computes whether an annotation is visible at time `t`, and at what
 * opacity, reproducing the live effect exactly:
 * - Outside `[startTime, endTime]` (inclusive both ends): hidden, opacity 0.
 * - Inside the range: visible. If within `fadeIn` seconds of `startTime`,
 *   opacity ramps from 1 down to a floor of 0.5 (never fully invisible, so a
 *   fresh drawing is never mistaken for "not drawn yet"). Otherwise, if
 *   within `fadeOut` seconds of `endTime`, opacity ramps down to a floor of
 *   0.2. Both windows are measured with `elapsed` (on-screen seconds); the
 *   range itself stays in source time. Fade-in takes priority over fade-out when both windows overlap
 *   (matches the original `else if`).
 */
export function annotationStateAt(annotation: AnnotationTimingInput, t: number, elapsed: ElapsedBetween = sourceElapsed): AnnotationTimingState {
  const { startTime, endTime, fadeIn = 0, fadeOut = 0, drawIn = 0 } = annotation
  const isInTimeRange = t >= startTime && t <= endTime

  if (!isInTimeRange) {
    return { visible: false, opacity: 0 }
  }

  const timeInRange = elapsed(startTime, t)
  const timeToEnd = elapsed(t, endTime)

  let opacity = 1

  if (fadeIn > 0 && !(drawIn > 0) && timeInRange < fadeIn) {
    opacity = Math.max(0.5, timeInRange / fadeIn)
  } else if (fadeOut > 0 && timeToEnd < fadeOut) {
    opacity = Math.max(0.2, timeToEnd / fadeOut)
  }

  return { visible: true, opacity }
}
