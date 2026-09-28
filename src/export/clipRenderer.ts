import { fabric } from '@/lib/fabric'
import type { Annotation } from '@/stores/drawingStore'
import { deserializeFabricObject, serializeFabricObject } from '@/utils/projectSerializer'
import type { Clip, ClipExportQuality, OutputSegment, VideoProbe } from '@/types/clip'
import { annotationStateAt } from './annotationTiming'
import { buildOutputTimeline, segmentFrameCounts } from './outputTimeline'

export interface RenderClipOptions {
  clip: Clip
  /** The loaded video's local-video:// URL (same one the live player uses). */
  videoUrl: string
  probe: VideoProbe
  /** Live annotations from `useDrawingStore` (not touched — everything is cloned). */
  annotations: Annotation[]
  includeDrawings: boolean
  quality: ClipExportQuality
  outputPath: string
  sourcePath: string
  onProgress: (framesDone: number, frameCount: number) => void
  signal: AbortSignal
}

export interface RenderClipResult {
  success: boolean
  error?: string
  droppedFrames: number
}

/** JPEG quality passed to encode; matches the plan's benchmark (~19ms/frame at 1080p). */
const JPEG_QUALITY = 0.92

/** Magnifier zoom factor, matching `updateMagnifierContent` in DrawingCanvas.tsx. */
const MAGNIFIER_ZOOM_LEVEL = 2.5

/**
 * Max number of `clipEncodeFrame` calls allowed to be in flight at once.
 * This is the export engine's memory/backpressure bound: JPEG-encoded
 * frames queued here are held in renderer memory until the main process's
 * ffmpeg stdin has room, so this must stay small. See "Backpressure" below.
 */
const MAX_PENDING_FRAMES = 4

/**
 * Tolerance, in seconds, used when comparing a presented video frame's
 * `metadata.mediaTime` against a scheduled output-frame time. Half of a
 * 120fps frame interval — generous enough to absorb browser frame-timing
 * jitter, tight enough not to misclassify a genuinely skipped frame.
 */
const FRAME_EPSILON_SECONDS = 1 / 240

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
export interface MagnifierSampleRect {
  sourceX: number
  sourceY: number
  sourceWidth: number
  sourceHeight: number
  /** Width/height of the square output tile (before circular clipping). */
  size: number
}

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

/**
 * Repaints a cloned magnifier circle's pattern fill from the given video
 * element's currently-decoded frame. Imperative twin of
 * `computeMagnifierSampleRect`; not unit tested (needs a real canvas 2D
 * context and decoded video frame), kept intentionally close to
 * `updateMagnifierContent` in DrawingCanvas.tsx so the two stay in visual
 * sync.
 */
function paintMagnifier(
  video: HTMLVideoElement,
  circle: fabric.Circle,
  refDims: { width: number; height: number },
  videoDims: { width: number; height: number }
) {
  const radius = circle.radius || 60
  const rect = computeMagnifierSampleRect(
    { left: circle.left || 0, top: circle.top || 0, radius },
    MAGNIFIER_ZOOM_LEVEL,
    refDims,
    videoDims
  )

  const tempCanvas = document.createElement('canvas')
  tempCanvas.width = rect.size
  tempCanvas.height = rect.size
  const ctx = tempCanvas.getContext('2d')
  if (!ctx) return

  ctx.save()
  ctx.beginPath()
  ctx.arc(radius, radius, radius - 4, 0, Math.PI * 2)
  ctx.clip()
  try {
    ctx.drawImage(
      video,
      rect.sourceX,
      rect.sourceY,
      rect.sourceWidth,
      rect.sourceHeight,
      0,
      0,
      rect.size,
      rect.size
    )
  } catch {
    // Frame not decoded yet; leave the tile blank for this frame.
  }
  ctx.restore()

  ctx.strokeStyle = '#00d4ff'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.arc(radius, radius, radius - 2, 0, Math.PI * 2)
  ctx.stroke()

  ctx.strokeStyle = 'rgba(0, 212, 255, 0.6)'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(radius - 15, radius)
  ctx.lineTo(radius + 15, radius)
  ctx.moveTo(radius, radius - 15)
  ctx.lineTo(radius, radius + 15)
  ctx.stroke()

  const patternSource = tempCanvas as unknown as fabric.IPatternOptions['source']
  const pattern = new fabric.Pattern({ source: patternSource, repeat: 'no-repeat' })
  circle.set({ fill: pattern, dirty: true })
}

