// Multi-clip export encoder. See docs/CLIPS_PLAN.md.
//
// ffmpeg decodes the source video directly (accurate input seek near the
// clip start) and builds the output timeline from `OutputSegment[]`. The
// renderer supplies the drawing layer as transparent PNGs (one per distinct
// visible-annotation state), which are fed to ffmpeg as a second input via
// the concat demuxer and composited with `overlay`; magnifiers are
// reproduced by cropping/scaling/masking a region of the *base* (pre-overlay)
// video and overlaying it during output-time enable windows.
//
// Pure/testable pieces:
//  - parseFfmpegProbeOutput: turns `ffmpeg -i <path>` stderr into a VideoProbe.
//  - buildClipEncodeFilterGraph: turns encode options + overlay/magnifier
//    data into the ffmpeg argv.
//  - buildOverlayConcatList: the concat-demuxer list file content for the
//    overlay PNG timeline.
//  - validateClipEncodeOptions / validateOverlaySpans / validateMagnifierOps.
// Stateful job registry (spawn/drive one ffmpeg process per job):
//  - startClipEncodeJob / addOverlayToJob / runClipEncodeJob / cancelClipEncodeJob.
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { randomUUID } from 'crypto'
import fsp from 'fs/promises'
import os from 'os'
import path from 'path'
import zlib from 'zlib'
import type {
  ClipEncodeStartOptions,
  ClipEncodeStartResult,
  ClipExportFormat,
  ClipExportQuality,
  ClipExportResult,
  MagnifierOp,
  OutputSegment,
  OverlaySpan,
  SpeedGrid,
  VideoProbe,
} from '../src/types/clip'

// ---------------------------------------------------------------------------
// Probing
// ---------------------------------------------------------------------------

/**
 * Parses the stderr of `ffmpeg -hide_banner -i <path>` (ffmpeg always writes
 * this to stderr and exits non-zero because no output was requested).
 */
export function parseFfmpegProbeOutput(stderr: string): VideoProbe | { error: string } {
  if (typeof stderr !== 'string' || stderr.length === 0) {
    return { error: 'Empty ffmpeg output' }
  }

  const durationMatch = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr)
  if (!durationMatch) {
    return { error: 'Could not determine duration' }
  }
  const duration =
    Number(durationMatch[1]) * 3600 + Number(durationMatch[2]) * 60 + Number(durationMatch[3])

  const lines = stderr.split('\n')
  const videoLine = lines.find((line) => /:\s*Video:/.test(line))
  if (!videoLine) {
    return { error: 'No video stream found' }
  }

  const dimMatch = /(\d{2,6})x(\d{2,6})/.exec(videoLine)
  if (!dimMatch) {
    return { error: 'Could not determine video dimensions' }
  }
  const width = Number(dimMatch[1])
  const height = Number(dimMatch[2])

  const fpsMatch = /(\d+(?:\.\d+)?)\s*fps/.exec(videoLine)
  const tbrMatch = /(\d+(?:\.\d+)?)\s*tbr/.exec(videoLine)
  const fpsSource = fpsMatch ?? tbrMatch
  if (!fpsSource) {
    return { error: 'Could not determine frame rate' }
  }
  const fps = Number(fpsSource[1])

  const hasAudio = lines.some((line) => /:\s*Audio:/.test(line))

  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    !Number.isFinite(fps) ||
    !Number.isFinite(duration) ||
    width <= 0 ||
    height <= 0 ||
    fps <= 0 ||
    duration <= 0
  ) {
    return { error: 'Malformed ffmpeg probe output' }
  }

  return { width, height, fps, duration, hasAudio }
}

/** Runs `ffmpeg -hide_banner -i <filePath>` and parses its stderr. */
export function probeVideo(filePath: string, ffmpegPath: string): Promise<VideoProbe | { error: string }> {
  return new Promise((resolve) => {
    let stderr = ''
    let child: ChildProcessWithoutNullStreams
    try {
      child = spawn(ffmpegPath, ['-hide_banner', '-i', filePath])
    } catch (err) {
      resolve({ error: err instanceof Error ? err.message : 'Failed to start ffmpeg' })
      return
    }
    child.stdout.resume()
    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString()
    })
    child.on('error', (err) => {
      resolve({ error: err.message })
    })
    child.on('close', () => {
      resolve(parseFfmpegProbeOutput(stderr))
    })
  })
}

// ---------------------------------------------------------------------------
// Validation (pure)
// ---------------------------------------------------------------------------

const MAX_DIMENSION = 16384
const MAX_FPS = 300
const MAX_FRAME_COUNT = 20_000_000
const QUALITIES: ClipExportQuality[] = ['high', 'medium', 'low']

export const MAX_OVERLAYS_PER_JOB = 500
export const MAX_MAGNIFIERS_PER_JOB = 20
export const MAX_ENABLE_WINDOWS_PER_MAGNIFIER = 200
const MIN_SPEED = 0.1
const MAX_SPEED = 4

