import { describe, it, expect, afterAll } from 'vitest'
import { spawnSync } from 'child_process'
import fs from 'fs'
import fsp from 'fs/promises'
import os from 'os'
import path from 'path'
import {
  parseFfmpegProbeOutput,
  probeVideo,
  buildClipEncodeArgs,
  validateClipEncodeOptions,
  startClipEncodeJob,
  clipEncodeFrame,
  finishClipEncodeJob,
  cancelClipEncodeJob,
} from './clipExport'
import { getFfmpegBinaryPath } from './ffmpegExport'
import type { ClipEncodeStartOptions, OutputSegment } from '../src/types/clip'

// ---------------------------------------------------------------------------
// Realistic ffmpeg -i stderr samples
// ---------------------------------------------------------------------------

const STDERR_29_97_WITH_AUDIO = `ffmpeg version 6.0 Copyright (c) 2000-2023 the FFmpeg developers
  built with gcc 12
  configuration: --enable-gpl
Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'game.mp4':
  Metadata:
    major_brand     : isom
    minor_version   : 512
    compatible_brands: isomiso2avc1mp41
    encoder         : Lavf60.3.100
  Duration: 00:32:14.83, start: 0.000000, bitrate: 8123 kb/s
  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(tv, bt709), 1920x1080 [SAR 1:1 DAR 16:9], 8000 kb/s, 29.97 fps, 29.97 tbr, 90k tbn (default)
    Metadata:
      handler_name    : VideoHandler
      vendor_id       : [0][0][0][0]
  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 123 kb/s (default)
    Metadata:
      handler_name    : SoundHandler
      vendor_id       : [0][0][0][0]
At least one output file must be specified
`

const STDERR_59_94_NO_AUDIO = `ffmpeg version 6.0
Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'slowmo.mp4':
  Duration: 00:00:12.10, start: 0.000000, bitrate: 15234 kb/s
  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p, 1280x720, 15000 kb/s, 59.94 fps, 59.94 tbr, 60k tbn (default)
At least one output file must be specified
`

const STDERR_25_FPS = `ffmpeg version 6.0
Input #0, mpegts, from 'pal.ts':
  Duration: 00:00:45.00, start: 1.400000, bitrate: 4200 kb/s
  Program 1
    Stream #0:0[0x100]: Video: mpeg2video (Main), yuv420p(tv, bt601), 720x576 [SAR 16:15 DAR 4:3], 25 fps, 25 tbr, 90k tbn
    Stream #0:1[0x101](eng): Audio: mp2, 48000 Hz, stereo, s16p, 192 kb/s
At least one output file must be specified
`

const STDERR_ROTATED_SAR = `ffmpeg version 6.0
Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'phone.mov':
  Duration: 00:00:08.55, start: 0.000000, bitrate: 20123 kb/s
  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(tv, bt709), 1080x1920 [SAR 1:1 DAR 9:16], 20000 kb/s, 30 fps, 30 tbr, 600k tbn (default)
    Metadata:
      rotate          : 90
    Side data:
      displaymatrix: rotation of -90.00 degrees
  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 44100 Hz, stereo, fltp, 128 kb/s (default)
At least one output file must be specified
`

const STDERR_TBR_FALLBACK = `ffmpeg version 6.0
Input #0, avi, from 'legacy.avi':
  Duration: 00:01:00.00, start: 0.000000, bitrate: 3000 kb/s
  Stream #0:0: Video: mpeg4 (Advanced Simple Profile) (XVID / 0x44495658), yuv420p, 640x480, 23.98 tbr, 23.98 tbn, 23.98 tbc
  Stream #0:1: Audio: mp3, 44100 Hz, stereo, fltp, 128 kb/s
At least one output file must be specified
`

const STDERR_NO_VIDEO_STREAM = `ffmpeg version 6.0
Input #0, mp3, from 'song.mp3':
  Duration: 00:03:30.00, start: 0.000000, bitrate: 128 kb/s
  Stream #0:0: Audio: mp3, 44100 Hz, stereo, fltp, 128 kb/s
At least one output file must be specified
`

