import type { Clip, MagnifierOp, OutputSegment, VideoProbe } from '@/types/clip'
import type { AnnotationTimingInput } from './annotationTiming'
import { segmentFrameCounts } from './outputTimeline'

/** Magnifier zoom factor, matching `updateMagnifierContent` in DrawingCanvas.tsx. */
export const MAGNIFIER_ZOOM_LEVEL = 2.5

export interface MagnifierSampleRect {
  sourceX: number
  sourceY: number
  sourceWidth: number
  sourceHeight: number
  /** Width/height of the square output tile (before circular clipping). */
  size: number
}

/**
 * Computes the video-native source rectangle a magnifier annotation should
 * sample from, reproducing `updateMagnifierContent` (DrawingCanvas.tsx)
 * exactly, but as a pure function so the math can be unit tested without a
 * real `<video>`/canvas. `refDims` is the coordinate space annotations are
 * authored in (video-native resolution); `videoDims` is the actual decoded
 * video frame size. In practice the two are equal (both derive from the
 * same file), so `scaleX`/`scaleY` are normally 1, but the scaling is kept
 * for parity with the live code path in case of rounding differences
 * between ffmpeg's probe and the browser's decoded `videoWidth`/`videoHeight`.
 */
export function computeMagnifierSampleRect(
  circle: { left: number; top: number; radius: number },
  zoomLevel: number,
  refDims: { width: number; height: number },
  videoDims: { width: number; height: number }
): MagnifierSampleRect {
  const { radius } = circle
  const centerX = circle.left + radius
  const centerY = circle.top + radius
  const size = radius * 2

  const scaleX = videoDims.width / refDims.width
  const scaleY = videoDims.height / refDims.height

  const sourceSize = size / zoomLevel
  const rawSourceX = (centerX - sourceSize / 2) * scaleX
  const rawSourceY = (centerY - sourceSize / 2) * scaleY
  const rawSourceWidth = sourceSize * scaleX
  const rawSourceHeight = sourceSize * scaleY

  const sourceX = Math.max(0, rawSourceX)
  const sourceY = Math.max(0, rawSourceY)
  const sourceWidth = Math.min(rawSourceWidth, videoDims.width - sourceX)
  const sourceHeight = Math.min(rawSourceHeight, videoDims.height - sourceY)

  return { sourceX, sourceY, sourceWidth, sourceHeight, size }
}

/** The fields `buildMagnifierOps` needs from a live magnifier `Annotation`. */
export interface MagnifierAnnotationLike extends AnnotationTimingInput {
  id: string
  /** The magnifier circle's video-native geometry (fixed for its lifetime — it doesn't move). */
  circle: { left: number; top: number; radius: number }
}

/**
 * Maps each magnifier annotation to a `MagnifierOp`: a fixed source sample
 * rect (video-native px, via `computeMagnifierSampleRect`) and destination
 * circle (also native px — quality scaling happens after compositing), plus
 * the output-time window(s) during which it should be enabled.
 *
 * A magnifier is "enabled" wherever `annotationStateAt(...).visible` would
 * be true — i.e. for its whole `[startTime, endTime]` window, ignoring
 * fade-in/out opacity (approximated as fully visible; see docs/CLIPS_PLAN.md
 * "Magnifier fade" note). That source-time window is walked segment by
 * segment: a `play` segment contributes the linearly-mapped overlapping
 * sub-range of output time, and a `hold` segment contributes its *entire*
 * output-time range whenever the hold's `srcTime` itself falls inside the
 * magnifier's visible window (so a magnifier spanning a freeze-frame stays
 * on through the whole hold, matching the live view where the magnifier
 * would otherwise flicker on a single repeated frame).
 *
 * Magnifiers with no resulting enable window (never visible during the
 * clip) are omitted from the result.
 */
export function buildMagnifierOps(
  clip: Pick<Clip, 'start' | 'end'>,
  segments: OutputSegment[],
  magnifiers: MagnifierAnnotationLike[],
  fps: number,
  probe: Pick<VideoProbe, 'width' | 'height'>,
  zoomLevel: number = MAGNIFIER_ZOOM_LEVEL
): MagnifierOp[] {
  const counts = segmentFrameCounts(segments, fps)
  let cumulativeFrames = 0
  const segmentTimeRanges = segments.map((seg, i) => {
    const outStart = cumulativeFrames / fps
    cumulativeFrames += counts[i]
    const outEnd = cumulativeFrames / fps
    return { seg, outStart, outEnd }
  })

  const ops: MagnifierOp[] = []

  for (const magnifier of magnifiers) {
    const visStart = Math.max(magnifier.startTime, clip.start)
    const visEnd = Math.min(magnifier.endTime, clip.end)

    const enable: { start: number; end: number }[] = []
    if (visEnd > visStart) {
      for (const { seg, outStart, outEnd } of segmentTimeRanges) {
        if (seg.kind === 'play') {
          const overlapStart = Math.max(seg.srcStart, visStart)
          const overlapEnd = Math.min(seg.srcEnd, visEnd)
          if (overlapEnd > overlapStart) {
            const segDuration = seg.srcEnd - seg.srcStart
            const frac0 = segDuration > 0 ? (overlapStart - seg.srcStart) / segDuration : 0
            const frac1 = segDuration > 0 ? (overlapEnd - seg.srcStart) / segDuration : 0
            enable.push({
              start: outStart + frac0 * (outEnd - outStart),
              end: outStart + frac1 * (outEnd - outStart),
            })
          }
        } else if (seg.srcTime >= visStart && seg.srcTime <= visEnd) {
          if (outEnd > outStart) enable.push({ start: outStart, end: outEnd })
        }
      }
    }

    if (enable.length === 0) continue

    const rect = computeMagnifierSampleRect(magnifier.circle, zoomLevel, probe, probe)
    ops.push({
      sourceRect: { x: rect.sourceX, y: rect.sourceY, width: rect.sourceWidth, height: rect.sourceHeight },
      destCircle: {
        centerX: magnifier.circle.left + magnifier.circle.radius,
        centerY: magnifier.circle.top + magnifier.circle.radius,
        radius: magnifier.circle.radius,
      },
      enable,
    })
  }

  return ops
}
