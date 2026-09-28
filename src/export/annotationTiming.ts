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
 */

export interface AnnotationTimingInput {
  startTime: number
  endTime: number
  fadeIn?: number
  fadeOut?: number
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
 *   0.2. Fade-in takes priority over fade-out when both windows overlap
 *   (matches the original `else if`).
 */
export function annotationStateAt(annotation: AnnotationTimingInput, t: number): AnnotationTimingState {
  const { startTime, endTime, fadeIn = 0, fadeOut = 0 } = annotation
  const isInTimeRange = t >= startTime && t <= endTime

  if (!isInTimeRange) {
    return { visible: false, opacity: 0 }
  }

  const timeInRange = t - startTime
  const timeToEnd = endTime - t

  let opacity = 1

  if (fadeIn > 0 && timeInRange < fadeIn) {
    opacity = Math.max(0.5, timeInRange / fadeIn)
  } else if (fadeOut > 0 && timeToEnd < fadeOut) {
    opacity = Math.max(0.2, timeToEnd / fadeOut)
  }

  return { visible: true, opacity }
}
