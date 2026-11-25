import type { OutputSegment } from '@/types/clip'
import { frameIndexAt, frameStart } from '@/utils/frames'
import { annotationStateAt, hasPresentationTiming, isRevealDue, revealElapsed, revealFraction, type AnnotationTimingInput, type ElapsedBetween } from './annotationTiming'
import { framePresentations, type FramePresentation } from './outputTimeline'
import { presentationOffset, type SpeedStep } from './speedMap'
import { revealKind } from './reveal'

/**
 * The fields `computeFrameSignature`/`buildDrawingSpans` need from a live
 * `Annotation` (see `src/stores/drawingStore.ts`), kept structural so this
 * module doesn't need to import the full store type.
 */
export interface SpanAnnotationLike extends AnnotationTimingInput {
  id: string
  toolType?: string
}

/** One annotation's visual contribution to a frame, opacity and draw-on reveal bucketed. */
export interface AnnotationVisualState {
  id: string
  /** Opacity quantized to the nearest 1/50 (0.02). */
  opacityBucket: number
  /** Draw-on progress in `revealSteps` steps; equals `revealSteps` once finished or when not animated. */
  revealBucket: number
  revealSteps: number
}

export interface SpanOptions {
  /** Source video rate, used to match holds to an annotation's start frame. Defaults to the output fps. */
  sourceFps?: number
  /** Most reveal steps per annotation. Defaults to 12. */
  maxRevealSteps?: number
  /** Speed steps for the source video, so animations run on presentation time. Omitted means source time. */
  speedSteps?: SpeedStep[]
}

const DEFAULT_MAX_REVEAL_STEPS = 12

// Must match MAX_OVERLAYS_PER_JOB in electron/clipExport.ts.
export const MAX_DISTINCT_OVERLAYS = 500

/**
 * One run of consecutive output frames that all show the exact same set of
 * visible annotations at the exact same (quantized) opacity — i.e. one
 * drawing-layer PNG's worth of frames. `signature` is empty for a span with
 * no visible annotations.
 */
export interface DrawingSpan {
  signature: AnnotationVisualState[]
  frameStart: number
  frameCount: number
}

const OPACITY_QUANTUM = 1 / 50

function quantizeOpacity(opacity: number): number {
  return Math.round(opacity / OPACITY_QUANTUM) * OPACITY_QUANTUM
}

/** A stable string key for a signature, so two spans' visual states can be compared/deduped cheaply. */
export function signatureKey(signature: AnnotationVisualState[]): string {
  return signature.map((s) => `${s.id}:${s.opacityBucket.toFixed(2)}:${s.revealBucket}/${s.revealSteps}`).join('|')
}

/**
 * The sorted list of (annotationId, quantized opacity) for every annotation
 * visible at source time `t`, per `annotationStateAt` — the same rule the
 * live canvas uses, so a burned-in export matches what a coach sees on
 * screen. Sorted by id so two frames with the same visible set in a
 * different iteration order still produce an identical signature.
 */
export function computeFrameSignature(
  annotations: SpanAnnotationLike[],
  t: number,
  revealSteps: number = DEFAULT_MAX_REVEAL_STEPS,
  holdElapsedFor: (annotation: SpanAnnotationLike) => number = () => 0,
  elapsed?: ElapsedBetween
): AnnotationVisualState[] {
  const states: AnnotationVisualState[] = []
  for (const annotation of annotations) {
    const { visible, opacity } = annotationStateAt(annotation, t, elapsed)
    if (!visible || opacity <= 0) continue
    const holdElapsed = holdElapsedFor(annotation)
    if (!isRevealDue(annotation.startTime, t, holdElapsed, annotation.revealDelay, elapsed)) continue
    const noReveal = annotation.toolType !== undefined && revealKind(annotation.toolType) === 'none'
    const fraction =
      noReveal || revealSteps <= 1 ? 1 : revealFraction(revealElapsed(annotation.startTime, t, holdElapsed, annotation.revealDelay, elapsed), annotation.drawIn)
    const revealBucket = fraction >= 1 ? revealSteps : Math.floor(fraction * revealSteps)
    states.push({ id: annotation.id, opacityBucket: quantizeOpacity(opacity), revealBucket, revealSteps })
  }
  states.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return states
}

/**
 * A play frame's source time, lifted to its frame's exact start when it sits in
 * the sliver just below it (float error in the even spacing of
 * `frameSourceTimes`), so a drawing starting exactly on the frame shows on it.
 */
function sampleTime(srcTime: number, sourceFps: number): number {
  return Math.max(srcTime, frameStart(frameIndexAt(srcTime, sourceFps), sourceFps))
}

