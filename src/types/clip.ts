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
 * Starts an ffmpeg job that reads JPEG frames from the renderer (stdin,
 * image2pipe at `fps`) and mixes audio from `sourcePath` following
 * `segments` (holds are silent). The renderer must then send exactly
 * `frameCount` frames via clipEncodeFrame, in order, and call clipEncodeFinish.
 */
export interface ClipEncodeStartOptions {
  /** Absolute path; must be inside a folder returned by chooseExportFolder. */
  outputPath: string
  /** Absolute path of the source video (resolveVideoPath of the loaded src). */
  sourcePath: string
  width: number
  height: number
  fps: number
  frameCount: number
  quality: ClipExportQuality
  segments: OutputSegment[]
}

export type ClipEncodeStartResult =
  | { ok: true; jobId: string }
  | { ok: false; error: string }
