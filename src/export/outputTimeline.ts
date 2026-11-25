import type { Clip, OutputSegment, VideoProbe } from '@/types/clip'
import { frameIndexAt, frameStart } from '@/utils/frames'
import { buildSpeedSteps, speedAt, type SpeedRegionLike, type SpeedStep } from './speedMap'

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
 *
 * With `speedSteps`, each play stretch is split at the step edges inside it,
 * so every play segment has one constant speed; `speed` is set only when it
 * is not 1. Play edges are then snapped to source-frame starts (at
 * `sourceFps`), the way the main process aligns them before encoding, so both
 * sides count the same frames even when a clip edge or freeze is off-frame.
 */
export function buildOutputTimeline(
  clip: Pick<Clip, 'start' | 'end'>,
  annotations: FreezeAnnotationLike[],
  fps: number,
  speedSteps?: SpeedStep[],
  sourceFps: number = fps
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
  const pushPlay = (srcStart: number, srcEnd: number) => segments.push(...playSegments(srcStart, srcEnd, speedSteps, sourceFps))

  for (const holdTime of holdTimes) {
    if (holdTime > cursor) {
      pushPlay(cursor, holdTime)
    }
    segments.push({ kind: 'hold', srcTime: holdTime, duration: holdDurationByTime.get(holdTime)! })
    cursor = holdTime
  }

  if (clip.end > cursor) {
    pushPlay(cursor, clip.end)
  }

  const duration = segments.reduce((sum, seg) => sum + segmentOutputDuration(seg), 0)
  const frameCount = Math.round(duration * fps)

  return { segments, duration, frameCount }
}

// Step edges closer than this to a play stretch's ends do not split it.
const EDGE_EPSILON = 1e-9

/** [srcStart, srcEnd) as play segments of constant speed, split at the step edges inside it. */
function playSegments(rawStart: number, rawEnd: number, speedSteps: SpeedStep[] | undefined, sourceFps: number): OutputSegment[] {
  if (!speedSteps || speedSteps.length === 0) return [{ kind: 'play', srcStart: rawStart, srcEnd: rawEnd }]
  const srcStart = frameStart(frameIndexAt(rawStart, sourceFps), sourceFps)
  const srcEnd = frameStart(frameIndexAt(rawEnd, sourceFps), sourceFps)
  if (srcEnd <= srcStart) return []
  const cuts = [srcStart]
  for (const step of speedSteps) {
    if (step.start > srcStart + EDGE_EPSILON && step.start < srcEnd - EDGE_EPSILON) cuts.push(step.start)
  }
  cuts.push(srcEnd)
  const segments: OutputSegment[] = []
  for (let i = 0; i + 1 < cuts.length; i++) {
    const speed = speedAt(speedSteps, (cuts[i] + cuts[i + 1]) / 2)
    segments.push(speed === 1 ? { kind: 'play', srcStart: cuts[i], srcEnd: cuts[i + 1] } : { kind: 'play', srcStart: cuts[i], srcEnd: cuts[i + 1], speed })
  }
  return segments
}

/** Seconds a segment lasts in the output: a play segment's source length divided by its speed. */
export function segmentOutputDuration(segment: OutputSegment): number {
  return segment.kind === 'play' ? (segment.srcEnd - segment.srcStart) / (segment.speed ?? 1) : segment.duration
}

/** The speed steps an export uses: built at the source rate over the whole video, or undefined with no regions. */
export function exportSpeedSteps(regions: SpeedRegionLike[], probe: Pick<VideoProbe, 'duration' | 'fps'>): SpeedStep[] | undefined {
  return regions.length > 0 ? buildSpeedSteps(regions, probe.duration, probe.fps) : undefined
}

export const MAX_SPEED_REGIONS_PER_CLIP = 40

