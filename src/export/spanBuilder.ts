import type { OutputSegment } from '@/types/clip'
import { annotationStateAt, type AnnotationTimingInput } from './annotationTiming'
import { frameSourceTimes } from './outputTimeline'

/**
 * The fields `computeFrameSignature`/`buildDrawingSpans` need from a live
 * `Annotation` (see `src/stores/drawingStore.ts`), kept structural so this
 * module doesn't need to import the full store type.
 */
export interface SpanAnnotationLike extends AnnotationTimingInput {
  id: string
}

/** One annotation's visual contribution to a frame, opacity bucketed. */
export interface AnnotationVisualState {
  id: string
  /** Opacity quantized to the nearest 1/50 (0.02). */
  opacityBucket: number
}

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
  return signature.map((s) => `${s.id}:${s.opacityBucket.toFixed(2)}`).join('|')
}

/**
 * The sorted list of (annotationId, quantized opacity) for every annotation
 * visible at source time `t`, per `annotationStateAt` — the same rule the
 * live canvas uses, so a burned-in export matches what a coach sees on
 * screen. Sorted by id so two frames with the same visible set in a
 * different iteration order still produce an identical signature.
 */
export function computeFrameSignature(annotations: SpanAnnotationLike[], t: number): AnnotationVisualState[] {
  const states: AnnotationVisualState[] = []
  for (const annotation of annotations) {
    const { visible, opacity } = annotationStateAt(annotation, t)
    if (!visible || opacity <= 0) continue
    states.push({ id: annotation.id, opacityBucket: quantizeOpacity(opacity) })
  }
  states.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return states
}

/**
 * Walks every output frame (via `frameSourceTimes`) and groups consecutive
 * frames with an identical visual signature into spans. Each span renders to
 * exactly one drawing-layer PNG (see `clipRenderer.renderClip`): a clip with
 * one static drawing produces ~2-3 spans (before it appears, while it's
 * shown, after it's gone — fewer if it spans the whole clip); a fade
 * produces up to one span per source frame the fade covers, since opacity
 * changes every frame while animating.
 */
export function buildDrawingSpans(
  segments: OutputSegment[],
  annotations: SpanAnnotationLike[],
  fps: number
): DrawingSpan[] {
  const times = frameSourceTimes(segments, fps)
  const spans: DrawingSpan[] = []

  let currentKey: string | null = null
  let currentSignature: AnnotationVisualState[] = []
  let spanStart = 0

  times.forEach((t, i) => {
    const signature = computeFrameSignature(annotations, t)
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
    spans.push({ signature: currentSignature, frameStart: spanStart, frameCount: times.length - spanStart })
  }

  return spans
}
