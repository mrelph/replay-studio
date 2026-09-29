// Shared contracts for clips and multi-clip export. See docs/CLIPS_PLAN.md.
// Changing these requires updating the store, the export engine, the main
// process encoder and the project serializer together.

/** A named range of the source video that exports as its own file. */
export interface Clip {
  id: string
  name: string
  /** Source-video seconds, inclusive. */
  start: number
  /** Source-video seconds, exclusive. Always > start. */
  end: number
  /** CSS color used for the timeline bar and list swatch. */
  color: string
}

/**
 * One stretch of an exported file's timeline, in output order.
 * `play` copies source time [srcStart, srcEnd); `hold` repeats the frame at
 * srcTime for `duration` seconds (a freeze-frame annotation), with silence.
 */
export type OutputSegment =
  | { kind: 'play'; srcStart: number; srcEnd: number }
  | { kind: 'hold'; srcTime: number; duration: number }

/** Result of probing the source video in the main process. */
export interface VideoProbe {
  width: number
  height: number
  /** Average frame rate (e.g. 29.97, 59.94). */
  fps: number
  duration: number
  hasAudio: boolean
}

export type ClipExportQuality = 'high' | 'medium' | 'low'

/**
 * Starts an ffmpeg-driven encode job for one clip: ffmpeg decodes
 * `sourcePath` directly (accurate input seek near the clip start) and builds
 * the base output timeline from `segments` (unchanged from the previous
 * design: `play` copies source time, `hold` freezes a frame). No frames are
 * streamed from the renderer any more — the renderer instead renders a
 * transparent drawing-layer overlay as PNGs (`clipEncodeAddOverlay`) and
 * describes how they, plus any magnifier ops, map onto the output timeline
 * (`clipEncodeRun`).
 */
export interface ClipEncodeStartOptions {
  /** Absolute path; must be inside a folder returned by chooseExportFolder. */
  outputPath: string
  /** Absolute path of the source video (resolveVideoPath of the loaded src). */
  sourcePath: string
  width: number
  height: number
  fps: number
  /** Total output frame count; also the frame the video stream is capped to. */
  frameCount: number
  quality: ClipExportQuality
  segments: OutputSegment[]
}

export type ClipEncodeStartResult =
  | { ok: true; jobId: string }
  | { ok: false; error: string }

/** Result of adding one overlay PNG to a job; `index` is its 0-based slot. */
export type ClipEncodeAddOverlayResult =
  | { ok: true; index: number }
  | { ok: false; error: string }

/**
 * Maps a contiguous run of output frames (`[frameStart, frameStart +
 * frameCount)`) onto one overlay PNG, added earlier via
 * `clipEncodeAddOverlay` and referenced here by its returned `index`. Spans
 * must be contiguous and cover exactly `[0, frameCount)` with no gaps or
 * overlaps.
 */
export interface OverlaySpan {
  overlayIndex: number
  frameStart: number
  frameCount: number
}

/** An axis-aligned pixel rectangle in the source video's native resolution. */
export interface MagnifierSourceRect {
  x: number
  y: number
  width: number
  height: number
}

/** A circle in the output video's native (pre-quality-scale) pixel space. */
export interface MagnifierDestCircle {
  centerX: number
  centerY: number
  radius: number
}

/** An output-time window (seconds) during which a magnifier op is enabled. */
export interface MagnifierEnableWindow {
  start: number
  end: number
}

/**
 * One magnifier annotation's live-video zoom, expressed entirely in output
 * space: crop `sourceRect` out of the (already time-mapped) base video,
 * scale it up, mask it to a circle, and overlay it at `destCircle` during
 * `enable` (output-time seconds; a magnifier spanning a hold is enabled for
 * that hold's whole duration). The drawing-layer PNG for the same magnifier
 * renders only its ring/border (see docs/CLIPS_PLAN.md); the live-sampled
 * fill is composited by ffmpeg from this op.
 */
export interface MagnifierOp {
  sourceRect: MagnifierSourceRect
  destCircle: MagnifierDestCircle
  enable: MagnifierEnableWindow[]
}

/** Payload for `clipEncodeRun`: how the drawing-layer overlays and magnifier ops map onto the output timeline. */
export interface ClipEncodeRunOptions {
  spans: OverlaySpan[]
  magnifiers: MagnifierOp[]
}

export interface ClipEncodeProgressEvent {
  jobId: string
  /** 0-100. */
  percent: number
}

export interface ClipExportResult {
  success: boolean
  error?: string
}
