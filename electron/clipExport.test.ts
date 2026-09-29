import { describe, it, expect, afterAll } from 'vitest'
import { spawn, spawnSync } from 'child_process'
import fs from 'fs'
import fsp from 'fs/promises'
import os from 'os'
import path from 'path'
import {
  parseFfmpegProbeOutput,
  probeVideo,
  buildClipEncodeFilterGraph,
  frameWindowStart,
  alignSegmentsToFrames,
  buildOverlayConcatList,
  computeSeekOffset,
  validateClipEncodeOptions,
  validateOverlaySpans,
  validateMagnifierOps,
  startClipEncodeJob,
  addOverlayToJob,
  encodeRgbaPng,
  runClipEncodeJob,
  cancelClipEncodeJob,
} from './clipExport'
import { getFfmpegBinaryPath } from './ffmpegExport'
import type { ClipEncodeStartOptions, MagnifierOp, OutputSegment, OverlaySpan } from '../src/types/clip'

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
// computeSeekOffset
// ---------------------------------------------------------------------------

describe('computeSeekOffset', () => {
  it('uses the first segment\'s play start', () => {
    const segments: OutputSegment[] = [{ kind: 'play', srcStart: 12.5, srcEnd: 20 }]
    expect(computeSeekOffset(segments)).toBe(12.5)
  })

  it('uses the first segment\'s hold time', () => {
    const segments: OutputSegment[] = [
      { kind: 'hold', srcTime: 3, duration: 1 },
      { kind: 'play', srcStart: 3, srcEnd: 10 },
    ]
    expect(computeSeekOffset(segments)).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// buildClipEncodeFilterGraph (pure filter/arg builder)
// ---------------------------------------------------------------------------

const BASE_INPUT = {
  outputPath: '/exports/clip.mp4',
  sourcePath: '/videos/game.mp4',
  fps: 30,
}

describe('frame alignment of cut points', () => {
  const fps = 30000 / 1001

  it('keeps the frame on screen at a mid-frame time, not the next one', () => {
    // Frame 150 spans [5.005, 5.0384); a playhead just inside it (as after
    // frame-stepping) must select frame 150, whose PTS lies in the window.
    const start = frameWindowStart(150 / fps + 1e-4, fps)
    expect(start).toBeLessThan(150 / fps)
    expect(start + 1 / fps).toBeGreaterThan(150 / fps)
    expect(start + 1 / fps).toBeLessThan(151 / fps)
  })

  it('clamps at the start of the video', () => {
    expect(frameWindowStart(0, 30)).toBe(0)
  })

  it('shifts play ranges and hold frames alike, preserving hold durations', () => {
    const aligned = alignSegmentsToFrames([
      { kind: 'play', srcStart: 3.0, srcEnd: 5.0051 },
      { kind: 'hold', srcTime: 5.0051, duration: 3 },
    ], fps)
    expect(aligned[0]).toEqual({ kind: 'play', srcStart: 88.5 / fps, srcEnd: 149.5 / fps })
    expect(aligned[1]).toEqual({ kind: 'hold', srcTime: 149.5 / fps, duration: 3 })
  })
})

describe('buildClipEncodeFilterGraph', () => {
  it('builds a high-quality, no-audio, no-overlay, no-magnifier command with an accurate input seek', () => {
    const segments: OutputSegment[] = [{ kind: 'play', srcStart: 10, srcEnd: 12 }]
    const args = buildClipEncodeFilterGraph({
      ...BASE_INPUT,
      frameCount: 60,
      quality: 'high',
      segments,
      hasAudio: false,
      magnifiers: [],
    })

    expect(args).toEqual([
      '-y',
      // Half a frame early, so the frame on screen at 10 s survives the seek.
      '-ss', '9.983333',
      '-i', '/videos/game.mp4',
      '-filter_complex',
      '[0:v]trim=start=0.000000:end=2.000000,setpts=PTS-STARTPTS[v0];' +
        '[v0]concat=n=1:v=1:a=0[vbase0];' +
        '[vbase0]fps=30.000000,tpad=stop_mode=clone:stop_duration=0.5[vbase];' +
        '[vbase]scale=trunc(iw/2)*2:trunc(ih/2)*2[vout]',
      '-map', '[vout]',
      '-r', '30.000000',
      '-frames:v', '60',
      '-c:v', 'libx264',
      '-preset', 'medium',
      '-crf', '18',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      '-progress', 'pipe:1',
      '-nostats',
      '/exports/clip.mp4',
    ])
  })

  it('shifts play and hold segment times by the seek offset, and locks the hold to its exact frame count', () => {
    const segments: OutputSegment[] = [
      { kind: 'play', srcStart: 10, srcEnd: 12.5 },
      { kind: 'hold', srcTime: 12.5, duration: 1.5 },
    ]
    const args = buildClipEncodeFilterGraph({
      ...BASE_INPUT,
      frameCount: 120,
      quality: 'medium',
      segments,
      hasAudio: true,
      magnifiers: [],
    })

    expect(args).toContain('-ss')
    expect(args[args.indexOf('-ss') + 1]).toBe('9.983333')

    const filter = args[args.indexOf('-filter_complex') + 1]
    // Play segment shifted by the 10s seek offset: [0, 2.5).
    expect(filter).toContain('[0:v]trim=start=0.000000:end=2.500000,setpts=PTS-STARTPTS[v0]')
    // Hold: one frame at the shifted time (2.5), looped to its exact frame count (45 frames @ 30fps = 1.5s).
    expect(filter).toContain(
      '[0:v]trim=start=2.500000:end=2.533333,setpts=PTS-STARTPTS,loop=loop=44:size=1:start=0,setpts=N/(30.000000*TB)[v1]'
    )
    expect(filter).toContain('[v0][v1]concat=n=2:v=1:a=0[vbase0]')
    expect(filter).toContain('[vbase0]fps=30.000000,tpad=stop_mode=clone:stop_duration=0.5[vbase]')
    expect(filter).toContain('[vbase]scale=-2:min(ih\\,720)[vout]')

    // Audio built from the same single (seeked) input, same time shift.
    expect(filter).toContain(
      '[0:a]atrim=start=0.000000:end=2.500000,asetpts=PTS-STARTPTS,aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo[a0]'
    )
    expect(filter).toContain(
      'anullsrc=channel_layout=stereo:sample_rate=48000,atrim=duration=1.500000,asetpts=PTS-STARTPTS,aformat=sample_fmts=fltp:channel_layouts=stereo[a1]'
    )
    expect(filter).toContain('[a0][a1]concat=n=2:v=0:a=1[aout]')

    expect(args).not.toContain('-f') // no second (overlay) input
    expect(args).toContain('-map')
    expect(args[args.indexOf('-map') + 1]).toBe('[vout]')
    const secondMapIndex = args.indexOf('-map', args.indexOf('-map') + 1)
    expect(args[secondMapIndex + 1]).toBe('[aout]')
    expect(args).toContain('-c:a')
    expect(args).toContain('aac')
  })

  it('adds a second (concat demuxer) input and overlay filter when an overlay list is given', () => {
    const segments: OutputSegment[] = [{ kind: 'play', srcStart: 0, srcEnd: 2 }]
    const args = buildClipEncodeFilterGraph({
      ...BASE_INPUT,
      frameCount: 60,
      quality: 'high',
      segments,
      hasAudio: false,
      overlayConcatListPath: '/tmp/job/overlay_list.txt',
      magnifiers: [],
    })

    expect(args).toContain('-f')
    expect(args[args.indexOf('-f') + 1]).toBe('concat')
    expect(args).toContain('-safe')
    expect(args).toContain('/tmp/job/overlay_list.txt')

    const filter = args[args.indexOf('-filter_complex') + 1]
    expect(filter).toContain('[1:v]fps=30.000000,format=rgba[ovl]')
    expect(filter).toContain('[vbase][ovl]overlay=0:0:format=auto:eof_action=pass[vov]')
    expect(filter).toContain('[vov]scale=trunc(iw/2)*2:trunc(ih/2)*2[vout]')
  })

  it('builds a crop/scale/circular-mask/overlay chain per magnifier, chained onto the drawing overlay', () => {
    const segments: OutputSegment[] = [{ kind: 'play', srcStart: 0, srcEnd: 2 }]
    const magnifiers: MagnifierOp[] = [
      {
        sourceRect: { x: 100, y: 100, width: 80, height: 80 },
        destCircle: { centerX: 500, centerY: 300, radius: 60 },
        enable: [{ start: 0, end: 1 }, { start: 1.5, end: 2 }],
      },
    ]
    const args = buildClipEncodeFilterGraph({
      ...BASE_INPUT,
      frameCount: 60,
      quality: 'high',
      segments,
      hasAudio: false,
      overlayConcatListPath: '/tmp/job/overlay_list.txt',
      magnifiers,
    })

    const filter = args[args.indexOf('-filter_complex') + 1]
    expect(filter).toContain('[vbase]split=2[vbase_ovl][vbase_mag0]')
    expect(filter).toContain('[vbase_mag0]crop=80:80:100:100,scale=120:120,format=rgba,geq=')
    expect(filter).toContain(
      "[vbase_ovl][magcirc0]overlay=440:240:enable='between(t\\,0.000000\\,1.000000)+between(t\\,1.500000\\,2.000000)':eof_action=pass[vmagfinal]"
    )
    // Drawing overlay chains onto the magnifier's output, not straight onto vbase.
    expect(filter).toContain('[vmagfinal][ovl]overlay=0:0:format=auto:eof_action=pass[vov]')
  })

  it('scales for quality only after all compositing (magnifier + overlay)', () => {
    const segments: OutputSegment[] = [{ kind: 'play', srcStart: 0, srcEnd: 1 }]
    const magnifiers: MagnifierOp[] = [
      { sourceRect: { x: 0, y: 0, width: 40, height: 40 }, destCircle: { centerX: 100, centerY: 100, radius: 40 }, enable: [{ start: 0, end: 1 }] },
    ]
    const args = buildClipEncodeFilterGraph({
      ...BASE_INPUT,
      frameCount: 30,
      quality: 'low',
      segments,
      hasAudio: false,
      overlayConcatListPath: '/tmp/job/overlay_list.txt',
      magnifiers,
    })
    const filter = args[args.indexOf('-filter_complex') + 1]
    // The only scale= for quality (480p) is the very last filter stage, after [vov].
    expect(filter.endsWith('[vov]scale=-2:min(ih\\,480)[vout]')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// buildOverlayConcatList
// ---------------------------------------------------------------------------

describe('buildOverlayConcatList', () => {
  it('writes one file/duration pair per span, plus the last file repeated with no duration', () => {
    const overlayPaths = ['/tmp/job/overlay_0.png', '/tmp/job/overlay_1.png']
    const spans: OverlaySpan[] = [
      { overlayIndex: 0, frameStart: 0, frameCount: 45 },
      { overlayIndex: 1, frameStart: 45, frameCount: 90 },
    ]
    const list = buildOverlayConcatList(spans, overlayPaths, 30)
    expect(list).toBe(
      "file 'overlay_0.png'\n" +
        'duration 1.500000\n' +
        "file 'overlay_1.png'\n" +
        'duration 3.000000\n' +
        "file 'overlay_1.png'\n"
    )
  })

  it('produces an empty string for no spans', () => {
    expect(buildOverlayConcatList([], [], 30)).toBe('\n')
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
// validateOverlaySpans / validateMagnifierOps
// ---------------------------------------------------------------------------

describe('validateOverlaySpans', () => {
  it('accepts an empty span list', () => {
    expect(validateOverlaySpans([], 0, 100)).toBeNull()
  })

  it('accepts contiguous spans covering exactly the frame count', () => {
    const spans: OverlaySpan[] = [
      { overlayIndex: 0, frameStart: 0, frameCount: 40 },
      { overlayIndex: 1, frameStart: 40, frameCount: 60 },
    ]
    expect(validateOverlaySpans(spans, 2, 100)).toBeNull()
  })

  it('rejects an out-of-range overlay index', () => {
    const spans: OverlaySpan[] = [{ overlayIndex: 2, frameStart: 0, frameCount: 100 }]
    expect(validateOverlaySpans(spans, 2, 100)).toMatch(/overlay index/i)
  })

  it('rejects a gap between spans', () => {
    const spans: OverlaySpan[] = [
      { overlayIndex: 0, frameStart: 0, frameCount: 40 },
      { overlayIndex: 0, frameStart: 50, frameCount: 50 },
    ]
    expect(validateOverlaySpans(spans, 1, 100)).toMatch(/contiguous/i)
  })

  it('rejects spans that do not cover the whole frame count', () => {
    const spans: OverlaySpan[] = [{ overlayIndex: 0, frameStart: 0, frameCount: 40 }]
    expect(validateOverlaySpans(spans, 1, 100)).toMatch(/frame count/i)
  })
})

describe('validateMagnifierOps', () => {
  const width = 1920
  const height = 1080

  function validOp(): MagnifierOp {
    return {
      sourceRect: { x: 100, y: 100, width: 80, height: 80 },
      destCircle: { centerX: 500, centerY: 300, radius: 60 },
      enable: [{ start: 0, end: 1 }],
    }
  }

  it('accepts an empty magnifier list', () => {
    expect(validateMagnifierOps([], width, height, 10)).toBeNull()
  })

  it('accepts a well-formed op', () => {
    expect(validateMagnifierOps([validOp()], width, height, 10)).toBeNull()
  })

  it('rejects a source rect outside the frame', () => {
    const op = { ...validOp(), sourceRect: { x: 1900, y: 0, width: 100, height: 100 } }
    expect(validateMagnifierOps([op], width, height, 10)).toMatch(/source rect/i)
  })

  it('rejects a non-positive radius', () => {
    const op = { ...validOp(), destCircle: { ...validOp().destCircle, radius: 0 } }
    expect(validateMagnifierOps([op], width, height, 10)).toMatch(/radius/i)
  })

  it('rejects an empty enable window list', () => {
    const op = { ...validOp(), enable: [] }
    expect(validateMagnifierOps([op], width, height, 10)).toMatch(/enable window/i)
  })

  it('rejects an enable window past the job duration', () => {
    const op = { ...validOp(), enable: [{ start: 0, end: 999 }] }
    expect(validateMagnifierOps([op], width, height, 10)).toMatch(/out of range/i)
  })
})

// ---------------------------------------------------------------------------
// End-to-end: real ffmpeg, no ipcMain — startClipEncodeJob/addOverlayToJob/
// runClipEncodeJob directly. 4s 1080p30 source, a 0.5s hold, two overlay
// PNGs (one transparent, one with an opaque red box) and one magnifier op.
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

/**
 * Reads one RGB pixel at (x, y) at time `t` from `filePath`. Crops a 2x2
 * block rather than 1x1: yuv420p needs even width/height for chroma
 * subsampling, and cropping to an odd 1x1 size fails to configure the
 * filter ("Invalid too big or non positive size").
 */
async function samplePixel(bin: string, filePath: string, t: number, x: number, y: number): Promise<[number, number, number]> {
  const { stdout } = await run(bin, [
    '-ss', t.toFixed(6),
    '-i', filePath,
    '-vf', `crop=2:2:${x}:${y}`,
    '-frames:v', '1',
    '-f', 'rawvideo',
    '-pix_fmt', 'rgb24',
    '-',
  ])
  if (stdout.length < 3) throw new Error(`samplePixel got ${stdout.length} bytes, expected at least 3`)
  return [stdout[0], stdout[1], stdout[2]]
}

const ffmpegPath = resolveFfmpegForTest()
const describeIfFfmpeg = ffmpegPath ? describe : describe.skip

describeIfFfmpeg('clip encode job (end-to-end with real ffmpeg)', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'clip-export-e2e-'))
  const sourcePath = path.join(tmpDir, 'source.mp4')
  const outputPath = path.join(tmpDir, 'output.mp4')

  const WIDTH = 1920
  const HEIGHT = 1080
  const FPS = 30

  afterAll(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true })
  })

  it('generates fixtures, runs the job API directly, and produces a frame/pixel-accurate composite', async () => {
    const bin = ffmpegPath as string

    // 4s, 1080p30 test source with a sine-wave audio track.
    const genSource = spawnSync(bin, [
      '-y',
      '-f', 'lavfi', '-i', `testsrc=size=${WIDTH}x${HEIGHT}:rate=${FPS}:duration=4`,
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-shortest',
      sourcePath,
    ])
    expect(genSource.status).toBe(0)

    // Overlays are raw RGBA, as the renderer sends them. Overlay 0: fully
    // transparent. Overlay 1: transparent with an opaque red box at (50,50)-(149,149).
    const transparentRgba = Buffer.alloc(WIDTH * HEIGHT * 4)
    const redBoxRgba = Buffer.alloc(WIDTH * HEIGHT * 4)
    for (let y = 50; y < 150; y++) {
      for (let x = 50; x < 150; x++) {
        const i = (y * WIDTH + x) * 4
        redBoxRgba[i] = 255
        redBoxRgba[i + 3] = 255
      }
    }

    // Timeline: play [0,2) -> hold at 2 for 0.5s -> play [2,4). Total 4.5s @ 30fps = 135 frames.
    const segments: OutputSegment[] = [
      { kind: 'play', srcStart: 0, srcEnd: 2 },
      { kind: 'hold', srcTime: 2, duration: 0.5 },
      { kind: 'play', srcStart: 2, srcEnd: 4 },
    ]
    const frameCount = 135

    const options: ClipEncodeStartOptions = {
      outputPath,
      sourcePath,
      width: WIDTH,
      height: HEIGHT,
      fps: FPS,
      frameCount,
      quality: 'high',
      segments,
    }

    const started = await startClipEncodeJob(options, true)
    expect(started.ok).toBe(true)
    if (!started.ok) return
    const { jobId } = started

    const overlay0 = await addOverlayToJob(jobId, transparentRgba)
    expect(overlay0.ok).toBe(true)
    const overlay1 = await addOverlayToJob(jobId, redBoxRgba)
    expect(overlay1.ok).toBe(true)
    if (!overlay0.ok || !overlay1.ok) return

    // First 45 frames (1.5s) transparent; remaining 90 frames (3s) show the red box.
    const spans: OverlaySpan[] = [
      { overlayIndex: overlay0.index, frameStart: 0, frameCount: 45 },
      { overlayIndex: overlay1.index, frameStart: 45, frameCount: 90 },
    ]

    // One magnifier, enabled for the whole clip, cropping (200,200)-(300,300) onto a
    // circle centered at (1000,540) r=100 — a region whose content clearly differs
    // from the untouched source pixel at that same destination location.
    const magnifiers: MagnifierOp[] = [
      {
        sourceRect: { x: 200, y: 200, width: 100, height: 100 },
        destCircle: { centerX: 1000, centerY: 540, radius: 100 },
        enable: [{ start: 0, end: 4.5 }],
      },
    ]

    const progressUpdates: number[] = []
    const start = Date.now()
    const result = await runClipEncodeJob(jobId, { spans, magnifiers }, bin, (percent) => {
      progressUpdates.push(percent)
    })
    const elapsedSeconds = (Date.now() - start) / 1000

    expect(result.success).toBe(true)
    expect(progressUpdates.length).toBeGreaterThan(0)
    expect(progressUpdates[progressUpdates.length - 1]).toBe(100)

    const stat = await fsp.stat(outputPath)
    expect(stat.size).toBeGreaterThan(0)

    const probe = await probeVideo(outputPath, bin)
    expect(probe).not.toHaveProperty('error')
    if ('duration' in probe) {
      // 4.5s +/- 1 frame @ 30fps.
      expect(probe.duration).toBeGreaterThan(4.5 - 1 / FPS - 0.02)
      expect(probe.duration).toBeLessThan(4.5 + 1 / FPS + 0.02)
      expect(probe.hasAudio).toBe(true)
      expect(probe.width).toBe(WIDTH)
      expect(probe.height).toBe(HEIGHT)
    }

    console.log(
      `[clipExport e2e] encoded ${frameCount} frames of ${WIDTH}x${HEIGHT} in ${elapsedSeconds.toFixed(2)}s ` +
        `(${(frameCount / elapsedSeconds).toFixed(1)} fps)`
    )

    // Pixel check 1: the red-box overlay only appears within its span.
    // Box covers (50,50)-(150,150); sample its center (100,100).
    const beforeSpan = await samplePixel(bin, outputPath, 0.5, 100, 100)
    const afterSpan = await samplePixel(bin, outputPath, 3.0, 100, 100)
    expect(afterSpan[0]).toBeGreaterThan(200)
    expect(afterSpan[1]).toBeLessThan(60)
    expect(afterSpan[2]).toBeLessThan(60)
    // Before the span, the box has not been composited in: not the same solid red.
    expect(beforeSpan[0] > 200 && beforeSpan[1] < 60 && beforeSpan[2] < 60).toBe(false)

    // Pixel check 2: the magnifier's destination shows cropped content, not the
    // untouched source frame — sample during the first `play` segment, where
    // output time == source time, so the source video at the same instant is a
    // fair, directly comparable baseline.
    const magnifiedPixel = await samplePixel(bin, outputPath, 0.5, 1000, 540)
    const sourcePixelAtSameSpot = await samplePixel(bin, sourcePath, 0.5, 1000, 540)
    expect(magnifiedPixel).not.toEqual(sourcePixelAtSameSpot)
  }, 120_000)

  it('cancel kills ffmpeg mid-run and removes the partial output file', async () => {
    const bin = ffmpegPath as string
    const cancelOutputPath = path.join(tmpDir, 'cancelled.mp4')
    const options: ClipEncodeStartOptions = {
      outputPath: cancelOutputPath,
      sourcePath,
      width: WIDTH,
      height: HEIGHT,
      fps: FPS,
      frameCount: FPS * 4,
      quality: 'low',
      segments: [{ kind: 'play', srcStart: 0, srcEnd: 4 }],
    }
    const started = await startClipEncodeJob(options, true)
    expect(started.ok).toBe(true)
    if (!started.ok) return

    const runPromise = runClipEncodeJob(started.jobId, { spans: [], magnifiers: [] }, bin)
    // Give ffmpeg a moment to actually start writing before cancelling.
    await new Promise((resolve) => setTimeout(resolve, 150))
    await cancelClipEncodeJob(started.jobId)

    const result = await runPromise
    expect(result.success).toBe(false)

    await expect(fsp.stat(cancelOutputPath)).rejects.toThrow()
  }, 30_000)
})

describe('encodeRgbaPng', () => {
  it('produces a PNG that ffmpeg decodes back to the same pixels', () => {
    if (!ffmpegPath || !fs.existsSync(ffmpegPath)) return
    const w = 3
    const h = 2
    const rgba = Buffer.from([
      255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 0,
      10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120,
    ])
    const png = encodeRgbaPng(w, h, rgba)
    const decoded = spawnSync(ffmpegPath, ['-v', 'error', '-f', 'png_pipe', '-i', 'pipe:0', '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1'], { input: png })
    expect(decoded.status).toBe(0)
    expect(Buffer.from(decoded.stdout).equals(rgba)).toBe(true)
  })
})