/**
 * Detached clone of a live annotation's Fabric object, so the export never
 * touches the live canvas. Fabric's own clone() keeps every property
 * (shadow blur, dash arrays, groups). Magnifiers go through the project
 * serializer instead: their pattern fill wraps the live <video> element,
 * which clone() would try to reload as an image; the export repaints that
 * fill every frame anyway (paintMagnifier).
 */
function cloneAnnotationObject(object: fabric.Object, isMagnifier: boolean): Promise<fabric.Object> {
  if (isMagnifier) {
    const data = serializeFabricObject(object)
    return Promise.resolve(deserializeFabricObject(fabric, data) as fabric.Object)
  }
  return new Promise((resolve) => object.clone((copy: fabric.Object) => resolve(copy)))
}

function once(target: EventTarget, successEvent: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSuccess = () => {
      target.removeEventListener(successEvent, onSuccess)
      target.removeEventListener('error', onError)
      resolve()
    }
    const onError = () => {
      target.removeEventListener(successEvent, onSuccess)
      target.removeEventListener('error', onError)
      reject(new Error(`Video element emitted "error" while waiting for "${successEvent}"`))
    }
    target.addEventListener(successEvent, onSuccess)
    target.addEventListener('error', onError)
  })
}

/**
 * Seeks to `time` and waits for the browser to finish, but skips the
 * seek+wait entirely when the video is already there. This matters because
 * a hold segment always ends exactly where the next play segment begins
 * (the timeline is built as play→hold→play with a shared boundary time), so
 * every freeze-frame would otherwise re-set `currentTime` to its current
 * value on the very next segment — and some browsers never fire `seeked`
 * for a no-op seek, which would hang the export indefinitely.
 */
async function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  if (Math.abs(video.currentTime - time) < 1e-3) return
  video.currentTime = time
  await once(video, 'seeked')
}

function waitForVideoFrame(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve) => {
    video.requestVideoFrameCallback(() => resolve())
  })
}

async function encodeJpeg(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('canvas.toBlob produced no data'))),
      'image/jpeg',
      JPEG_QUALITY
    )
  })
  return new Uint8Array(await blob.arrayBuffer())
}

/**
 * Renders one clip to an MP4 with its drawings burned in (or not), by
 * playing a hidden, muted copy of the source video at 1x and compositing
 * each presented frame with the clip's annotations, then streaming JPEGs to
 * the main-process ffmpeg job started via `clipEncodeStart`.
 *
 * ## Coordinate scaling
 * Annotations are authored directly in video-native pixel coordinates (see
 * the "reference dimensions" comments in `DrawingCanvas.tsx`) — the live
 * canvas only applies a *display* zoom on top, it never rescales the
 * objects themselves. Since `probe.width`/`probe.height` are the same
 * video's native resolution (both ultimately come from decoding the same
 * file), the offscreen `fabric.StaticCanvas` here is created at exactly
 * `probe.width x probe.height` with no zoom applied — cloned objects land
 * in the same pixels they occupy on screen, with no scale correction
 * needed at all.
 *
 * ## Magnifier / spotlight parity
 * "Spotlight" annotations are plain `fabric.Ellipse` objects (see
 * `SpotlightTool.ts` — it exists but is dead code; the live spotlight tool
 * in `DrawingCanvas.tsx` just draws an Ellipse), so the generic
 * serialize/clone path reproduces them with no special case. Magnifiers are
 * different: their live fill is a `fabric.Pattern` sampled from the video
 * element every frame, which `serializeFabricObject` cannot capture (it
 * only serializes string fills). So a cloned magnifier circle is repainted
 * every output frame via `paintMagnifier`, sampling from this render's own
 * hidden video element at whatever time it's currently showing — the same
 * approach `updateMagnifierContent` uses for the live view.
 *
 * ## Capture and backpressure
 * See the per-segment helpers below (`capturePlaySegment`,
 * `captureHoldSegment`) and `sendFrame` for the detailed design; summary in
 * the worker report.
 */