describe('parseFfmpegProbeOutput', () => {
  it('parses 29.97 fps with audio', () => {
    const probe = parseFfmpegProbeOutput(STDERR_29_97_WITH_AUDIO)
    expect(probe).toEqual({
      width: 1920,
      height: 1080,
      fps: 29.97,
      duration: 32 * 60 + 14.83,
      hasAudio: true,
    })
  })

  it('parses 59.94 fps with no audio track', () => {
    const probe = parseFfmpegProbeOutput(STDERR_59_94_NO_AUDIO)
    expect(probe).toEqual({
      width: 1280,
      height: 720,
      fps: 59.94,
      duration: 12.1,
      hasAudio: false,
    })
  })

  it('parses 25 fps PAL with SAR/DAR annotations', () => {
    const probe = parseFfmpegProbeOutput(STDERR_25_FPS)
    expect(probe).toEqual({
      width: 720,
      height: 576,
      fps: 25,
      duration: 45,
      hasAudio: true,
    })
  })

  it('parses a rotated phone video, reporting coded (unrotated) dimensions', () => {
    const probe = parseFfmpegProbeOutput(STDERR_ROTATED_SAR)
    expect(probe).toEqual({
      width: 1080,
      height: 1920,
      fps: 30,
      duration: 8.55,
      hasAudio: true,
    })
  })

  it('falls back to tbr when no explicit fps is printed', () => {
    const probe = parseFfmpegProbeOutput(STDERR_TBR_FALLBACK)
    expect(probe).toEqual({
      width: 640,
      height: 480,
      fps: 23.98,
      duration: 60,
      hasAudio: true,
    })
  })

  it('errors when there is no video stream', () => {
    const probe = parseFfmpegProbeOutput(STDERR_NO_VIDEO_STREAM)
    expect(probe).toHaveProperty('error')
  })

  it('errors on empty input', () => {
    expect(parseFfmpegProbeOutput('')).toHaveProperty('error')
  })
})

// ---------------------------------------------------------------------------
// buildClipEncodeArgs (pure filter/arg builder)
// ---------------------------------------------------------------------------

const BASE_OPTIONS = {
  outputPath: '/exports/clip.mp4',
  sourcePath: '/videos/game.mp4',
  width: 1920,
  height: 1080,
  fps: 30,
}