/**
 * Walks every output frame (via `framePresentations`) and groups consecutive
 * frames with an identical visual signature into spans. Each span renders to
 * exactly one drawing-layer PNG (see `clipRenderer.renderClip`): a clip with
 * one static drawing produces ~2-3 spans (before it appears, while it's
 * shown, after it's gone — fewer if it spans the whole clip); a fade
 * produces up to one span per source frame the fade covers, since opacity
 * changes every frame while animating. A draw-on adds up to `maxRevealSteps`
 * spans while it reveals; a hold on or after the annotation's start frame
 * (matched by source frame index, since the hold usually belongs to a separate
 * freeze marker recorded a frame or two later) keeps the reveal running while
 * the source frame is frozen.
 */
export function buildDrawingSpans(
  segments: OutputSegment[],
  annotations: SpanAnnotationLike[],
  fps: number,
  opts: SpanOptions = {}
): DrawingSpan[] {
  const sourceFps = opts.sourceFps ?? fps
  const revealSteps = opts.maxRevealSteps ?? DEFAULT_MAX_REVEAL_STEPS
  const frames = framePresentations(segments, fps)
  const spans: DrawingSpan[] = []

  const holdElapsedAt = holdElapsedResolver(segments, annotations, sourceFps)
  const { speedSteps } = opts
  const elapsed: ElapsedBetween | undefined = speedSteps ? (a, b) => presentationOffset(speedSteps, a, b) : undefined

  let currentKey: string | null = null
  let currentSignature: AnnotationVisualState[] = []
  let spanStart = 0

  frames.forEach((frame, i) => {
    const signature = computeFrameSignature(annotations, sampleTime(frame.srcTime, sourceFps), revealSteps, (annotation) => holdElapsedAt(annotation, frame), elapsed)
    const key = signatureKey(signature)
    if (key !== currentKey) {
      if (currentKey !== null) {
        spans.push({ signature: currentSignature, frameStart: spanStart, frameCount: i - spanStart })
      }
      currentKey = key
      currentSignature = signature
      spanStart = i
    }
  })

  if (currentKey !== null) {
    spans.push({ signature: currentSignature, frameStart: spanStart, frameCount: frames.length - spanStart })
  }

  return spans
}

/**
 * Hold time that counts toward each annotation's presentation time at an
 * output frame: every hold whose source frame index is on or after the
 * annotation's start frame (a freeze is usually recorded a frame or two after
 * the drawing). Annotations without presentation timing always get 0.
 */
export function holdElapsedResolver<A extends AnnotationTimingInput>(
  segments: OutputSegment[],
  annotations: A[],
  sourceFps: number
): (annotation: A, frame: FramePresentation) => number {
  const holdInfo = new Map<A, { matches: boolean[]; before: number[] }>()
  for (const annotation of annotations) {
    if (!hasPresentationTiming(annotation)) continue
    const startFrame = frameIndexAt(annotation.startTime, sourceFps)
    const matches = segments.map((seg) => seg.kind === 'hold' && frameIndexAt(seg.srcTime, sourceFps) >= startFrame)
    const before: number[] = []
    let accrued = 0
    segments.forEach((seg, i) => {
      before.push(accrued)
      if (matches[i] && seg.kind === 'hold') accrued += seg.duration
    })
    holdInfo.set(annotation, { matches, before })
  }
  return (annotation, frame) => {
    const info = holdInfo.get(annotation)
    if (!info) return 0
    return info.before[frame.segmentIndex] + (info.matches[frame.segmentIndex] ? frame.holdElapsed : 0)
  }
}

/**
 * The first output frame on which `annotation`'s `revealDelay` has passed
 * (the same rule `computeFrameSignature` applies), 0 when it has no delay, or
 * `Infinity` when it never comes due in these segments.
 */
export function firstDueFrame(segments: OutputSegment[], annotation: AnnotationTimingInput, fps: number, sourceFps: number = fps): number {
  if (!(annotation.revealDelay !== undefined && annotation.revealDelay > 0)) return 0
  const holdElapsedAt = holdElapsedResolver(segments, [annotation], sourceFps)
  const frames = framePresentations(segments, fps)
  for (let i = 0; i < frames.length; i++) {
    if (isRevealDue(annotation.startTime, sampleTime(frames[i].srcTime, sourceFps), holdElapsedAt(annotation, frames[i]), annotation.revealDelay)) return i
  }
  return Infinity
}

/**
 * `buildDrawingSpans` with the fewest reveal-step reductions (12, 6, 3, 1)
 * that keep the job within `MAX_DISTINCT_OVERLAYS` distinct overlay PNGs.
 * Returns the 1-step result if even that is over budget.
 */
export function buildDrawingSpansWithinBudget(
  segments: OutputSegment[],
  annotations: SpanAnnotationLike[],
  fps: number,
  opts: SpanOptions = {}
): DrawingSpan[] {
  let spans: DrawingSpan[] = []
  for (const maxRevealSteps of [12, 6, 3, 1]) {
    spans = buildDrawingSpans(segments, annotations, fps, { ...opts, maxRevealSteps })
    if (new Set(spans.map((s) => signatureKey(s.signature))).size <= MAX_DISTINCT_OVERLAYS) return spans
  }
  return spans
}
