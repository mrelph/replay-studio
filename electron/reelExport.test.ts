import { describe, it, expect, afterAll } from 'vitest'
import { spawn, spawnSync } from 'child_process'
import fs from 'fs'
import fsp from 'fs/promises'
import os from 'os'
import path from 'path'
import {
  buildReelConcatList,
  buildChapterMetadata,
  validateReelChapters,
  buildReelAssembleArgs,
  startReelJob,
  reserveReelPart,
  linkReelPartJob,
  completeReelPartJob,
  assembleReelJob,
  cancelReelJob,
  type ReelPartFormat,
} from './reelExport'
import { probeVideo, startClipEncodeJob, addOverlayToJob, runClipEncodeJob } from './clipExport'
import { getFfmpegBinaryPath } from './ffmpegExport'
import type { OutputSegment, ReelChapter, VideoProbe } from '../src/types/clip'

describe('buildReelConcatList', () => {
  it('lists absolute paths in order, escaping single quotes', () => {
    expect(buildReelConcatList(['/tmp/a/part_0000.mp4', "/home/me/Mark's clips/01 - Goal.mp4"])).toBe(
      "file '/tmp/a/part_0000.mp4'\nfile '/home/me/Mark'\\''s clips/01 - Goal.mp4'\n"
    )
  })
})

describe('buildChapterMetadata', () => {
  it('writes millisecond chapters from frame positions at 29.97', () => {
    const fps = 30000 / 1001
    const meta = buildChapterMetadata(
      [
        { title: 'Breakout', startFrame: 0, frameCount: 90 },
        { title: 'PK; 2nd = good #1', startFrame: 90, frameCount: 45 },
      ],
      fps
    )
    expect(meta).toBe(
      [
        ';FFMETADATA1',
        '[CHAPTER]', 'TIMEBASE=1/1000', 'START=0', 'END=3003', 'title=Breakout',
        '[CHAPTER]', 'TIMEBASE=1/1000', 'START=3003', 'END=4505', 'title=PK\\; 2nd \\= good \\#1',
      ].join('\n') + '\n'
    )
  })

  it('flattens newlines and escapes backslashes in titles', () => {
    const meta = buildChapterMetadata([{ title: 'a\\b\nc', startFrame: 0, frameCount: 30 }], 30)
    expect(meta).toContain('title=a\\\\b c\n')
  })
})

describe('validateReelChapters', () => {
  const ok: ReelChapter[] = [
    { title: 'a', startFrame: 0, frameCount: 10 },
    { title: 'b', startFrame: 10, frameCount: 5 },
  ]
  it('accepts contiguous chapters covering the reel', () => {
    expect(validateReelChapters(ok, 15)).toBeNull()
  })
  it('rejects gaps, empty chapters, short coverage and empty lists', () => {
    expect(validateReelChapters([], 0)).not.toBeNull()
    expect(validateReelChapters([ok[0], { ...ok[1], startFrame: 11 }], 16)).not.toBeNull()
    expect(validateReelChapters([{ ...ok[0], frameCount: 0 }], 0)).not.toBeNull()
    expect(validateReelChapters(ok, 20)).not.toBeNull()
    expect(validateReelChapters('nope', 0)).not.toBeNull()
  })
})

describe('buildReelAssembleArgs', () => {
  it('copies video, re-encodes audio, and maps chapters from the metadata input', () => {
    expect(buildReelAssembleArgs({ listPath: '/t/parts.txt', metadataPath: '/t/chapters.txt', outputPath: '/o/Reel.mp4', hasAudio: true })).toEqual([
      '-y',
      '-f', 'concat', '-safe', '0', '-i', '/t/parts.txt',
      '-f', 'ffmetadata', '-i', '/t/chapters.txt',
      '-map', '0:v:0', '-map', '0:a:0',
      '-map_metadata', '1', '-map_chapters', '1',
      '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k',
      '-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', '/o/Reel.mp4',
    ])
  })

  it('maps and encodes no audio for a silent source', () => {
    const args = buildReelAssembleArgs({ listPath: 'l', metadataPath: 'm', outputPath: 'o.mp4', hasAudio: false })
    expect(args).not.toContain('0:a:0')
    expect(args).not.toContain('-c:a')
  })
})