/** Returns an error message, or null when `options` is well-formed. */
export function validateClipEncodeOptions(options: ClipEncodeStartOptions): string | null {
  if (!options || typeof options !== 'object') return 'Invalid options'
  const { outputPath, sourcePath, width, height, fps, frameCount, quality, segments } = options

  if (typeof outputPath !== 'string' || outputPath.length === 0) return 'Invalid output path'
  if (typeof sourcePath !== 'string' || sourcePath.length === 0) return 'Invalid source path'
  if (!Number.isFinite(width) || width <= 0 || width > MAX_DIMENSION) return 'Invalid width'
  if (!Number.isFinite(height) || height <= 0 || height > MAX_DIMENSION) return 'Invalid height'
  if (!Number.isFinite(fps) || fps <= 0 || fps > MAX_FPS) return 'Invalid fps'
  if (!Number.isInteger(frameCount) || frameCount <= 0 || frameCount > MAX_FRAME_COUNT) {
    return 'Invalid frame count'
  }
  if (!QUALITIES.includes(quality)) return 'Invalid quality'
  if (options.format !== undefined && options.format !== 'mp4' && options.format !== 'gif') return 'Invalid format'
  if (options.format === 'gif' && fps > 15) return 'GIF frame rate must be at most 15 fps'
  if (options.reel && options.format === 'gif') return 'Reel parts must use MP4'
  if (!Array.isArray(segments) || segments.length === 0) {
    return 'Invalid segments: at least one required'
  }

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    if (!segment || typeof segment !== 'object') return 'Invalid segment'
    if (segment.kind === 'play') {
      if (!Number.isFinite(segment.srcStart) || !Number.isFinite(segment.srcEnd)) {
        return 'Invalid play segment times'
      }
      if (segment.srcStart < 0 || segment.srcEnd <= segment.srcStart) {
        return 'Invalid play segment range'
      }
      if (
        segment.speed !== undefined &&
        (typeof segment.speed !== 'number' || !Number.isFinite(segment.speed) || segment.speed < MIN_SPEED || segment.speed > MAX_SPEED)
      ) {
        return `Invalid speed for segment ${i}: must be between ${MIN_SPEED} and ${MAX_SPEED}`
      }
      if (segment.grid !== undefined && !isSpeedGrid(segment.grid)) {
        return `Invalid grid for segment ${i}`
      }
    } else if (segment.kind === 'hold') {
      if (!Number.isFinite(segment.srcTime) || segment.srcTime < 0) {
        return 'Invalid hold segment time'
      }
      if (!Number.isFinite(segment.duration) || segment.duration <= 0) {
        return 'Invalid hold segment duration'
      }
    } else {
      return 'Invalid segment kind'
    }
  }

  return null
}

function isSpeedGrid(grid: unknown): grid is SpeedGrid {
  if (!grid || typeof grid !== 'object') return false
  const { sourceFrames, frames, phase } = grid as Record<string, unknown>
  const whole = (value: unknown, min: number) => Number.isSafeInteger(value) && (value as number) >= min
  return whole(sourceFrames, 1) && whole(frames, 1) && whole(phase, 0)
}

/**
 * Validates that `spans` are well-formed, reference only overlays that exist
 * (`0 <= overlayIndex < overlayCount`), and are contiguous with no gaps or
 * overlaps covering exactly `[0, frameCount)`. `spans` may be empty (no
 * drawings burned in).
 */
export function validateOverlaySpans(spans: unknown, overlayCount: number, frameCount: number): string | null {
  if (!Array.isArray(spans)) return 'Invalid spans'
  if (spans.length === 0) return null

  let cursor = 0
  for (const span of spans) {
    if (!span || typeof span !== 'object') return 'Invalid span'
    const { overlayIndex, frameStart, frameCount: spanFrameCount } = span as OverlaySpan
    if (!Number.isInteger(overlayIndex) || overlayIndex < 0 || overlayIndex >= overlayCount) {
      return 'Invalid span overlay index'
    }
    if (!Number.isInteger(frameStart) || frameStart !== cursor) {
      return 'Spans must be contiguous starting at frame 0'
    }
    if (!Number.isInteger(spanFrameCount) || spanFrameCount <= 0) {
      return 'Invalid span frame count'
    }
    cursor += spanFrameCount
  }

  if (cursor !== frameCount) return 'Spans must cover exactly the job frame count'
  return null
}

