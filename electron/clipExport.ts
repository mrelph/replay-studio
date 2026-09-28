// Multi-clip export encoder. See docs/CLIPS_PLAN.md.
//
// Two independent, pure/testable pieces plus a small stateful job registry:
//  - parseFfmpegProbeOutput: turns `ffmpeg -i <path>` stderr into a VideoProbe.
//  - buildClipEncodeArgs: turns encode options + a hasAudio flag into the
//    ffmpeg argv that reads JPEG frames from stdin and mixes source audio.
//  - startClipEncodeJob/clipEncodeFrame/finishClipEncodeJob/cancelClipEncodeJob:
//    spawn and drive one ffmpeg process per job, keyed by a random id. These
//    take no dependency on Electron/ipcMain so they can be exercised directly
//    in tests.
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { randomUUID } from 'crypto'
import fsp from 'fs/promises'
import type { ClipEncodeStartOptions, ClipEncodeStartResult, ClipExportQuality, OutputSegment, VideoProbe } from '../src/types/clip'

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
// Encode argument / filter-graph builder (pure)
// ---------------------------------------------------------------------------

const QUALITY_SETTINGS: Record<ClipExportQuality, { crf: number; preset: string }> = {
  // 'slow' would be more faithful to ffmpegExport.ts's high preset, but clip
  // export composites and encodes frame-by-frame as they arrive; 'medium'
  // keeps encode speed close to real time.
  high: { crf: 18, preset: 'medium' },
  medium: { crf: 23, preset: 'medium' },
  low: { crf: 28, preset: 'fast' },
}

const AUDIO_SAMPLE_RATE = 48000

function fmtSeconds(seconds: number): string {
  return seconds.toFixed(6)
}

/** Downscale filter matching QUALITY_PRESETS in ffmpegExport.ts, plus even dimensions. */
function videoScaleFilter(quality: ClipExportQuality): string {
  switch (quality) {
    case 'medium':
      // -2 keeps width even while matching aspect ratio; min() only downscales.
      return 'scale=-2:min(ih\\,720)'
    case 'low':
      return 'scale=-2:min(ih\\,480)'
    case 'high':
    default:
      return 'scale=trunc(iw/2)*2:trunc(ih/2)*2'
  }
}

export interface BuildClipEncodeArgsInput {
  outputPath: string
  sourcePath: string
  width: number
  height: number
  fps: number
  quality: ClipExportQuality
  segments: OutputSegment[]
  /** From probing sourcePath; ClipEncodeStartOptions has no audio flag. */
  hasAudio: boolean
}

/**
 * Builds the ffmpeg argv for one encode job: JPEG frames from stdin
 * (image2pipe) composited with source audio built from `segments` via
 * `atrim`/`anullsrc` + `concat`. Pure — no I/O, fully testable.
 */
export function buildClipEncodeArgs(input: BuildClipEncodeArgsInput): string[] {
  const { outputPath, sourcePath, fps, quality, segments, hasAudio } = input
  const { crf, preset } = QUALITY_SETTINGS[quality]

  const filterParts: string[] = [`[0:v]${videoScaleFilter(quality)}[vout]`]

  if (hasAudio) {
    segments.forEach((segment, i) => {
      if (segment.kind === 'play') {
        filterParts.push(
          `[1:a]atrim=start=${fmtSeconds(segment.srcStart)}:end=${fmtSeconds(segment.srcEnd)},` +
            `asetpts=PTS-STARTPTS,aresample=${AUDIO_SAMPLE_RATE},` +
            `aformat=sample_fmts=fltp:channel_layouts=stereo[a${i}]`
        )
      } else {
        filterParts.push(
          `anullsrc=channel_layout=stereo:sample_rate=${AUDIO_SAMPLE_RATE},` +
            `atrim=duration=${fmtSeconds(segment.duration)},asetpts=PTS-STARTPTS,` +
            `aformat=sample_fmts=fltp:channel_layouts=stereo[a${i}]`
        )
      }
    })
    const concatInputs = segments.map((_, i) => `[a${i}]`).join('')
    filterParts.push(`${concatInputs}concat=n=${segments.length}:v=0:a=1[aout]`)
  }

  const args: string[] = [
    '-y',
    '-f', 'image2pipe',
    '-framerate', String(fps),
    '-c:v', 'mjpeg',
    '-i', 'pipe:0',
  ]

  if (hasAudio) {
    args.push('-i', sourcePath)
  }

  args.push('-filter_complex', filterParts.join(';'))
  args.push('-map', '[vout]')
  if (hasAudio) {
    args.push('-map', '[aout]')
  }

  args.push(
    '-r', String(fps),
    '-c:v', 'libx264',
    '-preset', preset,
    '-crf', String(crf),
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
  )

  if (hasAudio) {
    args.push('-c:a', 'aac', '-b:a', '128k')
  }

  args.push(outputPath)

  return args
}

// ---------------------------------------------------------------------------
// Validation (pure)
// ---------------------------------------------------------------------------

