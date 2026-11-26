import { describe, it, expect, afterAll } from 'vitest'
import { spawnSync } from 'child_process'
import fs from 'fs'
import fsp from 'fs/promises'
import os from 'os'
import path from 'path'
import { duckVolumeExpr, validateVoiceMix, voiceFilterParts, MAX_VOICE_BYTES } from './voiceMix'
import { buildClipEncodeFilterGraph, runClipEncodeJob, startClipEncodeJob, validateClipEncodeOptions } from './clipExport'
import { getFfmpegBinaryPath } from './ffmpegExport'
import type { ClipEncodeStartOptions, OutputSegment, VoiceMix } from '../src/types/clip'

/** Evaluates the subset of ffmpeg's expression language duckVolumeExpr uses (numbers, t, + - * /, min, clip). */
function evalExpr(expr: string, t: number): number {
  const tokens = expr.match(/\d+(\.\d+)?|[a-z]+|[-+*/(),]/g) ?? []
  let pos = 0
  const peek = () => tokens[pos]
  const take = (expected?: string) => {
    const token = tokens[pos++]
    if (expected !== undefined && token !== expected) throw new Error(`expected ${expected}, got ${token}`)
    return token
  }
  const sum = (): number => {
    let value = product()
    while (peek() === '+' || peek() === '-') value = take() === '+' ? value + product() : value - product()
    return value
  }
  const product = (): number => {
    let value = factor()
    while (peek() === '*' || peek() === '/') value = take() === '*' ? value * factor() : value / factor()
    return value
  }
  const factor = (): number => {
    const token = take()
    if (token === '-') return -factor()
    if (token === '(') {
      const value = sum()
      take(')')
      return value
    }
    if (token === 't') return t
    if (token === 'min' || token === 'clip') {
      take('(')
      const args = [sum()]
      while (peek() === ',') {
        take(',')
        args.push(sum())
      }
      take(')')
      return token === 'min' ? Math.min(...args) : Math.min(Math.max(args[0], args[1]), args[2])
    }
    return Number(token)
  }
  const value = sum()
  if (pos !== tokens.length) throw new Error(`trailing tokens in ${expr}`)
  return value
}

describe('duckVolumeExpr', () => {
  const expr = duckVolumeExpr([{ start: 2, end: 3 }, { start: 5, end: 6 }], 0.25)

  it('is 1 outside the windows and the duck gain in their middle', () => {
    expect(evalExpr(expr, 1)).toBeCloseTo(1, 9)
    expect(evalExpr(expr, 4)).toBeCloseTo(1, 9)
    expect(evalExpr(expr, 7)).toBeCloseTo(1, 9)
    expect(evalExpr(expr, 2.5)).toBeCloseTo(0.25, 9)
    expect(evalExpr(expr, 5.5)).toBeCloseTo(0.25, 9)
  })

  it('ramps linearly over 0.15 s inside each edge', () => {
    expect(evalExpr(expr, 2.075)).toBeCloseTo(0.625, 9)
    expect(evalExpr(expr, 2.925)).toBeCloseTo(0.625, 9)
    expect(evalExpr(expr, 2.15)).toBeCloseTo(0.25, 9)
    expect(evalExpr(expr, 2)).toBeCloseTo(1, 9)
  })

  it('is constant 1 with no windows', () => {
    expect(duckVolumeExpr([], 0.25)).toBe('1')
  })
})

describe('voiceFilterParts', () => {
  it('ducks the base, delays each track in ms and mixes without normalizing', () => {
    const parts = voiceFilterParts('abase', 'aout', {
      tracks: [{ inputIndex: 2, outStart: 2, duration: 1 }, { inputIndex: 3, outStart: 4.5, duration: 0.8 }],
      duckWindows: [{ start: 2, end: 3 }],
      duckGain: 0.25,
      totalDuration: 6,
    })
    expect(parts[0]).toMatch(/^\[abase\]volume=volume='1-0\.75\*min\(1\\,.*':eval=frame\[abase_duck\]$/)
    expect(parts[1]).toBe('[2:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=PTS-STARTPTS,atrim=duration=1,adelay=delays=2000:all=1[voice0]')
    expect(parts[2]).toContain('[3:a]')
    expect(parts[2]).toContain('adelay=delays=4500:all=1')
    expect(parts[3]).toBe('[abase_duck][voice0][voice1]amix=inputs=3:normalize=0:duration=first[aout]')
  })

  it('leaves the base alone with no duck windows', () => {
    const parts = voiceFilterParts('abase', 'aout', {
      tracks: [{ inputIndex: 1, outStart: 0, duration: 1 }], duckWindows: [], duckGain: 0.25, totalDuration: 6,
    })
    expect(parts).toHaveLength(2)
    expect(parts[1]).toBe('[abase][voice0]amix=inputs=2:normalize=0:duration=first[aout]')
  })
})

