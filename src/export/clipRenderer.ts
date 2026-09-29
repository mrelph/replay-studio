import { fabric } from '@/lib/fabric'
import type { Annotation } from '@/stores/drawingStore'
import { deserializeFabricObject, serializeFabricObject } from '@/utils/projectSerializer'
import type { Clip, ClipExportQuality, ClipExportResult, OverlaySpan, VideoProbe } from '@/types/clip'
import { buildOutputTimeline } from './outputTimeline'
import { buildDrawingSpans, signatureKey, type DrawingSpan, type SpanAnnotationLike } from './spanBuilder'
import { buildMagnifierOps, computeMagnifierSampleRect, MAGNIFIER_ZOOM_LEVEL, type MagnifierAnnotationLike } from './magnifierOps'

// Re-exported for `clipRenderer.test.ts` and any other caller that imported
// the magnifier math from this module before it moved to `magnifierOps.ts`.
export { computeMagnifierSampleRect, MAGNIFIER_ZOOM_LEVEL }
export type { MagnifierSampleRect } from './magnifierOps'

export interface RenderClipOptions {
  clip: Clip
  probe: VideoProbe
  /** Live annotations from `useDrawingStore` (not touched — everything is cloned). */
  annotations: Annotation[]
  includeDrawings: boolean
  quality: ClipExportQuality
  outputPath: string
  sourcePath: string
  /** 0-100; the first ~5% covers rendering drawing-layer PNGs, the rest tracks ffmpeg's own progress. */
  onProgress: (percent: number) => void
  signal: AbortSignal
}

export type RenderClipResult = ClipExportResult

/**
 * Detached clone of a live annotation's Fabric object for the drawing-layer
 * PNG, so the export never touches the live canvas. Fabric's own clone()
 * keeps every property (shadow blur, dash arrays, groups).
 */
function cloneAnnotationObject(object: fabric.Object): Promise<fabric.Object> {
  return new Promise((resolve) => object.clone((copy: fabric.Object) => resolve(copy)))
}

/**
 * Magnifiers go through the project serializer path instead of clone():
 * their live fill is a `fabric.Pattern` sampled from the video element,
 * which clone() would try to reload as an image. The drawing-layer PNG only
 * needs the magnifier's ring/border — the live-sampled zoomed video content
 * is composited separately by ffmpeg from a `MagnifierOp` (see
 * `magnifierOps.ts` / `electron/clipExport.ts`) — so the clone's fill is
 * forced transparent.
 */
function cloneMagnifierRing(object: fabric.Object): fabric.Object {
  const data = serializeFabricObject(object)
  const clone = deserializeFabricObject(fabric, data) as fabric.Object
  clone.set({ fill: 'rgba(0,0,0,0)' })
  return clone
}

interface ClonedAnnotation {
  annotationId: string
  clone: fabric.Object
}

/** Applies one span's visibility/opacity to every clone, renders, and encodes a transparent PNG. */
async function renderSpanRgba(
  staticCanvas: fabric.StaticCanvas,
  clones: ClonedAnnotation[],
  signature: DrawingSpan['signature']
): Promise<Uint8Array> {
  const bucketById = new Map(signature.map((s) => [s.id, s.opacityBucket]))
  for (const { annotationId, clone } of clones) {
    const bucket = bucketById.get(annotationId)
    if (bucket === undefined) {
      clone.visible = false
      clone.opacity = 0
    } else {
      clone.visible = true
      clone.opacity = bucket
    }
  }
  staticCanvas.renderAll()

  // Raw RGBA readback (~10 ms); PNG encoding happens in the main process
  // because canvas.toBlob is throttled to ~1 s per image. getImageData
  // returns straight (un-premultiplied) alpha, which is what PNG expects.
  const canvasEl = staticCanvas.getElement()
  const ctx = canvasEl.getContext('2d')
  if (!ctx) throw new Error('Could not read the drawing layer')
  const { data } = ctx.getImageData(0, 0, canvasEl.width, canvasEl.height)
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
}

/**
 * Renders a clip's drawing layer as a handful of transparent PNGs (one per
 * distinct visible-annotation signature — see `spanBuilder.ts`) and derives
 * magnifier ops (see `magnifierOps.ts`), then drives the main-process ffmpeg
 * job through the new job API (`clipEncodeStart` → `clipEncodeAddOverlay`* →
 * `clipEncodeRun`) to composite them onto the source video that ffmpeg
 * decodes directly. See docs/CLIPS_PLAN.md for the full design and why the
 * previous real-time `<video>` capture path was replaced.
 *
 * ## Coordinate scaling
 * Annotations are authored directly in video-native pixel coordinates (see
 * the "reference dimensions" comments in `DrawingCanvas.tsx`) — the live
 * canvas only applies a *display* zoom on top, it never rescales the
 * objects themselves. Since `probe.width`/`probe.height` are the same
 * video's native resolution, the offscreen `fabric.StaticCanvas` here is
 * created at exactly `probe.width x probe.height` with no zoom applied.
 */