const MAX_DIMENSION = 16384
const MAX_FPS = 300
const MAX_FRAME_COUNT = 20_000_000
const QUALITIES: ClipExportQuality[] = ['high', 'medium', 'low']

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
  if (!Array.isArray(segments) || segments.length === 0) {
    return 'Invalid segments: at least one required'
  }

  for (const segment of segments) {
    if (!segment || typeof segment !== 'object') return 'Invalid segment'
    if (segment.kind === 'play') {
      if (!Number.isFinite(segment.srcStart) || !Number.isFinite(segment.srcEnd)) {
        return 'Invalid play segment times'
      }
      if (segment.srcStart < 0 || segment.srcEnd <= segment.srcStart) {
        return 'Invalid play segment range'
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

// ---------------------------------------------------------------------------
// Job registry (stateful, no Electron dependency)
// ---------------------------------------------------------------------------

export interface EncodeFinishResult {
  success: boolean
  error?: string
}

interface EncodeJob {
  child: ChildProcessWithoutNullStreams
  outputPath: string
  frameCount: number
  framesReceived: number
  stderrTail: string
  exitPromise: Promise<{ code: number | null; signal: NodeJS.Signals | null }>
}

const jobs = new Map<string, EncodeJob>()

/** Validates options, spawns ffmpeg, and registers a job keyed by a fresh id. */
export function startClipEncodeJob(
  options: ClipEncodeStartOptions,
  hasAudio: boolean,
  ffmpegPath: string
): ClipEncodeStartResult {
  const validationError = validateClipEncodeOptions(options)
  if (validationError) return { ok: false, error: validationError }

  const args = buildClipEncodeArgs({
    outputPath: options.outputPath,
    sourcePath: options.sourcePath,
    width: options.width,
    height: options.height,
    fps: options.fps,
    quality: options.quality,
    segments: options.segments,
    hasAudio,
  })

  let child: ChildProcessWithoutNullStreams
  try {
    child = spawn(ffmpegPath, args)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to start ffmpeg' }
  }
  child.stdout.resume()

  const job: EncodeJob = {
    child,
    outputPath: options.outputPath,
    frameCount: options.frameCount,
    framesReceived: 0,
    stderrTail: '',
    exitPromise: new Promise((resolve) => {
      child.on('close', (code, signal) => resolve({ code, signal }))
    }),
  }

  child.stderr.on('data', (data: Buffer) => {
    job.stderrTail = (job.stderrTail + data.toString()).slice(-4000)
  })
  child.on('error', (err) => {
    job.stderrTail += `\n[ffmpeg spawn error] ${err.message}`
  })

  const id = randomUUID()
  jobs.set(id, job)
  return { ok: true, jobId: id }
}

/** True if the job exists and is still alive; false (frame dropped) otherwise. */
export function isClipEncodeJobActive(jobId: string): boolean {
  return jobs.has(jobId)
}

/**
 * Writes one JPEG frame to ffmpeg's stdin, honoring backpressure by awaiting
 * 'drain' when the write buffer is full. Resolves false if the job is
 * unknown or the pipe has already closed/errored.
 */
export async function clipEncodeFrame(jobId: string, jpeg: Buffer): Promise<boolean> {
  const job = jobs.get(jobId)
  if (!job) return false
  const { stdin } = job.child
  if (!stdin || stdin.destroyed) return false
  try {
    const ok = stdin.write(jpeg)
    job.framesReceived += 1
    if (!ok) {
      await new Promise<void>((resolve) => stdin.once('drain', resolve))
    }
    return true
  } catch {
    return false
  }
}

/** Ends stdin, waits for ffmpeg to exit, and reports success/failure. */
export async function finishClipEncodeJob(jobId: string): Promise<EncodeFinishResult> {
  const job = jobs.get(jobId)
  if (!job) return { success: false, error: 'Unknown encode job' }

  try {
    if (!job.child.stdin.destroyed) job.child.stdin.end()
  } catch {
    // Already closed.
  }

  const result = await job.exitPromise
  jobs.delete(jobId)

  if (result.code === 0) {
    return { success: true }
  }
  const tail = job.stderrTail.trim().slice(-800)
  const reason = result.signal ? `signal ${result.signal}` : `code ${result.code}`
  return { success: false, error: `ffmpeg exited with ${reason}${tail ? `: ${tail}` : ''}` }
}

/** Kills ffmpeg and deletes the partial output file, if any. */
export async function cancelClipEncodeJob(jobId: string): Promise<void> {
  const job = jobs.get(jobId)
  if (!job) return
  jobs.delete(jobId)

  try {
    job.child.kill('SIGKILL')
  } catch {
    // Already dead.
  }
  try {
    await job.exitPromise
  } catch {
    // Ignore; we only wanted the process gone.
  }
  try {
    await fsp.unlink(job.outputPath)
  } catch {
    // Nothing to delete, or delete failed — not fatal for a cancel.
  }
}

/** Cancels every in-flight job. Used on app quit and main-window close. */
export async function cancelAllClipEncodeJobs(): Promise<void> {
  const ids = Array.from(jobs.keys())
  await Promise.all(ids.map((id) => cancelClipEncodeJob(id)))
}
