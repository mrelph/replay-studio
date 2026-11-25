import type { OutputSegment } from '@/types/clip'
import { frameIndexAt } from '@/utils/frames'
import { annotationStateAt, isRevealDue, revealElapsed, revealFraction, type AnnotationTimingInput } from './annotationTiming'
import { framePresentations } from './outputTimeline'
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
  holdElapsedFor: (annotation: SpanAnnotationLike) => number = () => 0
): AnnotationVisualState[] {
  const states: AnnotationVisualState[] = []
  for (const annotation of annotations) {
    const { visible, opacity } = annotationStateAt(annotation, t)
    if (!visible || opacity <= 0) continue
    const holdElapsed = holdElapsedFor(annotation)
    if (!isRevealDue(annotation.startTime, t, holdElapsed, annotation.revealDelay)) continue
    const noReveal = annotation.toolType !== undefined && revealKind(annotation.toolType) === 'none'
    const fraction =
      noReveal || revealSteps <= 1 ? 1 : revealFraction(revealElapsed(annotation.startTime, t, holdElapsed, annotation.revealDelay), annotation.drawIn)
    const revealBucket = fraction >= 1 ? revealSteps : Math.floor(fraction * revealSteps)
    states.push({ id: annotation.id, opacityBucket: quantizeOpacity(opacity), revealBucket, revealSteps })
  }
  states.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return states
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

  // Per drawn annotation: which segments are holds on or after its start frame (presentation time since it
  // started includes every such hold), and the hold time accrued before each segment.
  const holdInfo = new Map<SpanAnnotationLike, { matches: boolean[]; before: number[] }>()
  for (const annotation of annotations) {
    if (!(annotation.drawIn && annotation.drawIn > 0) && !(annotation.revealDelay && annotation.revealDelay > 0)) continue
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

  let currentKey: string | null = null
  let currentSignature: AnnotationVisualState[] = []
  let spanStart = 0

  frames.forEach((frame, i) => {
    const holdElapsedFor = (annotation: SpanAnnotationLike) => {
      const info = holdInfo.get(annotation)
      if (!info) return 0
      return info.before[frame.segmentIndex] + (info.matches[frame.segmentIndex] ? frame.holdElapsed : 0)
    }
    const signature = computeFrameSignature(annotations, frame.srcTime, revealSteps, holdElapsedFor)
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
