// Highlight reel assembler. See docs/REEL_PLAN.md.
//
// A reel is an ordered list of parts, each an ordinary clip encode job
// (electron/clipExport.ts) started with `reel` set. Every part comes from the
// same source with the same encoder settings, so this module joins them with
// the concat demuxer and copies the video stream untouched. Audio is
// re-encoded as one continuous track: each part's AAC stream starts with
// encoder priming, and re-encoding keeps that from drifting A/V sync across
// many joins.
//
// Pure/testable pieces:
//  - buildReelConcatList / buildChapterMetadata / validateReelChapters /
//    buildReelAssembleArgs.
// Stateful registry:
//  - startReelJob / reserveReelPart / linkReelPartJob / completeReelPartJob /
//    assembleReelJob / cancelReelJob / cancelAllReelJobs.
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process'
import { randomUUID } from 'crypto'
import fsp from 'fs/promises'
import os from 'os'
import path from 'path'
import type { ClipExportQuality, ClipExportResult, ReelChapter, ReelStartResult } from '../src/types/clip'

export const MAX_REEL_PARTS = 400
const MAX_CHAPTER_TITLE_LENGTH = 200

// ---------------------------------------------------------------------------
// Pure builders
// ---------------------------------------------------------------------------

/**
 * Concat-demuxer list for the parts, in order. Parts live in two places (the
 * reel temp dir and, for kept clips, the export folder), so entries are
 * absolute paths; inside single quotes the only special character is the
 * quote itself, written as `'\''`.
 */
export function buildReelConcatList(partPaths: string[]): string {
  return partPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n') + '\n'
}

/** Escapes a value for an ffmetadata file: `=`, `;`, `#`, `\` and newlines get a backslash. */
function escapeMetadata(value: string): string {
  return value.replace(/[\\=;#\n]/g, (ch) => `\\${ch}`)
}

/** `;FFMETADATA1` content with one millisecond-timebase chapter per entry. */
export function buildChapterMetadata(chapters: ReelChapter[], fps: number): string {
  const lines = [';FFMETADATA1']
  for (const chapter of chapters) {
    const start = Math.round((chapter.startFrame / fps) * 1000)
    const end = Math.round(((chapter.startFrame + chapter.frameCount) / fps) * 1000)
    const title = chapter.title.replace(/[\r\n]+/g, ' ').trim().slice(0, MAX_CHAPTER_TITLE_LENGTH)
    lines.push('[CHAPTER]', 'TIMEBASE=1/1000', `START=${start}`, `END=${end}`, `title=${escapeMetadata(title)}`)
  }
  return lines.join('\n') + '\n'
}

/** Chapters must be contiguous, non-empty, and cover exactly `[0, totalFrames)`. */
export function validateReelChapters(chapters: unknown, totalFrames: number): string | null {
  if (!Array.isArray(chapters) || chapters.length === 0) return 'A reel needs at least one chapter'
  if (chapters.length > MAX_REEL_PARTS) return 'Too many chapters'
  let expectedStart = 0
  for (const chapter of chapters as ReelChapter[]) {
    if (!chapter || typeof chapter !== 'object') return 'Invalid chapter'
    if (typeof chapter.title !== 'string') return 'Invalid chapter title'
    if (!Number.isInteger(chapter.startFrame) || !Number.isInteger(chapter.frameCount)) return 'Invalid chapter frames'
    if (chapter.frameCount <= 0) return 'Empty chapter'
    if (chapter.startFrame !== expectedStart) return 'Chapters must be contiguous'
    expectedStart += chapter.frameCount
  }
  if (expectedStart !== totalFrames) return 'Chapters do not cover the whole reel'
  return null
}

export interface ReelAssembleArgsInput {
  listPath: string
  metadataPath: string
  outputPath: string
  hasAudio: boolean
}

export function buildReelAssembleArgs({ listPath, metadataPath, outputPath, hasAudio }: ReelAssembleArgsInput): string[] {
  const args = [
    '-y',
    '-f', 'concat', '-safe', '0', '-i', listPath,
    '-f', 'ffmetadata', '-i', metadataPath,
    '-map', '0:v:0',
  ]
  if (hasAudio) args.push('-map', '0:a:0')
  args.push('-map_metadata', '1', '-map_chapters', '1', '-c:v', 'copy')
  if (hasAudio) args.push('-c:a', 'aac', '-b:a', '128k')
  args.push('-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', outputPath)
  return args
}

// ---------------------------------------------------------------------------
// Registry (stateful, no Electron dependency)
// ---------------------------------------------------------------------------

/** Settings every part must share for a stream-copy join to be valid. */
export interface ReelPartFormat {
  sourcePath: string
  width: number
  height: number
  fps: number
  quality: ClipExportQuality
  hasAudio: boolean
}

interface ReelPart {
  path: string
  frameCount: number
  keep: boolean
  done: boolean
}

interface ReelJob {
  outputPath: string
  tmpDir: string
  format: ReelPartFormat | null
  parts: ReelPart[]
  child: ChildProcessWithoutNullStreams | null
  cancelled: boolean
}

const reels = new Map<string, ReelJob>()
/** Clip encode jobId -> the reel part it produces. */
const partJobs = new Map<string, { reelId: string; index: number }>()

/** `outputPath` must already be authorized and canonical (main.ts checks it). */
export async function startReelJob(outputPath: string): Promise<ReelStartResult> {
  if (typeof outputPath !== 'string' || !path.isAbsolute(outputPath)) return { ok: false, error: 'Invalid output path' }
  let tmpDir: string
  try {
    tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'replay-reel-'))
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Could not create a temp directory' }
  }
  let freeBytes: number | null = null
  try {
    const stats = await fsp.statfs(tmpDir)
    freeBytes = stats.bavail * stats.bsize
  } catch {
    // Unknown free space is not fatal.
  }
  const reelId = randomUUID()
  reels.set(reelId, { outputPath, tmpDir, format: null, parts: [], child: null, cancelled: false })
  return { ok: true, reelId, freeBytes }
}