export async function renderClip(opts: RenderClipOptions): Promise<RenderClipResult> {
  const { clip, probe, annotations, includeDrawings, quality, outputPath, sourcePath, onProgress, signal } = opts

  const { segments, frameCount } = buildOutputTimeline(clip, annotations, probe.fps)

  if (signal.aborted) return { success: false, error: 'Cancelled' }

  const startResult = await window.electronAPI.clipEncodeStart({
    outputPath,
    sourcePath,
    width: probe.width,
    height: probe.height,
    fps: probe.fps,
    frameCount,
    quality,
    segments,
  })
  if (!startResult.ok) return { success: false, error: startResult.error }
  const { jobId } = startResult

  const handleProgress = (evt: { jobId: string; percent: number }) => {
    if (evt.jobId !== jobId) return
    // Rendering PNGs is the first ~5%; ffmpeg's own -progress reporting fills the rest.
    onProgress(Math.min(100, 5 + Math.round(evt.percent * 0.95)))
  }
  window.electronAPI.onClipEncodeProgress(handleProgress)

  let staticCanvas: fabric.StaticCanvas | null = null

  const onAbort = () => {
    void window.electronAPI.clipEncodeCancel(jobId)
  }
  signal.addEventListener('abort', onAbort)

  try {
    if (!includeDrawings) {
      onProgress(5)
      if (signal.aborted) throw new Error('Cancelled')
      return await window.electronAPI.clipEncodeRun(jobId, { spans: [], magnifiers: [] })
    }

    const magnifierAnnotations = annotations.filter((a) => a.toolType === 'magnifier')
    const spanAnnotations: SpanAnnotationLike[] = annotations.map((a) => ({
      id: a.id,
      startTime: a.startTime,
      endTime: a.endTime,
      fadeIn: a.fadeIn,
      fadeOut: a.fadeOut,
    }))

    const spans = buildDrawingSpans(segments, spanAnnotations, probe.fps)

    // No retina scaling: the layer must be exactly the video's native pixel size.
    staticCanvas = new fabric.StaticCanvas(null, { width: probe.width, height: probe.height, enableRetinaScaling: false })
    const clones: ClonedAnnotation[] = []
    for (const annotation of annotations) {
      const isMagnifier = annotation.toolType === 'magnifier'
      const clone = isMagnifier ? cloneMagnifierRing(annotation.object) : await cloneAnnotationObject(annotation.object)
      staticCanvas.add(clone)
      clones.push({ annotationId: annotation.id, clone })
    }

    // Render each distinct signature once (dedup: a static drawing costs one PNG for its whole "on" span).
    const overlayIndexBySignatureKey = new Map<string, number>()
    const overlaySpans: OverlaySpan[] = []

    for (const span of spans) {
      if (signal.aborted) throw new Error('Cancelled')
      const key = signatureKey(span.signature)
      let index = overlayIndexBySignatureKey.get(key)
      if (index === undefined) {
        const rgba = await renderSpanRgba(staticCanvas, clones, span.signature)
        const added = await window.electronAPI.clipEncodeAddOverlay(jobId, rgba)
        if (!added.ok) throw new Error(added.error)
        index = added.index
        overlayIndexBySignatureKey.set(key, index)
      }
      overlaySpans.push({ overlayIndex: index, frameStart: span.frameStart, frameCount: span.frameCount })
    }

    staticCanvas.dispose()
    staticCanvas = null

    const magnifierLikes: MagnifierAnnotationLike[] = magnifierAnnotations.map((a) => {
      const circleObject = a.object as fabric.Circle
      return {
        id: a.id,
        startTime: a.startTime,
        endTime: a.endTime,
        fadeIn: a.fadeIn,
        fadeOut: a.fadeOut,
        circle: {
          left: circleObject.left || 0,
          top: circleObject.top || 0,
          radius: circleObject.radius || 60,
        },
      }
    })
    const magnifiers = buildMagnifierOps(clip, segments, magnifierLikes, probe.fps, probe)

    onProgress(5)
    if (signal.aborted) throw new Error('Cancelled')

    return await window.electronAPI.clipEncodeRun(jobId, { spans: overlaySpans, magnifiers })
  } catch (err) {
    try {
      await window.electronAPI.clipEncodeCancel(jobId)
    } catch {
      // best-effort cleanup
    }
    return { success: false, error: err instanceof Error ? err.message : 'Export failed' }
  } finally {
    signal.removeEventListener('abort', onAbort)
    window.electronAPI.removeClipEncodeProgressListener()
    staticCanvas?.dispose()
  }
}