describe('validateVoiceMix', () => {
  const track = (data: Uint8Array = new Uint8Array([1]), outStart = 0, duration = 1) => ({ data, outStart, duration })
  const mix = (over: Partial<Record<string, unknown>> = {}) => ({ tracks: [track()], duckWindows: [], duckGain: 0.25, ...over })

  it('accepts Uint8Array and Buffer data', () => {
    expect(validateVoiceMix(mix())).toBeNull()
    expect(validateVoiceMix(mix({ tracks: [track(Buffer.from([1, 2]))] }))).toBeNull()
  })

  it('refuses bad shapes and numbers', () => {
    expect(validateVoiceMix(null)).not.toBeNull()
    expect(validateVoiceMix(mix({ tracks: [] }))).not.toBeNull()
    expect(validateVoiceMix(mix({ tracks: [{ data: [1], outStart: 0, duration: 1 }] }))).not.toBeNull()
    expect(validateVoiceMix(mix({ tracks: [track(undefined, -1)] }))).not.toBeNull()
    expect(validateVoiceMix(mix({ tracks: [track(undefined, 0, Number.NaN)] }))).not.toBeNull()
    expect(validateVoiceMix(mix({ tracks: [track(undefined, 0, 0)] }))).not.toBeNull()
    expect(validateVoiceMix(mix({ duckWindows: [{ start: 3, end: 2 }] }))).not.toBeNull()
    expect(validateVoiceMix(mix({ duckGain: 1.5 }))).not.toBeNull()
    expect(validateVoiceMix(mix({ duckGain: Number.POSITIVE_INFINITY }))).not.toBeNull()
  })

  it('allows 40 tracks and refuses 41', () => {
    expect(validateVoiceMix(mix({ tracks: Array.from({ length: 40 }, () => track()) }))).toBeNull()
    expect(validateVoiceMix(mix({ tracks: Array.from({ length: 41 }, () => track()) }))).toMatch(/max 40/)
  })

  it('refuses more than 64 MB of audio in total', () => {
    const half = new Uint8Array(MAX_VOICE_BYTES / 2)
    expect(validateVoiceMix(mix({ tracks: [track(half), track(half)] }))).toBeNull()
    expect(validateVoiceMix(mix({ tracks: [track(half), track(half), track()] }))).toMatch(/64 MB/)
  })

  it('is applied by validateClipEncodeOptions, and voice is refused for GIF', () => {
    const options: ClipEncodeStartOptions = {
      outputPath: '/o.mp4', sourcePath: '/s.mp4', width: 64, height: 36, fps: 30, frameCount: 30, quality: 'high',
      segments: [{ kind: 'play', srcStart: 0, srcEnd: 1 }],
    }
    expect(validateClipEncodeOptions({ ...options, voice: mix() as VoiceMix })).toBeNull()
    expect(validateClipEncodeOptions({ ...options, voice: mix({ duckGain: -1 }) as VoiceMix })).not.toBeNull()
    expect(validateClipEncodeOptions({ ...options, format: 'gif', fps: 15, frameCount: 15, voice: mix() as VoiceMix })).not.toBeNull()
  })
})