describe('reel registry', () => {
  const format: ReelPartFormat = { sourcePath: '/v/game.mp4', width: 1920, height: 1080, fps: 30, quality: 'high', hasAudio: true }

  it('places temp parts in the reel dir, kept parts at their own path, and rejects a mismatched format', async () => {
    const started = await startReelJob(path.join(os.tmpdir(), 'reel-registry-test.mp4'))
    expect(started.ok).toBe(true)
    if (!started.ok) return

    const temp = reserveReelPart(started.reelId, format, 30, null)
    expect(temp.ok && path.basename(temp.outputPath)).toBe('part_0000.mp4')
    const kept = reserveReelPart(started.reelId, format, 30, '/exports/01 - Goal.mp4')
    expect(kept.ok && kept.outputPath).toBe('/exports/01 - Goal.mp4')
    expect(reserveReelPart(started.reelId, { ...format, quality: 'low' }, 30, null).ok).toBe(false)

    // Parts not finished yet: assembling must refuse.
    const early = await assembleReelJob(started.reelId, { chapters: [{ title: 'a', startFrame: 0, frameCount: 60 }] }, 'ffmpeg')
    expect(early.success).toBe(false)
    expect(early.error).toMatch(/finished/)

    await cancelReelJob(started.reelId)
    expect(reserveReelPart(started.reelId, format, 30, null).ok).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// End-to-end: real ffmpeg. A 29.97 source with a tone; a reel of three clips,
// each preceded by a silent 1 s title card, one clip containing a 0.5 s hold.
// Every part goes through the real clip job API, then the reel is joined.
// ---------------------------------------------------------------------------

function resolveFfmpegForTest(): string | null {
  try {
    const candidate = getFfmpegBinaryPath()
    if (spawnSync(candidate, ['-version']).status === 0) return candidate
  } catch {
    // fall through to system ffmpeg
  }
  return spawnSync('ffmpeg', ['-version']).status === 0 ? 'ffmpeg' : null
}

function run(bin: string, args: string[]): Promise<{ code: number | null; stdout: Buffer; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args)
    const chunks: Buffer[] = []
    let stderr = ''
    child.stdout.on('data', (d: Buffer) => chunks.push(d))
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => resolve({ code, stdout: Buffer.concat(chunks), stderr }))
  })
}

async function samplePixel(bin: string, filePath: string, t: number, x: number, y: number): Promise<[number, number, number]> {
  const { stdout } = await run(bin, ['-ss', t.toFixed(6), '-i', filePath, '-vf', `crop=2:2:${x}:${y}`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])
  return [stdout[0], stdout[1], stdout[2]]
}

/** Same frame rounding as segmentFrameCounts: the total is round(sum of durations * fps). */
function frameCountOf(segments: OutputSegment[], fps: number): number {
  const seconds = segments.reduce((sum, s) => sum + (s.kind === 'play' ? s.srcEnd - s.srcStart : s.duration), 0)
  return Math.round(seconds * fps)
}

/** Every match of a global regex (the electron tsconfig predates matchAll). */
function allMatches(re: RegExp, text: string): RegExpExecArray[] {
  const out: RegExpExecArray[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) out.push(m)
  return out
}

function last<T>(items: T[]): T | undefined {
  return items[items.length - 1]
}

const ffmpegPath = resolveFfmpegForTest()
const describeIfFfmpeg = ffmpegPath ? describe : describe.skip