export async function renderClip(opts: RenderClipOptions): Promise<RenderClipResult> {
  const { clip, videoUrl, probe, annotations, includeDrawings, quality, outputPath, sourcePath, onProgress, signal } =
    opts

  const { segments, frameCount } = buildOutputTimeline(clip, annotations, probe.fps)
  const segmentCounts = segmentFrameCounts(segments, probe.fps)

  if (signal.aborted) {
    return { success: false, error: 'Cancelled', droppedFrames: 0 }
  }

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
  if (!startResult.ok) {
    return { success: false, error: startResult.error, droppedFrames: 0 }
  }
  const { jobId } = startResult

  // --- Hidden capture video --------------------------------------------
  // Attached to the document (off-screen) rather than fully detached:
  // some Chromium versions throttle or never decode frames for media
  // elements that were never inserted into the DOM.
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  video.playbackRate = 1
  video.style.position = 'fixed'
  video.style.left = '-99999px'
  video.style.top = '0px'
  video.style.width = '1px'
  video.style.height = '1px'
  document.body.appendChild(video)

  const compositeCanvas = document.createElement('canvas')
  compositeCanvas.width = probe.width
  compositeCanvas.height = probe.height
  const compositeCtx = compositeCanvas.getContext('2d', { alpha: false })

  const refDims = { width: probe.width, height: probe.height }

  interface ClonedAnnotation {
    source: Annotation
    clone: fabric.Object
    isMagnifier: boolean
  }

  let staticCanvas: fabric.StaticCanvas | null = null
  const cloned: ClonedAnnotation[] = []

  if (includeDrawings) {
    staticCanvas = new fabric.StaticCanvas(null, { width: probe.width, height: probe.height })
    for (const annotation of annotations) {
      const isMagnifier = annotation.toolType === 'magnifier'
      const clone = await cloneAnnotationObject(annotation.object, isMagnifier)
      staticCanvas.add(clone)
      cloned.push({ source: annotation, clone, isMagnifier })
    }
  }

  let framesDone = 0
  let droppedFrames = 0
  let cancelled = false
  let pending: Promise<void>[] = []

  const onAbort = () => {
    cancelled = true
    try {
      video.pause()
    } catch {
      // ignore
    }
  }
  signal.addEventListener('abort', onAbort)

  function cleanup() {
    signal.removeEventListener('abort', onAbort)
    try {
      video.pause()
    } catch {
      // ignore
    }
    video.removeAttribute('src')
    video.load()
    video.remove()
    staticCanvas?.dispose()
  }

  /** Waits until at most MAX_PENDING_FRAMES-1 sends remain in flight. */
  async function flushPending() {
    if (pending.length === 0) return
    const batch = pending
    pending = []
    await Promise.all(batch)
  }

  /**
   * Queues one encoded frame for the main process and applies backpressure.
   *
   * `clipEncodeFrame` already resolves only once ffmpeg's stdin has
   * accepted the bytes, so awaiting every call individually would already
   * be "correct" backpressure — but it would also serialize IPC round-trip
   * latency into the realtime capture loop, turning normal IPC jitter into
   * dropped source frames. Instead, up to MAX_PENDING_FRAMES sends are
   * allowed in flight at once (bounding renderer memory to a handful of
   * JPEGs); once the queue is full, the video is paused so no more source
   * time is consumed, the whole batch is drained, and playback resumes.
   * Because pausing freezes `video.currentTime`, resuming picks up exactly
   * where capture left off — no source frames are actually skipped by
   * this pause. (If Chromium's playback clock ever failed to freeze
   * cleanly across a pause/resume, the ordinary "due" catch-up logic in
   * `capturePlaySegment` already treats any resulting mediaTime jump as
   * dropped frames, so this stays correct either way — see the
   * mid-segment resume comment there for how `signal`-driven throttling
   * shares that same path.)
   */
  async function sendFrame(bytes: Uint8Array, throttleVideo: HTMLVideoElement | null) {
    const task = window.electronAPI.clipEncodeFrame(jobId, bytes).then(() => undefined)
    pending.push(task)
    framesDone += 1
    onProgress(framesDone, frameCount)

    if (pending.length >= MAX_PENDING_FRAMES) {
      const shouldResume = !!throttleVideo && !throttleVideo.paused
      throttleVideo?.pause()
      await flushPending()
      if (shouldResume && !cancelled && !signal.aborted) {
        try {
          await throttleVideo!.play()
        } catch {
          // Aborted mid-resume, or playback ended; the caller's loop checks
          // cancelled/signal.aborted right after this returns.
        }
      }
    }
  }

  /** Draws the video's current frame plus (optionally) annotations for `annotationTime`. */
  async function compositeFrame(annotationTime: number): Promise<Uint8Array> {
    if (!compositeCtx) throw new Error('Could not create a 2D canvas context for export')

    compositeCtx.drawImage(video, 0, 0, probe.width, probe.height)

    if (staticCanvas) {
      const videoDims = { width: video.videoWidth || probe.width, height: video.videoHeight || probe.height }
      for (const c of cloned) {
        const state = annotationStateAt(c.source, annotationTime)
        c.clone.visible = state.visible
        c.clone.opacity = state.opacity
        if (c.isMagnifier && state.visible) {
          paintMagnifier(video, c.clone as fabric.Circle, refDims, videoDims)
        }
      }
      staticCanvas.renderAll()
      compositeCtx.drawImage(staticCanvas.getElement(), 0, 0, probe.width, probe.height)
    }

    return encodeJpeg(compositeCanvas)
  }

  /**
   * Captures a `play` segment by seeking to its start and playing at 1x,
   * using `requestVideoFrameCallback`'s `mediaTime` to know exactly which
   * source instant each presented frame represents (this is the technique
   * the plan's benchmark found necessary — per-frame seeking is ~115ms/frame,
   * too slow, while 1x playback delivers every frame via rVFC).
   *
   * `targetTimes[i]` is the source time output frame `i` (of this segment)
   * should show, evenly spaced across `[srcStart, srcEnd)`. On each
   * callback we check how many of the still-pending targets the just-
   * presented frame satisfies ("due"): normally exactly one. Zero means
   * we're still waiting for playback to catch up. More than one means the
   * decoder's presented frames skipped over one or more targets (a real
   * source frame drop, or our own backpressure pause resuming with some
   * slack) — those extra frames are backfilled by repeating the current
   * composite and counted in `droppedFrames`, per the plan.
   */
  async function capturePlaySegment(seg: Extract<OutputSegment, { kind: 'play' }>, segFrameCount: number) {
    if (segFrameCount === 0 || cancelled || signal.aborted) return

    const segDuration = seg.srcEnd - seg.srcStart
    const targetTimes = Array.from({ length: segFrameCount }, (_, i) => seg.srcStart + segDuration * (i / segFrameCount))

    await seekTo(video, seg.srcStart)
    await waitForVideoFrame(video)
    if (cancelled || signal.aborted) return

    try {
      await video.play()
    } catch {
      // Playback can reject if aborted concurrently; the loop below exits via the cancelled/aborted checks.
    }

    let nextIndex = 0
    let lastBytes: Uint8Array | null = null

    await new Promise<void>((resolve) => {
      const onFrame = (_now: number, metadata: VideoFrameCallbackMetadata) => {
        void (async () => {
          if (cancelled || signal.aborted || nextIndex >= segFrameCount) {
            resolve()
            return
          }

          const mediaTime = metadata.mediaTime
          let due = 0
          while (nextIndex + due < segFrameCount && targetTimes[nextIndex + due] <= mediaTime + FRAME_EPSILON_SECONDS) {
            due += 1
          }
          // Flush any remaining targets once we've reached the segment end,
          // even if float rounding left the last one a hair beyond mediaTime.
          if (due === 0 && nextIndex < segFrameCount && mediaTime >= seg.srcEnd - FRAME_EPSILON_SECONDS) {
            due = segFrameCount - nextIndex
          }

          if (due > 0) {
            const bytes = await compositeFrame(targetTimes[nextIndex])
            lastBytes = bytes
            await sendFrame(bytes, video)
            for (let extra = 1; extra < due; extra++) {
              droppedFrames += 1
              await sendFrame(lastBytes, video)
            }
            nextIndex += due
          }

          if (nextIndex >= segFrameCount || cancelled || signal.aborted) {
            resolve()
            return
          }

          video.requestVideoFrameCallback(onFrame)
        })()
      }

      video.requestVideoFrameCallback(onFrame)
    })

    try {
      video.pause()
    } catch {
      // ignore
    }

    // Safety net: guarantee exactly segFrameCount frames left this segment
    // even if playback ended or was interrupted before rVFC delivered them
    // all (e.g. the segment runs to the very end of the source file).
    while (!cancelled && !signal.aborted && nextIndex < segFrameCount) {
      if (!lastBytes) {
        lastBytes = await compositeFrame(seg.srcEnd)
      }
      droppedFrames += 1
      await sendFrame(lastBytes, null)
      nextIndex += 1
    }
  }

  /** Captures a `hold` segment: render the frozen frame once, repeat it `segFrameCount` times. */
  async function captureHoldSegment(seg: Extract<OutputSegment, { kind: 'hold' }>, segFrameCount: number) {
    if (segFrameCount === 0 || cancelled || signal.aborted) return

    try {
      video.pause()
    } catch {
      // ignore
    }
    await seekTo(video, seg.srcTime)
    await waitForVideoFrame(video)
    if (cancelled || signal.aborted) return

    const bytes = await compositeFrame(seg.srcTime)
    for (let i = 0; i < segFrameCount; i++) {
      if (cancelled || signal.aborted) return
      await sendFrame(bytes, null)
    }
  }

  try {
    video.src = videoUrl
    if (video.readyState < 1) {
      await once(video, 'loadedmetadata')
    }

    for (let i = 0; i < segments.length; i++) {
      if (cancelled || signal.aborted) break
      const seg = segments[i]
      const segFrameCount = segmentCounts[i]
      if (seg.kind === 'play') {
        await capturePlaySegment(seg, segFrameCount)
      } else {
        await captureHoldSegment(seg, segFrameCount)
      }
    }

    await flushPending()

    if (cancelled || signal.aborted) {
      await window.electronAPI.clipEncodeCancel(jobId)
      return { success: false, error: 'Cancelled', droppedFrames }
    }

    const finishResult = await window.electronAPI.clipEncodeFinish(jobId)
    return { success: finishResult.success, error: finishResult.error, droppedFrames }
  } catch (err) {
    try {
      await window.electronAPI.clipEncodeCancel(jobId)
    } catch {
      // best-effort cleanup
    }
    return { success: false, error: err instanceof Error ? err.message : 'Export failed', droppedFrames }
  } finally {
    cleanup()
  }
}