describe('buildClipEncodeFilterGraph with voice', () => {
  const base = {
    outputPath: '/exports/clip.mp4',
    sourcePath: '/videos/game.mp4',
    fps: 30,
    frameCount: 120,
    quality: 'high' as const,
    segments: [{ kind: 'play', srcStart: 0, srcEnd: 4 }] as OutputSegment[],
    magnifiers: [],
  }
  const voice = {
    paths: ['/tmp/job/voice-0.webm', '/tmp/job/voice-1.webm'],
    tracks: [{ outStart: 1, duration: 1 }, { outStart: 2.25, duration: 0.5 }],
    duckWindows: [{ start: 1, end: 2 }],
    duckGain: 0.25,
  }
  const filterOf = (args: string[]) => args[args.indexOf('-filter_complex') + 1]

  it('adds one -i per track after the overlay input and mixes them into [aout]', () => {
    const args = buildClipEncodeFilterGraph({ ...base, hasAudio: true, overlayConcatListPath: '/tmp/job/list.txt', voice })
    const inputs = args.flatMap((arg, i) => (arg === '-i' ? [args[i + 1]] : []))
    expect(inputs).toEqual(['/videos/game.mp4', '/tmp/job/list.txt', ...voice.paths])
    const filter = filterOf(args)
    expect(filter).toContain('concat=n=1:v=0:a=1[abase]')
    expect(filter).toContain('[2:a]aresample=48000')
    expect(filter).toContain('[3:a]aresample=48000')
    expect(filter).toContain('adelay=delays=1000:all=1')
    expect(filter).toContain('adelay=delays=2250:all=1')
    expect(filter).toContain('amix=inputs=3:normalize=0:duration=first[aout]')
    expect(args.slice(args.indexOf('-map'), args.indexOf('-map') + 4)).toEqual(['-map', '[vout]', '-map', '[aout]'])
  })

  it('numbers voice inputs from 1 without an overlay', () => {
    const filter = filterOf(buildClipEncodeFilterGraph({ ...base, hasAudio: true, voice }))
    expect(filter).toContain('[1:a]aresample')
    expect(filter).toContain('[2:a]aresample')
  })

  it('gives a source with no audio silent segments under the voice', () => {
    const args = buildClipEncodeFilterGraph({ ...base, hasAudio: false, voice })
    const filter = filterOf(args)
    expect(filter).not.toContain('[0:a]')
    expect(filter).toContain('anullsrc=channel_layout=stereo:sample_rate=48000,atrim=duration=')
    expect(args).toContain('[aout]')
    expect(args).toContain('aac')
  })

  it('forceAudio alone gives a silent track; GIF never has audio', () => {
    const forced = buildClipEncodeFilterGraph({ ...base, hasAudio: false, forceAudio: true })
    expect(filterOf(forced)).toContain('anullsrc')
    expect(filterOf(forced)).toContain('concat=n=1:v=0:a=1[aout]')
    expect(forced).toContain('[aout]')
    const gif = buildClipEncodeFilterGraph({ ...base, fps: 15, frameCount: 60, format: 'gif', hasAudio: true, forceAudio: true })
    expect(gif).not.toContain('[aout]')
  })

  it('is unchanged with neither voice nor forceAudio', () => {
    const plain = buildClipEncodeFilterGraph({ ...base, hasAudio: true })
    expect(buildClipEncodeFilterGraph({ ...base, hasAudio: true, forceAudio: false })).toEqual(plain)
    expect(buildClipEncodeFilterGraph({ ...base, hasAudio: true, voice: undefined })).toEqual(plain)
  })
})

// ---------------------------------------------------------------------------
// End-to-end with real ffmpeg (skipped when the binary is missing).
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

const ffmpegPath = resolveFfmpegForTest()
const describeIfFfmpeg = ffmpegPath ? describe : describe.skip
const RATE = 48000

/** Amplitude of `freq` in samples [from, from + n) (Goertzel). */
function toneAmplitude(samples: Float64Array, from: number, n: number, freq: number): number {
  const coeff = 2 * Math.cos((2 * Math.PI * freq) / RATE)
  let s1 = 0
  let s2 = 0
  for (let i = from; i < from + n; i++) {
    const s0 = samples[i] + coeff * s1 - s2
    s2 = s1
    s1 = s0
  }
  return (2 * Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - coeff * s1 * s2))) / n
}