export type ReserveReelPartResult = { ok: true; index: number; outputPath: string } | { ok: false; error: string }

/**
 * Appends a part to the reel and decides where it is written: the reel's temp
 * dir, or `keptOutputPath` (an already-authorized export file) when the part
 * is also a kept individual clip. The first part fixes the reel's format.
 */
export function reserveReelPart(
  reelId: string,
  format: ReelPartFormat,
  frameCount: number,
  keptOutputPath: string | null
): ReserveReelPartResult {
  const reel = reels.get(reelId)
  if (!reel) return { ok: false, error: 'Unknown reel' }
  if (reel.cancelled) return { ok: false, error: 'Reel was cancelled' }
  if (reel.child) return { ok: false, error: 'Reel is already being assembled' }
  if (reel.parts.length >= MAX_REEL_PARTS) return { ok: false, error: 'Too many parts for one reel' }

  if (reel.format) {
    const f = reel.format
    if (
      f.sourcePath !== format.sourcePath ||
      f.width !== format.width ||
      f.height !== format.height ||
      f.fps !== format.fps ||
      f.quality !== format.quality ||
      f.hasAudio !== format.hasAudio
    ) {
      return { ok: false, error: 'Every reel part must share the same source, size, frame rate and quality' }
    }
  } else {
    reel.format = { ...format }
  }

  const index = reel.parts.length
  const partPath = keptOutputPath ?? path.join(reel.tmpDir, `part_${String(index).padStart(4, '0')}.mp4`)
  if (partPath === reel.outputPath) return { ok: false, error: 'A reel part cannot overwrite the reel itself' }
  reel.parts.push({ path: partPath, frameCount, keep: keptOutputPath !== null, done: false })
  return { ok: true, index, outputPath: partPath }
}

export function linkReelPartJob(jobId: string, reelId: string, index: number): void {
  partJobs.set(jobId, { reelId, index })
}

/** Called when a clip encode job finishes; a successful run marks its reel part ready. */
export function completeReelPartJob(jobId: string, success: boolean): void {
  const link = partJobs.get(jobId)
  if (!link) return
  partJobs.delete(jobId)
  const part = reels.get(link.reelId)?.parts[link.index]
  if (part && success) part.done = true
}

export interface AssembleReelInput {
  chapters: ReelChapter[]
}