/** The export error when more than `MAX_SPEED_REGIONS_PER_CLIP` regions intersect the clip's [start, end), else null. */
export function speedRegionLimitError(clip: Pick<Clip, 'start' | 'end'>, regions: SpeedRegionLike[]): string | null {
  const inClip = regions.filter((r) => r.end > clip.start && r.start < clip.end).length
  return inClip > MAX_SPEED_REGIONS_PER_CLIP ? `Too many speed regions in this clip (max ${MAX_SPEED_REGIONS_PER_CLIP})` : null
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
    cumulativeDuration += segmentOutputDuration(seg)
    const targetFrames = Math.round(cumulativeDuration * fps)
    const segFrameCount = Math.max(0, targetFrames - cumulativeFrames)
    counts.push(segFrameCount)
    cumulativeFrames += segFrameCount
  }

  return counts
}

// Keeps the frame choice off exact boundaries where float error could tip it.
const SPEED_FRAME_EPSILON = 1e-6
// frameIndexAt moves to the next frame 1e-3 of a frame early; stay clear of that.
const FRAME_TIME_MARGIN = 1e-3

/**
 * The rule both sides of the export share for a play segment with speed != 1
 * covering source frames [a, b) in `frames` output frames: output frame f shows
 * source frame `a + floor(f * (b - a) / frames + 1e-6)`, spreading the source
 * frames evenly over the planned frames so a slowed segment never skips one.
 * electron/clipExport.ts builds its ffmpeg graph from the same rule.
 */
export function speedSegmentFrame(f: number, frames: number, a: number, b: number): number {
  return a + Math.floor((f * (b - a)) / frames + SPEED_FRAME_EPSILON)
}

/**
 * For every output frame (in order), returns the source-video time it
 * shows. A `hold` segment's frames all map to that hold's `srcTime`; a
 * `play` segment's frames are evenly spaced across `[srcStart, srcEnd)`, and in
 * a slowed or sped-up segment each is kept inside the source frame
 * `speedSegmentFrame` picks.
 *
 * `frameSourceTimes(segments, fps).length` always equals the `frameCount`
 * `buildOutputTimeline` computed for the same segments and fps.
 */
export function frameSourceTimes(segments: OutputSegment[], fps: number, sourceFps: number = fps): number[] {
  const counts = segmentFrameCounts(segments, fps)
  const times: number[] = []

  segments.forEach((seg, i) => {
    const segFrameCount = counts[i]
    if (seg.kind === 'hold') {
      for (let f = 0; f < segFrameCount; f++) times.push(seg.srcTime)
      return
    }

    const segDuration = seg.srcEnd - seg.srcStart
    if ((seg.speed ?? 1) !== 1) {
      const a = frameIndexAt(seg.srcStart, sourceFps)
      const b = Math.max(a + 1, frameIndexAt(seg.srcEnd, sourceFps))
      for (let f = 0; f < segFrameCount; f++) {
        const lo = frameStart(speedSegmentFrame(f, segFrameCount, a, b), sourceFps)
        times.push(Math.min(Math.max(seg.srcStart + segDuration * (f / segFrameCount), lo), lo + (1 - 2 * FRAME_TIME_MARGIN) / sourceFps))
      }
      return
    }

    for (let f = 0; f < segFrameCount; f++) {
      times.push(segFrameCount > 0 ? seg.srcStart + segDuration * (f / segFrameCount) : seg.srcStart)
    }
  })

  return times
}

export interface FramePresentation {
  srcTime: number
  segmentIndex: number
  /** Seconds into the current hold segment (`f / fps` on its f-th frame); 0 on play frames. */
  holdElapsed: number
}

/**
 * `frameSourceTimes` plus, per output frame, which segment it belongs to and
 * how far into a hold it is, so draw-on reveals can keep animating while the
 * source frame is frozen. Same order and length as `frameSourceTimes`.
 */
export function framePresentations(segments: OutputSegment[], fps: number, sourceFps: number = fps): FramePresentation[] {
  const counts = segmentFrameCounts(segments, fps)
  const times = frameSourceTimes(segments, fps, sourceFps)
  const presentations: FramePresentation[] = []

  segments.forEach((seg, segmentIndex) => {
    for (let f = 0; f < counts[segmentIndex]; f++) {
      presentations.push({
        srcTime: times[presentations.length],
        segmentIndex,
        holdElapsed: seg.kind === 'hold' ? f / fps : 0,
      })
    }
  })

  return presentations
}