/** Validates magnifier ops: finite/bounded rect + circle geometry, and non-empty, in-range enable windows. */
export function validateMagnifierOps(
  magnifiers: unknown,
  width: number,
  height: number,
  totalDurationSeconds: number
): string | null {
  if (!Array.isArray(magnifiers)) return 'Invalid magnifiers'
  if (magnifiers.length > MAX_MAGNIFIERS_PER_JOB) return 'Too many magnifiers'

  for (const magnifier of magnifiers) {
    if (!magnifier || typeof magnifier !== 'object') return 'Invalid magnifier op'
    const { sourceRect, destCircle, enable } = magnifier as MagnifierOp

    if (!sourceRect || typeof sourceRect !== 'object') return 'Invalid magnifier source rect'
    const { x, y, width: rw, height: rh } = sourceRect
    if (![x, y, rw, rh].every((n) => Number.isFinite(n))) return 'Invalid magnifier source rect values'
    if (rw <= 0 || rh <= 0) return 'Invalid magnifier source rect size'
    if (x < 0 || y < 0 || x + rw > width || y + rh > height) return 'Magnifier source rect out of bounds'

    if (!destCircle || typeof destCircle !== 'object') return 'Invalid magnifier dest circle'
    const { centerX, centerY, radius } = destCircle
    if (![centerX, centerY, radius].every((n) => Number.isFinite(n))) return 'Invalid magnifier dest circle values'
    if (radius <= 0 || radius > Math.max(width, height)) return 'Invalid magnifier dest circle radius'
    if (centerX - radius < -radius || centerY - radius < -radius) return 'Magnifier dest circle out of bounds'

    if (!Array.isArray(enable) || enable.length === 0) return 'Magnifier must have at least one enable window'
    if (enable.length > MAX_ENABLE_WINDOWS_PER_MAGNIFIER) return 'Too many magnifier enable windows'
    for (const window of enable) {
      if (!window || typeof window !== 'object') return 'Invalid magnifier enable window'
      const { start, end } = window
      if (!Number.isFinite(start) || !Number.isFinite(end)) return 'Invalid magnifier enable window times'
      if (start < 0 || end <= start || end > totalDurationSeconds + 1) return 'Magnifier enable window out of range'
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// ffmpeg filter graph / argv builder (pure)
// ---------------------------------------------------------------------------

const QUALITY_SETTINGS: Record<ClipExportQuality, { crf: number; preset: string }> = {
  high: { crf: 18, preset: 'medium' },
  medium: { crf: 23, preset: 'medium' },
  low: { crf: 28, preset: 'fast' },
}

const AUDIO_SAMPLE_RATE = 48000

function fmt(seconds: number): string {
  return seconds.toFixed(6)
}

/** Downscale filter matching QUALITY_PRESETS in ffmpegExport.ts, plus even dimensions. */
function videoScaleFilter(quality: ClipExportQuality): string {
  switch (quality) {
    case 'medium':
      return 'scale=-2:min(ih\\,720)'
    case 'low':
      return 'scale=-2:min(ih\\,480)'
    case 'high':
    default:
      return 'scale=trunc(iw/2)*2:trunc(ih/2)*2'
  }
}

/** The earliest source time referenced by any segment; used as the `-ss` (input-seek) offset. */
/**
 * The frame on screen at time `t` (what the coach saw in the player) is the
 * last one whose PTS <= t — but `-ss t` and `trim=start=t` keep only frames
 * with PTS >= t, i.e. the NEXT frame whenever `t` sits inside a frame (which
 * it always does after frame-stepping). Moving every segment time back to
 * half a frame before that frame's start makes the cut land on the intended
 * frame and tolerates up to half a frame of PTS jitter either way.
 */
export function frameWindowStart(t: number, fps: number): number {
  const index = Math.floor(t * fps + 1e-3)
  return Math.max(0, (index - 0.5) / fps)
}

export function alignSegmentsToFrames(segments: OutputSegment[], fps: number): OutputSegment[] {
  return segments.map((segment) =>
    segment.kind === 'play'
      ? {
          kind: 'play',
          srcStart: frameWindowStart(segment.srcStart, fps),
          srcEnd: frameWindowStart(segment.srcEnd, fps),
          ...(segment.speed !== undefined ? { speed: segment.speed } : {}),
          ...(segment.grid !== undefined ? { grid: segment.grid } : {}),
        }
      : { kind: 'hold', srcTime: frameWindowStart(segment.srcTime, fps), duration: segment.duration }
  )
}

export function computeSeekOffset(segments: OutputSegment[]): number {
  if (segments.length === 0) return 0
  const first = segments[0]
  return first.kind === 'play' ? first.srcStart : first.srcTime
}

export interface BuildClipEncodeFilterGraphInput {
  outputPath: string
  sourcePath: string
  fps: number
  /** Used to align source cuts independently of the selected output rate. */
  sourceFps?: number
  frameCount: number
  quality: ClipExportQuality
  format?: ClipExportFormat
  segments: OutputSegment[]
  hasAudio: boolean
  /** Present iff there is at least one overlay span (drawings are being burned in). */
  overlayConcatListPath?: string
  magnifiers: MagnifierOp[]
}

/**
 * Builds the ffmpeg argv for one encode job. Single source input, seeked
 * near the clip start (`-ss` before `-i`, frame-accurate when transcoding);
 * an optional second input feeds the drawing-layer overlay PNG timeline via
 * the concat demuxer. Pure — no I/O, fully testable.
 */
export function buildClipEncodeFilterGraph(input: BuildClipEncodeFilterGraphInput): string[] {
  const { outputPath, sourcePath, fps, frameCount, quality, hasAudio, overlayConcatListPath, magnifiers } = input
  const sourceFps = input.sourceFps ?? fps
  const isGif = input.format === 'gif'
  const includeAudio = hasAudio && !isGif
  const segments = alignSegmentsToFrames(input.segments, sourceFps)
  const { crf, preset } = QUALITY_SETTINGS[quality]
  // With speed segments, count frames from the renderer's own (frame-start)
  // edges: aligning clamps a frame-0 edge and would shorten the first segment.
  const hasSpeed = input.segments.some(isSpeedSegment)
  const segFrameCounts = segmentFrameCountsForBuilder(hasSpeed ? input.segments : segments, fps)
  const seekOffset = computeSeekOffset(segments)

  const filterParts: string[] = []

  // A slowed (or sped-up) segment with no planned frames is left out of both
  // concats rather than fed in empty, and so is a run of other segments
  // between them with no planned frames.
  const emptyRun = new Set<number>()
  if (hasSpeed) {
    let run: number[] = []
    segments.forEach((segment, i) => {
      if (!isSpeedSegment(segment)) run.push(i)
      if (isSpeedSegment(segment) || i === segments.length - 1) {
        if (run.every((j) => segFrameCounts[j] === 0)) run.forEach((j) => emptyRun.add(j))
        run = []
      }
    })
  }
  const included = segments
    .map((segment, i) => ({ segment, i }))
    .filter(({ segment, i }) => !(isSpeedSegment(segment) && segFrameCounts[i] === 0) && !emptyRun.has(i))

  // --- Base video timeline: per-segment trim/hold, concatenated, CFR-locked. ---
  included.forEach(({ segment, i }) => {
    if (segment.kind === 'play') {
      const start = segment.srcStart - seekOffset
      const end = segment.srcEnd - seekOffset
      const speed = segment.speed ?? 1
      if (speed === 1) {
        filterParts.push(`[0:v]trim=start=${fmt(start)}:end=${fmt(end)},setpts=PTS-STARTPTS[v${i}]`)
      } else {
        const source = input.segments[i] as Extract<OutputSegment, { kind: 'play' }>
        const sourceFrames = Math.max(1, Math.round((source.srcEnd - source.srcStart) * sourceFps))
        filterParts.push(`[0:v]${speedSegmentChain(start, end, sourceFrames, fps, segFrameCounts[i], source.grid)}[v${i}]`)
      }
    } else {
      const t = segment.srcTime - seekOffset
      const oneFrame = 1 / sourceFps
      const holdFrames = Math.max(1, segFrameCounts[i])
      // `tpad`'s `stop_duration` can't infer per-frame spacing from a
      // single-frame input (there's no previous frame to diff against), so
      // it silently pads far too little. `loop` repeats the single trimmed
      // frame an exact number of times instead, and the following `setpts`
      // gives the repeats sequential, evenly-spaced timestamps at `fps` so
      // concat/the final CFR `fps=` filter see a normal run of frames.
      filterParts.push(
        `[0:v]trim=start=${fmt(t)}:end=${fmt(t + oneFrame)},setpts=PTS-STARTPTS,` +
          `loop=loop=${holdFrames - 1}:size=1:start=0,setpts=N/(${fmt(fps)}*TB)[v${i}]`
      )
    }
  })
  const vConcatInputs = hasSpeed ? speedTimelineInputs(included, segFrameCounts, fps, filterParts) : included.map(({ i }) => `[v${i}]`)
  filterParts.push(`${vConcatInputs.join('')}concat=n=${vConcatInputs.length}:v=1:a=0[vbase0]`)
  // Segment trims can each lose a frame to timestamp rounding (a 20 s clip
  // with a hold came out 2 frames short). Clone the last frame for a moment
  // and let `-frames:v frameCount` cut the stream to the exact length.
  filterParts.push(`[vbase0]fps=${fmt(fps)},tpad=stop_mode=clone:stop_duration=0.5[vbase]`)

  // --- Magnifiers: crop/scale/circular-mask a region of the base video, overlay during enable windows. ---
  let running = 'vbase'
  if (magnifiers.length > 0) {
    const splitOutputs = ['vbase_ovl', ...magnifiers.map((_, j) => `vbase_mag${j}`)]
    filterParts.push(`[vbase]split=${splitOutputs.length}${splitOutputs.map((l) => `[${l}]`).join('')}`)
    running = 'vbase_ovl'

    magnifiers.forEach((magnifier, j) => {
      const { sourceRect, destCircle, enable } = magnifier
      const cropW = Math.max(2, Math.round(sourceRect.width))
      const cropH = Math.max(2, Math.round(sourceRect.height))
      const cropX = Math.max(0, Math.round(sourceRect.x))
      const cropY = Math.max(0, Math.round(sourceRect.y))
      const destSize = Math.max(2, Math.round(destCircle.radius * 2))
      const destX = Math.round(destCircle.centerX - destCircle.radius)
      const destY = Math.round(destCircle.centerY - destCircle.radius)

      const circleAlpha =
        `if(lte(pow(X-(W/2)\\,2)+pow(Y-(H/2)\\,2)\\,pow(W/2\\,2))\\,255\\,0)`
      filterParts.push(
        `[vbase_mag${j}]crop=${cropW}:${cropH}:${cropX}:${cropY},scale=${destSize}:${destSize},` +
          `format=rgba,geq=r='r(X\\,Y)':g='g(X\\,Y)':b='b(X\\,Y)':a='${circleAlpha}'[magcirc${j}]`
      )

      // Round the start down: rounding up can land after the first frame's timestamp and start the zoom a frame after its ring.
      const enableExpr = enable.map((w) => `between(t\\,${fmt(Math.floor(w.start * 1e6) / 1e6)}\\,${fmt(w.end)})`).join('+')
      const nextLabel = j === magnifiers.length - 1 ? 'vmagfinal' : `vmag${j}`
      filterParts.push(
        `[${running}][magcirc${j}]overlay=${destX}:${destY}:enable='${enableExpr}':eof_action=pass[${nextLabel}]`
      )
      running = nextLabel
    })
  }

  // --- Drawing-layer overlay (transparent PNG timeline), composited on top. ---
  if (overlayConcatListPath) {
    filterParts.push(`[1:v]fps=${fmt(fps)},format=rgba[ovl]`)
    filterParts.push(`[${running}][ovl]overlay=0:0:format=auto:eof_action=pass[vov]`)
    running = 'vov'
  }

  // --- Quality scale, after compositing. ---
  if (isGif) {
    filterParts.push(`[${running}]${videoScaleFilter(quality)},split[gif0][gif1]`)
    filterParts.push('[gif0]palettegen=max_colors=256[palette]')
    filterParts.push('[gif1][palette]paletteuse=dither=bayer[vout]')
  } else {
    filterParts.push(`[${running}]${videoScaleFilter(quality)}[vout]`)
  }

  // --- Audio: same source input (seeked identically), so times use the same offset. ---
  if (includeAudio) {
    included.forEach(({ segment, i }) => {
      if (segment.kind === 'play' && (segment.speed ?? 1) === 1) {
        const start = segment.srcStart - seekOffset
        const end = segment.srcEnd - seekOffset
        filterParts.push(
          `[0:a]atrim=start=${fmt(start)}:end=${fmt(end)},` +
            `asetpts=PTS-STARTPTS,aresample=${AUDIO_SAMPLE_RATE},` +
            `aformat=sample_fmts=fltp:channel_layouts=stereo[a${i}]`
        )
      } else {
        const duration = segment.kind === 'play' ? playOutputDuration(segment) : segment.duration
        filterParts.push(
          `anullsrc=channel_layout=stereo:sample_rate=${AUDIO_SAMPLE_RATE},` +
            `atrim=duration=${fmt(duration)},asetpts=PTS-STARTPTS,` +
            `aformat=sample_fmts=fltp:channel_layouts=stereo[a${i}]`
        )
      }
    })
    const aConcatInputs = included.map(({ i }) => `[a${i}]`).join('')
    filterParts.push(`${aConcatInputs}concat=n=${included.length}:v=0:a=1[aout]`)
  }

  const args: string[] = ['-y', '-ss', fmt(seekOffset), '-i', sourcePath]

  if (overlayConcatListPath) {
    args.push('-f', 'concat', '-safe', '0', '-i', overlayConcatListPath)
  }

  args.push('-filter_complex', filterParts.join(';'))
  args.push('-map', '[vout]')
  if (includeAudio) {
    args.push('-map', '[aout]')
  }

  args.push('-r', fmt(fps), '-frames:v', String(frameCount))
  if (isGif) {
    args.push('-an', '-loop', '0', '-f', 'gif')
  } else {
    args.push(
      '-c:v', 'libx264',
      '-preset', preset,
      '-crf', String(crf),
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart'
    )
  }

  if (includeAudio) {
    args.push('-c:a', 'aac', '-b:a', '128k')
  }

  args.push('-progress', 'pipe:1', '-nostats', outputPath)

  return args
}

function isSpeedSegment(segment: OutputSegment): boolean {
  return segment.kind === 'play' && (segment.speed ?? 1) !== 1
}

/**
 * Ends a chain with exactly `frames` frames on sequential output-rate
 * timestamps. `concat` measures an input from its frame spacing, so a
 * one-frame input gets a copy half a slot later (the final `fps` drops it).
 */
function exactFrames(frames: number, fps: number): string {
  const chain = `fps=${fmt(fps)},tpad=stop_mode=clone:stop=${frames},trim=end_frame=${frames},setpts=N/(${fmt(fps)}*TB)`
  return frames === 1 ? `${chain},tpad=stop_mode=clone:stop=1,settb=AVTB,setpts=N/(${fmt(2 * fps)}*TB)` : chain
}

/**
 * A play segment at speed != 1 covering `sourceFrames` source frames, as
 * `frames` output frames. Output frame f shows the segment's source frame
 * `floor(f * sourceFrames / frames + 1e-6)`, the rule `speedSegmentFrame` in
 * src/export/outputTimeline.ts plans overlays with: source frame N gets output
 * slot `ceil((N - 1e-6) * frames / sourceFrames)`, and `fps` fills empty slots
 * with the previous frame and keeps the latest of several in one slot. The
 * clone before `trim` keeps a segment past the end of the source from arriving
 * empty; the one after it lets `fps` emit the last real frame.
 *
 * With a `grid` (a piece of a step split by freezes) output frame f shows
 * `floor((f * grid.sourceFrames + grid.phase) / grid.frames + 1e-6)` instead,
 * so source frame N gets slot `ceil(((N - 1e-6) * grid.frames - grid.phase) /
 * grid.sourceFrames)`. Frames before the first one shown land below slot 0;
 * `max` piles them into slot 0, where `fps` keeps the latest.
 */
function speedSegmentChain(start: number, end: number, sourceFrames: number, fps: number, frames: number, grid?: SpeedGrid): string {
  const slot = grid
    ? `max(0\\,ceil(((N-0.000001)*${grid.frames}-${grid.phase})/${grid.sourceFrames}))`
    : `ceil((N-0.000001)*${frames}/${sourceFrames})`
  return (
    `tpad=stop_mode=clone:stop=-1,trim=start=${fmt(start)}:end=${fmt(end)},tpad=stop_mode=clone:stop=1,` +
    `setpts=${slot}/(${fmt(fps)}*TB),${exactFrames(frames, fps)}`
  )
}

/**
 * The top-level concat inputs of a timeline with speed segments. Each run of
 * speed-1 plays and holds is concatenated as usual (today's per-segment
 * chains), then resampled to its exact planned frame count, so every input of
 * the top-level concat lasts a whole number of output frames and each speed
 * segment starts on the output frame the plan gives it. Left to the final
 * `fps`, a speed-1 run lasting a fractional number of frames (an odd number of
 * 30 fps frames in a 15 fps GIF) would put the next speed segment's frames on
 * half-frame timestamps, where rounding picks the wrong ones.
 */
function speedTimelineInputs(
  included: { segment: OutputSegment; i: number }[],
  segFrameCounts: number[],
  fps: number,
  filterParts: string[]
): string[] {
  const inputs: string[] = []
  let run: number[] = []
  const flushRun = () => {
    const frames = run.reduce((sum, i) => sum + segFrameCounts[i], 0)
    if (run.length > 0) {
      const joined = run.map((i) => `[v${i}]`).join('')
      const head = run.length === 1 ? joined : `${joined}concat=n=${run.length}:v=1:a=0,`
      filterParts.push(`${head}tpad=stop_mode=clone:stop=1,${exactFrames(frames, fps)}[g${run[0]}]`)
      inputs.push(`[g${run[0]}]`)
    }
    run = []
  }
  for (const { segment, i } of included) {
    if (isSpeedSegment(segment)) {
      flushRun()
      inputs.push(`[v${i}]`)
    } else {
      run.push(i)
    }
  }
  flushRun()
  return inputs
}

/**
 * Longest filter graph passed inline. Windows caps a whole command line at
 * 32,767 characters, and a speed region adds a few KB of graph, so longer
 * graphs go to a file instead.
 */
export const MAX_INLINE_FILTER_GRAPH = 8000

/**
 * `args` unchanged when its `-filter_complex` graph is short; otherwise the
 * argv reading the graph from `scriptPath` with `-filter_complex_script`, and
 * the graph to write there.
 */
export function withFilterScript(args: string[], scriptPath: string): { args: string[]; script: string | null } {
  const at = args.indexOf('-filter_complex')
  if (at < 0 || args[at + 1].length <= MAX_INLINE_FILTER_GRAPH) return { args, script: null }
  return { args: [...args.slice(0, at), '-filter_complex_script', scriptPath, ...args.slice(at + 2)], script: args[at + 1] }
}

/**
 * Same per-segment frame distribution as `src/export/outputTimeline.ts`'s
 * `segmentFrameCounts`, duplicated here (rather than imported) so this
 * module has no dependency on the renderer-side export code — it needs to
 * be usable from a plain Node test/process without pulling in `src/`.
 */
export function segmentFrameCountsForBuilder(segments: OutputSegment[], fps: number): number[] {
  const counts: number[] = []
  let cumulativeDuration = 0
  let cumulativeFrames = 0

  for (const seg of segments) {
    const segDuration = seg.kind === 'play' ? playOutputDuration(seg) : seg.duration
    cumulativeDuration += segDuration
    const targetFrames = Math.round(cumulativeDuration * fps)
    const segFrameCount = Math.max(0, targetFrames - cumulativeFrames)
    counts.push(segFrameCount)
    cumulativeFrames += segFrameCount
  }

  return counts
}

function playOutputDuration(seg: Extract<OutputSegment, { kind: 'play' }>): number {
  return (seg.srcEnd - seg.srcStart) / (seg.speed ?? 1)
}

/**
 * Builds the concat-demuxer list file content for the overlay PNG timeline:
 * one `file`/`duration` pair per span (in frames-to-seconds), with the last
 * file repeated once more without a duration line — the concat demuxer
 * ignores the final entry's `duration`, so without this the last span would
 * effectively get no display time.
 */
export function buildOverlayConcatList(spans: OverlaySpan[], overlayPaths: string[], fps: number): string {
  const lines: string[] = []
  let lastPath: string | null = null

  for (const span of spans) {
    // Bare file names: the list lives in the same temp dir as the PNGs and
    // the concat demuxer resolves relative entries against the list's own
    // directory. This keeps user-dependent temp paths (backslashes, a quote
    // in a Windows user name) out of the quoted list syntax entirely.
    const filePath = path.basename(overlayPaths[span.overlayIndex])
    const duration = span.frameCount / fps
    lines.push(`file '${filePath}'`)
    lines.push(`duration ${fmt(duration)}`)
    lastPath = filePath
  }

  if (lastPath) {
    lines.push(`file '${lastPath}'`)
  }

  return lines.join('\n') + '\n'
}

// ---------------------------------------------------------------------------
// Job registry (stateful, no Electron dependency)
// ---------------------------------------------------------------------------

interface EncodeJob {
  outputPath: string
  sourcePath: string
  width: number
  height: number
  fps: number
  sourceFps: number
  frameCount: number
  quality: ClipExportQuality
  format: ClipExportFormat
  segments: OutputSegment[]
  hasAudio: boolean
  tmpDir: string
  overlayPaths: string[]
  child: ChildProcessWithoutNullStreams | null
  cancelled: boolean
}

const jobs = new Map<string, EncodeJob>()

/** Registers a job (creating its temp dir for overlay PNGs) without spawning ffmpeg yet. */
export async function startClipEncodeJob(
  options: ClipEncodeStartOptions,
  hasAudio: boolean,
  sourceFps = options.fps
): Promise<ClipEncodeStartResult> {
  const validationError = validateClipEncodeOptions(options)
  if (validationError) return { ok: false, error: validationError }

  let tmpDir: string
  try {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'replay-clip-'))
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not create a temp directory' }
  }

  const job: EncodeJob = {
    outputPath: options.outputPath,
    sourcePath: options.sourcePath,
    width: options.width,
    height: options.height,
    fps: options.fps,
    sourceFps,
    frameCount: options.frameCount,
    quality: options.quality,
    format: options.format ?? 'mp4',
    segments: options.segments,
    hasAudio,
    tmpDir,
    overlayPaths: [],
    child: null,
    cancelled: false,
  }

  const id = randomUUID()
  jobs.set(id, job)
  return { ok: true, jobId: id }
}

export type AddOverlayResult = { ok: true; index: number } | { ok: false; error: string }

/**
 * Encodes straight (non-premultiplied) RGBA pixels as a PNG. Done here rather
 * than with canvas.toBlob in the renderer: Chromium schedules toBlob PNG
 * encoding as a low-priority task (~1 s per image regardless of size), while
 * deflate here takes tens of ms for a mostly transparent 1080p layer.
 */
export function encodeRgbaPng(width: number, height: number, rgba: Buffer): Buffer {
  const stride = width * 4
  // Each scanline is prefixed with filter type 0 (None).
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(zlib.crc32(typeAndData))
    return Buffer.concat([len, typeAndData, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 1 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/**
 * Takes one drawing-layer frame as raw RGBA (exactly width*height*4 bytes for
 * this job), encodes it to PNG in the job's temp dir, and returns its slot index.
 */
export async function addOverlayToJob(jobId: string, rgba: Buffer): Promise<AddOverlayResult> {
  const job = jobs.get(jobId)
  if (!job) return { ok: false, error: 'Unknown encode job' }
  if (job.cancelled) return { ok: false, error: 'Job was cancelled' }
  if (job.overlayPaths.length >= MAX_OVERLAYS_PER_JOB) return { ok: false, error: 'Too many overlays for this job' }
  if (rgba.byteLength !== job.width * job.height * 4) return { ok: false, error: 'Overlay size does not match the video' }

  const index = job.overlayPaths.length
  const filePath = path.join(job.tmpDir, `overlay_${index}.png`)
  try {
    await fsp.writeFile(filePath, encodeRgbaPng(job.width, job.height, rgba))
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not write overlay PNG' }
  }
  job.overlayPaths.push(filePath)
  return { ok: true, index }
}

export interface RunClipEncodeJobInput {
  spans: OverlaySpan[]
  magnifiers: MagnifierOp[]
}

/** Builds the filter graph, spawns ffmpeg, reports progress, and cleans up the job's temp dir. */
export async function runClipEncodeJob(
  jobId: string,
  input: RunClipEncodeJobInput,
  ffmpegPath: string,
  onProgress?: (percent: number) => void
): Promise<ClipExportResult> {
  const job = jobs.get(jobId)
  if (!job) return { success: false, error: 'Unknown encode job' }
  if (job.cancelled) return { success: false, error: 'Job was cancelled' }

  const spansError = validateOverlaySpans(input.spans, job.overlayPaths.length, job.frameCount)
  if (spansError) return { success: false, error: spansError }

  const totalDuration = job.frameCount / job.fps
  const magnifiersError = validateMagnifierOps(input.magnifiers, job.width, job.height, totalDuration)
  if (magnifiersError) return { success: false, error: magnifiersError }

  let overlayConcatListPath: string | undefined
  if (input.spans.length > 0) {
    overlayConcatListPath = path.join(job.tmpDir, 'overlay_list.txt')
    const listContent = buildOverlayConcatList(input.spans, job.overlayPaths, job.fps)
    try {
      await fsp.writeFile(overlayConcatListPath, listContent)
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : 'Could not write overlay list' }
    }
  }

  const built = buildClipEncodeFilterGraph({
    outputPath: job.outputPath,
    sourcePath: job.sourcePath,
    fps: job.fps,
    sourceFps: job.sourceFps,
    frameCount: job.frameCount,
    quality: job.quality,
    format: job.format,
    segments: job.segments,
    hasAudio: job.hasAudio,
    overlayConcatListPath,
    magnifiers: input.magnifiers,
  })
  const scriptPath = path.join(job.tmpDir, 'filter_graph.txt')
  const { args, script } = withFilterScript(built, scriptPath)
  if (script !== null) {
    try {
      await fsp.writeFile(scriptPath, script)
    } catch (err) {
      await cleanupJob(jobId)
      return { success: false, error: err instanceof Error ? err.message : 'Could not write the filter graph' }
    }
  }

  let child: ChildProcessWithoutNullStreams
  try {
    child = spawn(ffmpegPath, args)
  } catch (err) {
    await cleanupJob(jobId)
    return { success: false, error: err instanceof Error ? err.message : 'Failed to start ffmpeg' }
  }
  job.child = child

  let stderrTail = ''
  let stdoutTail = ''
  child.stderr.on('data', (data: Buffer) => {
    stderrTail = (stderrTail + data.toString()).slice(-4000)
  })
  child.stdout.on('data', (data: Buffer) => {
    stdoutTail += data.toString()
    // `-progress pipe:1` writes `key=value\n` lines, one block per update.
    let newlineIndex: number
    while ((newlineIndex = stdoutTail.indexOf('\n')) >= 0) {
      const line = stdoutTail.slice(0, newlineIndex).trim()
      stdoutTail = stdoutTail.slice(newlineIndex + 1)
      const match = /^out_time_us=(-?\d+)$/.exec(line) || /^out_time_ms=(-?\d+)$/.exec(line)
      if (match && onProgress) {
        const outTimeSeconds = Number(match[1]) / 1_000_000
        if (Number.isFinite(outTimeSeconds) && totalDuration > 0) {
          const percent = Math.max(0, Math.min(100, Math.round((outTimeSeconds / totalDuration) * 100)))
          onProgress(percent)
        }
      }
      if (line === 'progress=end' && onProgress) {
        onProgress(100)
      }
    }
  })

  const exitPromise = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.on('close', (code, signal) => resolve({ code, signal }))
  })
  child.on('error', (err) => {
    stderrTail += `\n[ffmpeg spawn error] ${err.message}`
  })

  const { code, signal } = await exitPromise
  const wasCancelled = job.cancelled
  await cleanupJob(jobId)

  if (wasCancelled) return { success: false, error: 'Cancelled' }
  if (code === 0) return { success: true }

  const tail = stderrTail.trim().slice(-800)
  const reason = signal ? `signal ${signal}` : `code ${code}`
  return { success: false, error: `ffmpeg exited with ${reason}${tail ? `: ${tail}` : ''}` }
}

/** True if the job is registered (still accepting overlays / not yet run to completion). */
export function isClipEncodeJobActive(jobId: string): boolean {
  return jobs.has(jobId)
}

async function cleanupJob(jobId: string): Promise<void> {
  const job = jobs.get(jobId)
  if (!job) return
  jobs.delete(jobId)
  try {
    await fsp.rm(job.tmpDir, { recursive: true, force: true })
  } catch {
    // Best-effort; a leftover temp dir is not fatal.
  }
}

/** Kills ffmpeg (if running), deletes the job's temp dir and any partial output file. */
export async function cancelClipEncodeJob(jobId: string): Promise<void> {
  const job = jobs.get(jobId)
  if (!job) return
  job.cancelled = true

  if (job.child) {
    const child = job.child
    // Windows can't delete a file ffmpeg still has open, so wait for the
    // process to actually exit before removing the partial output.
    const exited =
      child.exitCode !== null || child.signalCode !== null
        ? Promise.resolve()
        : new Promise<void>((resolve) => child.once('exit', () => resolve()))
    try {
      child.kill('SIGKILL')
    } catch {
      // Already dead.
    }
    await Promise.race([exited, new Promise<void>((resolve) => setTimeout(resolve, 5000))])
  } else {
    // Never spawned (cancelled between start and run) — clean up ourselves.
    await cleanupJob(jobId)
  }

  // Retry briefly: on Windows the handle can outlive the exit event by a moment.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await fsp.unlink(job.outputPath)
      return
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code === 'ENOENT') return
      await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)))
    }
  }
}

/** Cancels every in-flight job. Used on app quit and main-window close. */
export async function cancelAllClipEncodeJobs(): Promise<void> {
  const ids = Array.from(jobs.keys())
  await Promise.all(ids.map((id) => cancelClipEncodeJob(id)))
}