describeIfFfmpeg('reel (end-to-end with real ffmpeg)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reel-e2e-'))
  const sourcePath = path.join(tmpDir, 'source.mp4')
  const reelPath = path.join(tmpDir, 'Reel - Test.mp4')
  const keptPath = path.join(tmpDir, '02 - Hold.mp4')
  const WIDTH = 640
  const HEIGHT = 360

  afterAll(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true })
  })

  it('joins cards and clips frame-exactly, with chapters and audio in sync at every cut', async () => {
    const bin = ffmpegPath as string

    const gen = spawnSync(bin, [
      '-y',
      '-f', 'lavfi', '-i', `testsrc2=size=${WIDTH}x${HEIGHT}:rate=30000/1001:duration=8`,
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=8',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', sourcePath,
    ])
    expect(gen.status).toBe(0)

    const probe = (await probeVideo(sourcePath, bin)) as VideoProbe
    expect('error' in probe).toBe(false)
    const fps = probe.fps
    const format: ReelPartFormat = { sourcePath, width: WIDTH, height: HEIGHT, fps, quality: 'high', hasAudio: probe.hasAudio }

    const started = await startReelJob(reelPath)
    expect(started.ok).toBe(true)
    if (!started.ok) return
    const { reelId } = started

    // Card overlay: an opaque white box over an 80% black scrim.
    const card = Buffer.alloc(WIDTH * HEIGHT * 4)
    for (let i = 0; i < WIDTH * HEIGHT; i++) card[i * 4 + 3] = 204
    for (let y = 100; y < 200; y++) {
      for (let x = 100; x < 300; x++) card.fill(255, (y * WIDTH + x) * 4, (y * WIDTH + x) * 4 + 4)
    }

    const clips: { title: string; segments: OutputSegment[]; keep: boolean }[] = [
      { title: 'Breakout', segments: [{ kind: 'play', srcStart: 1, srcEnd: 2.5 }], keep: false },
      {
        title: 'Hold',
        segments: [
          { kind: 'play', srcStart: 3, srcEnd: 4 },
          { kind: 'hold', srcTime: 4, duration: 0.5 },
          { kind: 'play', srcStart: 4, srcEnd: 5 },
        ],
        keep: true,
      },
      { title: 'PK', segments: [{ kind: 'play', srcStart: 6, srcEnd: 7.2 }], keep: false },
    ]

    const encodePart = async (segments: OutputSegment[], keep: boolean, overlay: Buffer | null) => {
      const frameCount = frameCountOf(segments, fps)
      const reserved = reserveReelPart(reelId, format, frameCount, keep ? keptPath : null)
      expect(reserved.ok).toBe(true)
      if (!reserved.ok) throw new Error(reserved.error)
      const job = await startClipEncodeJob(
        { outputPath: reserved.outputPath, sourcePath, width: WIDTH, height: HEIGHT, fps, frameCount, quality: 'high', segments },
        probe.hasAudio
      )
      if (!job.ok) throw new Error(job.error)
      linkReelPartJob(job.jobId, reelId, reserved.index)
      const spans = []
      if (overlay) {
        const added = await addOverlayToJob(job.jobId, overlay)
        if (!added.ok) throw new Error(added.error)
        spans.push({ overlayIndex: added.index, frameStart: 0, frameCount })
      }
      const result = await runClipEncodeJob(job.jobId, { spans, magnifiers: [] }, bin)
      completeReelPartJob(job.jobId, result.success)
      expect(result).toEqual({ success: true })
      return frameCount
    }

    const chapters: ReelChapter[] = []
    const cardWindows: { start: number; end: number }[] = []
    let frame = 0
    for (const clip of clips) {
      const firstSrc = clip.segments[0].kind === 'play' ? clip.segments[0].srcStart : clip.segments[0].srcTime
      const cardFrames = await encodePart([{ kind: 'hold', srcTime: firstSrc, duration: 1 }], false, card)
      const clipFrames = await encodePart(clip.segments, clip.keep, null)
      cardWindows.push({ start: frame / fps, end: (frame + cardFrames) / fps })
      chapters.push({ title: clip.title, startFrame: frame, frameCount: cardFrames + clipFrames })
      frame += cardFrames + clipFrames
    }
    const totalFrames = frame

    const progress: number[] = []
    const assembled = await assembleReelJob(reelId, { chapters }, bin, (p) => progress.push(p))
    expect(assembled).toEqual({ success: true })
    expect(last(progress)).toBe(100)

    // Temp parts are gone with the temp dir; the kept clip stays.
    expect(fs.existsSync(keptPath)).toBe(true)

    // Exact frame count: the joined video is the sum of its parts.
    const videoPass = await run(bin, ['-i', reelPath, '-map', '0:v', '-f', 'null', '-'])
    const frameMatches = allMatches(/frame=\s*(\d+)/g, videoPass.stderr)
    expect(Number(last(frameMatches)?.[1])).toBe(totalFrames)

    // Chapters as ffmpeg reads them back.
    const info = (await run(bin, ['-hide_banner', '-i', reelPath])).stderr
    const chapterStarts = allMatches(/Chapter #0:\d+: start (\d+\.\d+), end (\d+\.\d+)/g, info).map((m) => Number(m[1]))
    expect(chapterStarts).toHaveLength(3)
    chapters.forEach((chapter, i) => expect(chapterStarts[i]).toBeCloseTo(chapter.startFrame / fps, 2))
    expect(info).toMatch(/title\s*:\s*Hold/)

    // The concat demuxer aligns each part's earliest timestamp (the AAC
    // priming, -1024 samples) to 0, so the copied video starts ~21 ms after
    // the audio. That is a constant lead-in, not drift: sync is measured
    // against where the video really starts.
    const firstVideo = await run(bin, ['-hide_banner', '-copyts', '-i', reelPath, '-map', '0:v', '-vf', 'showinfo', '-frames:v', '1', '-f', 'null', '-'])
    const videoStart = Number(/pts_time:(-?\d+(?:\.\d+)?)/.exec(firstVideo.stderr)?.[1])
    expect(videoStart).toBeGreaterThanOrEqual(0)
    expect(videoStart).toBeLessThan(0.03)

    // Audio length matches video length (no drift over the joins).
    const audioPass = await run(bin, ['-i', reelPath, '-map', '0:a', '-f', 'null', '-'])
    const times = allMatches(/time=(\d+):(\d+):(\d+\.\d+)/g, audioPass.stderr)
    const lastTime = last(times)!
    const audioSeconds = Number(lastTime[1]) * 3600 + Number(lastTime[2]) * 60 + Number(lastTime[3])
    expect(Math.abs(audioSeconds - (videoStart + totalFrames / fps))).toBeLessThan(1 / fps)

    // A/V sync at every cut: each silent card's silence must line up with
    // its video window. silencedetect also reports the hold inside clip 2.
    // Silence *ends* (tone onsets: each clip starting after its card) are
    // sample-accurate; silence *starts* are only resolved to one AAC frame
    // (1024 samples), so they get that much slack.
    const silence = await run(bin, ['-i', reelPath, '-map', '0:a', '-af', 'silencedetect=noise=-40dB:d=0.1', '-f', 'null', '-'])
    const starts = allMatches(/silence_start: (-?\d+(?:\.\d+)?)/g, silence.stderr).map((m) => Math.max(0, Number(m[1])))
    const ends = allMatches(/silence_end: (\d+(?:\.\d+)?)/g, silence.stderr).map((m) => Number(m[1]))
    const onsetTolerance = 0.01
    const startTolerance = 1024 / 48000 + 0.005
    expect(starts).toHaveLength(cardWindows.length + 1)
    for (const window of cardWindows) {
      const i = ends.findIndex((e) => Math.abs(e - (videoStart + window.end)) < onsetTolerance)
      expect(i, `clip audio starting at ${(videoStart + window.end).toFixed(3)}s in ${ends.join(', ')}`).toBeGreaterThanOrEqual(0)
      // The first card's silence starts with the audio itself, before the video.
      const expectedStart = window.start === 0 ? 0 : videoStart + window.start
      expect(Math.abs(starts[i] - expectedStart), `card starting at ${expectedStart.toFixed(3)}s`).toBeLessThan(startTolerance)
    }
    const holdStart = videoStart + (chapters[1].startFrame + Math.round(fps) + Math.round(1 * fps)) / fps
    const holdIndex = starts.findIndex((s) => Math.abs(s - holdStart) < startTolerance)
    expect(holdIndex).toBeGreaterThanOrEqual(0)
    expect(Math.abs(ends[holdIndex] - (holdStart + 0.5))).toBeLessThan(onsetTolerance)

    // Card frames show the box over the scrim; the first clip frame is the source.
    const [r, g, b] = await samplePixel(bin, reelPath, 0.5, 150, 150)
    expect(Math.min(r, g, b)).toBeGreaterThan(230)
    const scrim = await samplePixel(bin, reelPath, 0.5, 500, 300)
    const raw = await samplePixel(bin, sourcePath, 1, 500, 300)
    expect(Math.max(...scrim)).toBeLessThanOrEqual(Math.max(...raw) * 0.35 + 8)
    const clipStart = cardWindows[0].end + 0.5 / fps
    const reelPixel = await samplePixel(bin, reelPath, clipStart, 500, 300)
    raw.forEach((channel, i) => expect(Math.abs(reelPixel[i] - channel)).toBeLessThan(24))
  }, 120_000)
})