/** Joins the finished parts (in reservation order) into the reel MP4 and deletes the temp dir. */
export async function assembleReelJob(
  reelId: string,
  input: AssembleReelInput,
  ffmpegPath: string,
  onProgress?: (percent: number) => void
): Promise<ClipExportResult> {
  const reel = reels.get(reelId)
  if (!reel) return { success: false, error: 'Unknown reel' }
  if (reel.cancelled) return { success: false, error: 'Reel was cancelled' }
  if (reel.child) return { success: false, error: 'Reel is already being assembled' }
  if (!reel.format || reel.parts.length === 0) return { success: false, error: 'Reel has no parts' }
  if (reel.parts.some((part) => !part.done)) return { success: false, error: 'Not every reel part finished encoding' }

  const totalFrames = reel.parts.reduce((sum, part) => sum + part.frameCount, 0)
  const chaptersError = validateReelChapters(input?.chapters, totalFrames)
  if (chaptersError) return { success: false, error: chaptersError }

  const listPath = path.join(reel.tmpDir, 'parts.txt')
  const metadataPath = path.join(reel.tmpDir, 'chapters.txt')
  try {
    await fsp.writeFile(listPath, buildReelConcatList(reel.parts.map((part) => part.path)))
    await fsp.writeFile(metadataPath, buildChapterMetadata(input.chapters, reel.format.fps))
  } catch (err) {
    await cleanupReel(reelId)
    return { success: false, error: err instanceof Error ? err.message : 'Could not write reel files' }
  }

  const args = buildReelAssembleArgs({ listPath, metadataPath, outputPath: reel.outputPath, hasAudio: reel.format.hasAudio })
  const totalDuration = totalFrames / reel.format.fps

  let child: ChildProcessWithoutNullStreams
  try {
    child = spawn(ffmpegPath, args)
  } catch (err) {
    await cleanupReel(reelId)
    return { success: false, error: err instanceof Error ? err.message : 'Failed to start ffmpeg' }
  }
  reel.child = child

  let stderrTail = ''
  let stdoutTail = ''
  child.stderr.on('data', (data: Buffer) => {
    stderrTail = (stderrTail + data.toString()).slice(-4000)
  })
  child.stdout.on('data', (data: Buffer) => {
    stdoutTail += data.toString()
    let newlineIndex: number
    while ((newlineIndex = stdoutTail.indexOf('\n')) >= 0) {
      const line = stdoutTail.slice(0, newlineIndex).trim()
      stdoutTail = stdoutTail.slice(newlineIndex + 1)
      const match = /^out_time_us=(-?\d+)$/.exec(line) || /^out_time_ms=(-?\d+)$/.exec(line)
      if (match && onProgress && totalDuration > 0) {
        const outTimeSeconds = Number(match[1]) / 1_000_000
        if (Number.isFinite(outTimeSeconds)) {
          onProgress(Math.max(0, Math.min(100, Math.round((outTimeSeconds / totalDuration) * 100))))
        }
      }
      if (line === 'progress=end' && onProgress) onProgress(100)
    }
  })

  const exitPromise = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.on('close', (code, signal) => resolve({ code, signal }))
  })
  child.on('error', (err) => {
    stderrTail += `\n[ffmpeg spawn error] ${err.message}`
  })

  const { code, signal } = await exitPromise
  const wasCancelled = reel.cancelled
  await cleanupReel(reelId)

  if (wasCancelled) return { success: false, error: 'Cancelled' }
  if (code === 0) return { success: true }

  const tail = stderrTail.trim().slice(-800)
  const reason = signal ? `signal ${signal}` : `code ${code}`
  return { success: false, error: `ffmpeg exited with ${reason}${tail ? `: ${tail}` : ''}` }
}

async function cleanupReel(reelId: string): Promise<void> {
  const reel = reels.get(reelId)
  if (!reel) return
  reels.delete(reelId)
  Array.from(partJobs.entries()).forEach(([jobId, link]) => {
    if (link.reelId === reelId) partJobs.delete(jobId)
  })
  try {
    await fsp.rm(reel.tmpDir, { recursive: true, force: true })
  } catch {
    // Best-effort; a leftover temp dir is not fatal.
  }
}

/**
 * Stops the join (if running), deletes the temp parts and any partial reel.
 * Kept individual clips that already finished stay, like a cancelled clip export.
 * The renderer cancels the in-flight clip job itself.
 */
export async function cancelReelJob(reelId: string): Promise<void> {
  const reel = reels.get(reelId)
  if (!reel) return
  reel.cancelled = true

  if (reel.child) {
    const child = reel.child
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
    await cleanupReel(reelId)
  }

  // Retry briefly: on Windows the handle can outlive the exit event by a moment.
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await fsp.unlink(reel.outputPath)
      return
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return
      await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)))
    }
  }
}

/** Cancels every reel. Used on app quit and main-window close. */
export async function cancelAllReelJobs(): Promise<void> {
  await Promise.all(Array.from(reels.keys()).map((id) => cancelReelJob(id)))
}