describe('buildClipEncodeArgs', () => {
  it('builds a high-quality, no-audio command with only even-dimension scaling', () => {
    const segments: OutputSegment[] = [{ kind: 'play', srcStart: 0, srcEnd: 2 }]
    const args = buildClipEncodeArgs({ ...BASE_OPTIONS, quality: 'high', segments, hasAudio: false })

    expect(args).toEqual([
      '-y',
      '-f', 'image2pipe',
      '-framerate', '30',
      '-c:v', 'mjpeg',
      '-i', 'pipe:0',
      '-filter_complex', '[0:v]scale=trunc(iw/2)*2:trunc(ih/2)*2[vout]',
      '-map', '[vout]',
      '-r', '30',
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '18',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      '/exports/clip.mp4',
    ])
  })

  it('builds a medium-quality command with play+hold audio segments, scaled to 720p', () => {
    const segments: OutputSegment[] = [
      { kind: 'play', srcStart: 10, srcEnd: 12.5 },
      { kind: 'hold', srcTime: 12.5, duration: 1.5 },
    ]
    const args = buildClipEncodeArgs({ ...BASE_OPTIONS, quality: 'medium', segments, hasAudio: true })

    expect(args).toContain('-i')
    expect(args).toContain('/videos/game.mp4')
    expect(args).toContain('[aout]')

    const filterIndex = args.indexOf('-filter_complex')
    const filter = args[filterIndex + 1]
    expect(filter).toContain('[0:v]scale=-2:min(ih\\,720)[vout]')
    expect(filter).toContain('[1:a]atrim=start=10.000000:end=12.500000,asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a0]')
    expect(filter).toContain('anullsrc=channel_layout=stereo:sample_rate=48000,atrim=duration=1.500000,asetpts=PTS-STARTPTS,aformat=sample_fmts=fltp:channel_layouts=stereo[a1]')
    expect(filter).toContain('[a0][a1]concat=n=2:v=0:a=1[aout]')

    expect(args).toContain('-map')
    expect(args[args.indexOf('-map') + 1]).toBe('[vout]')
    // second -map should be [aout]
    const secondMapIndex = args.indexOf('-map', args.indexOf('-map') + 1)
    expect(args[secondMapIndex + 1]).toBe('[aout]')

    expect(args).toContain('-crf')
    expect(args[args.indexOf('-crf') + 1]).toBe('23')
    expect(args).toContain('-c:a')
    expect(args).toContain('aac')
  })

  it('builds a low-quality command scaled to 480p with multiple play-only segments', () => {
    const segments: OutputSegment[] = [
      { kind: 'play', srcStart: 0, srcEnd: 1 },
      { kind: 'play', srcStart: 5, srcEnd: 6 },
    ]
    const args = buildClipEncodeArgs({ ...BASE_OPTIONS, quality: 'low', segments, hasAudio: true })
    const filter = args[args.indexOf('-filter_complex') + 1]
    expect(filter).toContain('scale=-2:min(ih\\,480)')
    expect(filter).toContain('concat=n=2:v=0:a=1[aout]')
    expect(args[args.indexOf('-preset') + 1]).toBe('fast')
    expect(args[args.indexOf('-crf') + 1]).toBe('28')
  })

  it('omits audio input, map and codec entirely when hasAudio is false', () => {
    const segments: OutputSegment[] = [{ kind: 'hold', srcTime: 0, duration: 1 }]
    const args = buildClipEncodeArgs({ ...BASE_OPTIONS, quality: 'high', segments, hasAudio: false })
    expect(args).not.toContain('/videos/game.mp4')
    expect(args).not.toContain('[aout]')
    expect(args).not.toContain('-c:a')
    expect(args.filter((a) => a === '-map')).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// validateClipEncodeOptions
// ---------------------------------------------------------------------------

function validOptions(): ClipEncodeStartOptions {
  return {
    outputPath: '/exports/clip.mp4',
    sourcePath: '/videos/game.mp4',
    width: 1920,
    height: 1080,
    fps: 30,
    frameCount: 90,
    quality: 'medium',
    segments: [{ kind: 'play', srcStart: 0, srcEnd: 3 }],
  }
}

describe('validateClipEncodeOptions', () => {
  it('accepts well-formed options', () => {
    expect(validateClipEncodeOptions(validOptions())).toBeNull()
  })

  it('rejects non-finite/zero/huge width, height, fps and frameCount', () => {
    expect(validateClipEncodeOptions({ ...validOptions(), width: 0 })).toMatch(/width/i)
    expect(validateClipEncodeOptions({ ...validOptions(), height: Number.NaN })).toMatch(/height/i)
    expect(validateClipEncodeOptions({ ...validOptions(), fps: -1 })).toMatch(/fps/i)
    expect(validateClipEncodeOptions({ ...validOptions(), fps: 10000 })).toMatch(/fps/i)
    expect(validateClipEncodeOptions({ ...validOptions(), frameCount: 0 })).toMatch(/frame count/i)
    expect(validateClipEncodeOptions({ ...validOptions(), frameCount: 1.5 })).toMatch(/frame count/i)
  })

  it('rejects empty or malformed segments', () => {
    expect(validateClipEncodeOptions({ ...validOptions(), segments: [] })).toMatch(/segments/i)
    expect(
      validateClipEncodeOptions({
        ...validOptions(),
        segments: [{ kind: 'play', srcStart: 5, srcEnd: 5 }],
      })
    ).toMatch(/play segment/i)
    expect(
      validateClipEncodeOptions({
        ...validOptions(),
        segments: [{ kind: 'hold', srcTime: 0, duration: 0 }],
      })
    ).toMatch(/hold segment/i)
  })

  it('rejects unknown quality and empty paths', () => {
    // @ts-expect-error deliberately invalid for the test
    expect(validateClipEncodeOptions({ ...validOptions(), quality: 'ultra' })).toMatch(/quality/i)
    expect(validateClipEncodeOptions({ ...validOptions(), outputPath: '' })).toMatch(/output path/i)
    expect(validateClipEncodeOptions({ ...validOptions(), sourcePath: '' })).toMatch(/source path/i)
  })
})

// ---------------------------------------------------------------------------
// End-to-end: real ffmpeg, no ipcMain — startClipEncodeJob/clipEncodeFrame/
// finishClipEncodeJob directly, segments [play 0-0.5, hold 0.5 for 0.5].
// ---------------------------------------------------------------------------

function resolveFfmpegForTest(): string | null {
  try {
    const candidate = getFfmpegBinaryPath()
    const probe = spawnSync(candidate, ['-version'])
    if (probe.status === 0) return candidate
  } catch {
    // fall through to system ffmpeg
  }
  const system = spawnSync('ffmpeg', ['-version'])
  return system.status === 0 ? 'ffmpeg' : null
}

const ffmpegPath = resolveFfmpegForTest()
const describeIfFfmpeg = ffmpegPath ? describe : describe.skip

describeIfFfmpeg('clip encode job (end-to-end with real ffmpeg)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clip-export-test-'))
  const sourcePath = path.join(tmpDir, 'source.mp4')
  const outputPath = path.join(tmpDir, 'output.mp4')
  const framesDir = path.join(tmpDir, 'frames')

  afterAll(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true })
  })

  it('encodes 30 frames with a play+hold segment pair to a ~1s output', async () => {
    const bin = ffmpegPath as string

    // 1s, 30fps test source with a sine-wave audio track.
    const genSource = spawnSync(bin, [
      '-y',
      '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=30:duration=1',
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-shortest',
      sourcePath,
    ])
    expect(genSource.status).toBe(0)

    // 30 JPEG frames, one per output frame.
    fs.mkdirSync(framesDir)
    const genFrames = spawnSync(bin, [
      '-y',
      '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=30:duration=1',
      path.join(framesDir, 'frame%03d.jpg'),
    ])
    expect(genFrames.status).toBe(0)
    const frameFiles = fs.readdirSync(framesDir).filter((f) => f.endsWith('.jpg')).sort()
    expect(frameFiles.length).toBe(30)

    const options: ClipEncodeStartOptions = {
      outputPath,
      sourcePath,
      width: 320,
      height: 240,
      fps: 30,
      frameCount: 30,
      quality: 'low',
      segments: [
        { kind: 'play', srcStart: 0, srcEnd: 0.5 },
        { kind: 'hold', srcTime: 0.5, duration: 0.5 },
      ],
    }

    const started = startClipEncodeJob(options, true, bin)
    expect(started.ok).toBe(true)
    if (!started.ok) return
    const { jobId } = started

    for (const file of frameFiles) {
      const buf = await fsp.readFile(path.join(framesDir, file))
      const accepted = await clipEncodeFrame(jobId, buf)
      expect(accepted).toBe(true)
    }

    const result = await finishClipEncodeJob(jobId)
    expect(result.success).toBe(true)

    const stat = await fsp.stat(outputPath)
    expect(stat.size).toBeGreaterThan(0)

    const probe = await probeVideo(outputPath, bin)
    expect(probe).not.toHaveProperty('error')
    if ('duration' in probe) {
      expect(probe.duration).toBeGreaterThan(0.85)
      expect(probe.duration).toBeLessThan(1.15)
      expect(probe.hasAudio).toBe(true)
    }
  }, 30000)

  it('cancel kills ffmpeg and removes the partial output file', async () => {
    const bin = ffmpegPath as string
    const cancelOutputPath = path.join(tmpDir, 'cancelled.mp4')
    const options: ClipEncodeStartOptions = {
      outputPath: cancelOutputPath,
      sourcePath,
      width: 320,
      height: 240,
      fps: 30,
      frameCount: 30,
      quality: 'low',
      segments: [{ kind: 'play', srcStart: 0, srcEnd: 1 }],
    }
    const started = startClipEncodeJob(options, true, bin)
    expect(started.ok).toBe(true)
    if (!started.ok) return

    // Send one frame so ffmpeg has actually opened the output file.
    const oneFrame = await fsp.readFile(path.join(framesDir, fs.readdirSync(framesDir)[0]))
    await clipEncodeFrame(started.jobId, oneFrame)

    await cancelClipEncodeJob(started.jobId)

    await expect(fsp.stat(cancelOutputPath)).rejects.toThrow()
    // A second finish/cancel on the same id is a no-op, not a crash.
    const finishAfterCancel = await finishClipEncodeJob(started.jobId)
    expect(finishAfterCancel.success).toBe(false)
  }, 15000)
})
