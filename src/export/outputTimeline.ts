import type { Clip, OutputSegment } from '@/types/clip'

/**
 * The fields of a live `Annotation` (see `src/stores/drawingStore.ts`) that
 * the output timeline needs. Kept minimal and structural so callers don't
 * have to import the full store type (or construct a fake `fabric.Object`)
 * just to build a timeline.
 */
export interface FreezeAnnotationLike {
  startTime: number
  freezeDuration?: number
}

export interface OutputTimelineResult {
  segments: OutputSegment[]
  /** Total output duration in seconds (sum of all segment durations). */
  duration: number
  /** `Math.round(duration * fps)`; the exact number of frames the renderer must emit. */
  frameCount: number
}

/**
 * Builds the output timeline for exporting `clip`, per the rule in
 * docs/CLIPS_PLAN.md:
 *
 *   For a clip [start, end), annotations with `freezeDuration > 0` and
 *   `start <= startTime < end` create holds at their startTime, in time
 *   order. Segments are `play(start→t1), hold(t1, d1), play(t1→t2), …`.
 *
 * Tie-breaking rule (not specified in the plan, decided here): when two or
 * more qualifying annotations share the exact same `startTime`, they merge
 * into a single hold using the MAX of their `freezeDuration` values, rather
 * than stacking sequential holds back-to-back. Two freeze-frames fired at
 * the same instant would otherwise produce a visually indistinguishable
 * "hold, then immediately hold again on the same frame" — a longer single
 * hold is the more useful and less surprising result for a coach reviewing
 * the export.
 */
export function buildOutputTimeline(
  clip: Pick<Clip, 'start' | 'end'>,
  annotations: FreezeAnnotationLike[],
  fps: number
): OutputTimelineResult {
  const holdDurationByTime = new Map<number, number>()

  for (const annotation of annotations) {
    const freezeDuration = annotation.freezeDuration
    if (!freezeDuration || freezeDuration <= 0) continue
    if (annotation.startTime < clip.start || annotation.startTime >= clip.end) continue

    const existing = holdDurationByTime.get(annotation.startTime)
    holdDurationByTime.set(
      annotation.startTime,
      existing === undefined ? freezeDuration : Math.max(existing, freezeDuration)
    )
  }

  const holdTimes = Array.from(holdDurationByTime.keys()).sort((a, b) => a - b)

  const segments: OutputSegment[] = []
  let cursor = clip.start

  for (const holdTime of holdTimes) {
    if (holdTime > cursor) {
      segments.push({ kind: 'play', srcStart: cursor, srcEnd: holdTime })
    }
    segments.push({ kind: 'hold', srcTime: holdTime, duration: holdDurationByTime.get(holdTime)! })
    cursor = holdTime
  }

  if (clip.end > cursor) {
    segments.push({ kind: 'play', srcStart: cursor, srcEnd: clip.end })
  }

  const duration = segments.reduce(
    (sum, seg) => sum + (seg.kind === 'play' ? seg.srcEnd - seg.srcStart : seg.duration),
    0
  )
  const frameCount = Math.round(duration * fps)

  return { segments, duration, frameCount }
}

/**
 * Splits `frameCount` (= round(totalDuration * fps)) frames across segments
 * so that:
 *  - each segment gets a whole number of frames,
 *  - the frame counts sum to exactly `frameCount` (no drift from rounding
 *    each segment's duration independently), and
 *  - within a segment, the split reflects that segment's own duration.
 *
 * Uses cumulative rounding (a Bresenham-style distribution): the frame
 * boundary after segment `i` is `round(cumulativeDuration_i * fps)`, and
 * each segment's frame count is the difference between consecutive
 * boundaries. This is what `clipRenderer` uses to decide, up front, how
 * many output frames a `play` or `hold` segment is responsible for.
 */
export function segmentFrameCounts(segments: OutputSegment[], fps: number): number[] {
  const counts: number[] = []
  let cumulativeDuration = 0
  let cumulativeFrames = 0

  for (const seg of segments) {
    const segDuration = seg.kind === 'play' ? seg.srcEnd - seg.srcStart : seg.duration
    cumulativeDuration += segDuration
    const targetFrames = Math.round(cumulativeDuration * fps)
    const segFrameCount = Math.max(0, targetFrames - cumulativeFrames)
    counts.push(segFrameCount)
    cumulativeFrames += segFrameCount
  }

  return counts
}

/**
 * For every output frame (in order), returns the source-video time it
 * shows. A `hold` segment's frames all map to that hold's `srcTime`; a
 * `play` segment's frames are evenly spaced across `[srcStart, srcEnd)`.
 *
 * `frameSourceTimes(segments, fps).length` always equals the `frameCount`
 * `buildOutputTimeline` computed for the same segments and fps.
 */
export function frameSourceTimes(segments: OutputSegment[], fps: number): number[] {
  const counts = segmentFrameCounts(segments, fps)
  const times: number[] = []

  segments.forEach((seg, i) => {
    const segFrameCount = counts[i]
    if (seg.kind === 'hold') {
      for (let f = 0; f < segFrameCount; f++) times.push(seg.srcTime)
      return
    }

    const segDuration = seg.srcEnd - seg.srcStart
    for (let f = 0; f < segFrameCount; f++) {
      times.push(segFrameCount > 0 ? seg.srcStart + segDuration * (f / segFrameCount) : seg.srcStart)
    }
  })

  return times
}