describeIfFfmpeg('voice mixed by real ffmpeg', () => {
  const bin = ffmpegPath as string
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'voice-mix-e2e-'))
  const W = 160
  const H = 90
  const FPS = 30
  const WINDOW = 0.25
  const HOP = 0.05

  afterAll(async () => {
    await fsp.rm(tmpDir, { recursive: true, force: true })
  })

  const generate = (args: string[]) => {
    const result = spawnSync(bin, ['-y', '-v', 'error', ...args])
    expect(result.status, result.stderr?.toString()).toBe(0)
  }
  const toneSource = path.join(tmpDir, 'tone.mp4')
  const silentSource = path.join(tmpDir, 'silent.mp4')
  const voiceFile = path.join(tmpDir, 'voice.webm')
  const ready = () => {
    if (fs.existsSync(voiceFile)) return
    generate([
      '-f', 'lavfi', '-i', `color=gray:size=${W}x${H}:rate=${FPS}:duration=6`,
      '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', toneSource,
    ])
    generate(['-f', 'lavfi', '-i', `color=gray:size=${W}x${H}:rate=${FPS}:duration=6`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', silentSource])
    generate(['-f', 'lavfi', '-i', 'sine=frequency=1000:duration=1', '-c:a', 'libopus', voiceFile])
  }

  async function encode(name: string, sourcePath: string, segments: OutputSegment[], voice: VoiceMix, frameCount: number) {
    const output = path.join(tmpDir, `${name}.mp4`)
    const started = await startClipEncodeJob(
      { outputPath: output, sourcePath, width: W, height: H, fps: FPS, frameCount, quality: 'low', segments, voice },
      sourcePath === toneSource,
      FPS
    )
    expect(started.ok).toBe(true)
    if (!started.ok) throw new Error(started.error)
    const result = await runClipEncodeJob(started.jobId, { spans: [], magnifiers: [] }, bin)
    expect(result, result.error).toEqual({ success: true })
    const audio = spawnSync(bin, ['-v', 'error', '-i', output, '-map', '0:a', '-f', 's16le', '-ac', '1', '-ar', String(RATE), '-'], { maxBuffer: 1 << 26 })
    expect(audio.status).toBe(0)
    const pcm = new Float64Array(audio.stdout.length / 2)
    for (let i = 0; i < pcm.length; i++) pcm[i] = audio.stdout.readInt16LE(i * 2) / 32768
    const video = spawnSync(bin, ['-v', 'error', '-i', output, '-map', '0:v', '-vf', 'scale=2:2', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'], { maxBuffer: 1 << 26 })
    expect(video.status).toBe(0)
    expect(video.stdout.length / 4).toBe(frameCount)
    expect(Math.abs(pcm.length / RATE - frameCount / FPS)).toBeLessThanOrEqual(1 / FPS)
    return pcm
  }

  /** Amplitude of `freq` in every 0.25 s window, stepping 0.05 s: [start time, amplitude]. */
  function scan(pcm: Float64Array, freq: number): [number, number][] {
    const n = Math.round(WINDOW * RATE)
    const out: [number, number][] = []
    for (let start = 0; start + n <= pcm.length; start += Math.round(HOP * RATE)) out.push([start / RATE, toneAmplitude(pcm, start, n, freq)])
    return out
  }

  /** 1000 Hz is clearly present in every window inside [from, to] and absent from every window clear of it (±0.1 s). */
  function expectVoiceOnlyIn(pcm: Float64Array, from: number, to: number) {
    const windows = scan(pcm, 1000)
    const inside = windows.filter(([t]) => t >= from + 0.1 - 1e-9 && t + WINDOW <= to - 0.1 + 1e-9)
    const outside = windows.filter(([t]) => t + WINDOW <= from - 0.1 + 1e-9 || t >= to + 0.1 - 1e-9)
    expect(inside.length).toBeGreaterThan(0)
    expect(outside.length).toBeGreaterThan(0)
    const peak = Math.max(...inside.map(([, a]) => a))
    expect(peak).toBeGreaterThan(0.02)
    for (const [t, a] of inside) expect(a, `1000 Hz at ${t.toFixed(2)} s`).toBeGreaterThan(peak * 0.5)
    for (const [t, a] of outside) expect(a, `1000 Hz at ${t.toFixed(2)} s`).toBeLessThan(peak * 0.05)
  }

  const voiceMix = (outStart: number, duck: boolean): VoiceMix => ({
    tracks: [{ data: fs.readFileSync(voiceFile), outStart, duration: 1 }],
    duckWindows: duck ? [{ start: outStart, end: outStart + 1 }] : [],
    duckGain: 0.25,
  })

  it('(a) mixes a playing voice at output 2 s and ducks the source under it', async () => {
    ready()
    const pcm = await encode('playing', toneSource, [{ kind: 'play', srcStart: 0, srcEnd: 6 }], voiceMix(2, true), 6 * FPS)
    expectVoiceOnlyIn(pcm, 2, 3)
    const tone = scan(pcm, 440)
    const mean = (rows: [number, number][]) => rows.reduce((sum, [, a]) => sum + a, 0) / rows.length
    const outside = mean(tone.filter(([t]) => t >= 0.25 && t + WINDOW <= 1.75))
    const ducked = mean(tone.filter(([t]) => t >= 2.15 && t + WINDOW <= 2.85))
    expect(outside).toBeGreaterThan(0.02)
    expect(ducked / outside).toBeGreaterThan(0.25 * 0.7)
    expect(ducked / outside).toBeLessThan(0.25 * 1.3)
  }, 60_000)

  it('(b) plays a frozen voice over its 2 s hold, over silence', async () => {
    ready()
    const segments: OutputSegment[] = [
      { kind: 'play', srcStart: 0, srcEnd: 2 },
      { kind: 'hold', srcTime: 2, duration: 2 },
      { kind: 'play', srcStart: 2, srcEnd: 4 },
    ]
    const pcm = await encode('frozen', toneSource, segments, voiceMix(2, false), 6 * FPS)
    expectVoiceOnlyIn(pcm, 2, 3)
    for (const [t, a] of scan(pcm, 440)) {
      if (t >= 2.1 && t + WINDOW <= 3.9) expect(a, `440 Hz during the hold at ${t.toFixed(2)} s`).toBeLessThan(0.005)
    }
  }, 60_000)

  it('(c) gives a source with no audio an audio stream carrying the voice', async () => {
    ready()
    const pcm = await encode('voice-over-silence', silentSource, [{ kind: 'play', srcStart: 0, srcEnd: 6 }], voiceMix(1, true), 6 * FPS)
    expectVoiceOnlyIn(pcm, 1, 2)
  }, 60_000)
})
