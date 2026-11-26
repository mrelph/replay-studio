import { describe, it, expect } from 'vitest'
import { buildOutputTimeline, framePresentations, frameSourceTimes, segmentFrameCounts, speedSegmentFrame } from './outputTimeline'
import type { OutputSegment } from '@/types/clip'
import { buildSpeedSteps, presentationOffset, speedAt } from './speedMap'
import { frameIndexAt } from '@/utils/frames'

describe('buildOutputTimeline', () => {
  it('produces a single play segment when there are no qualifying holds', () => {
    const result = buildOutputTimeline({ start: 2, end: 12 }, [], 30)
    expect(result.segments).toEqual([{ kind: 'play', srcStart: 2, srcEnd: 12 }])
    expect(result.duration).toBe(10)
    expect(result.frameCount).toBe(300)
  })

  it('ignores annotations without a positive freezeDuration', () => {
    const result = buildOutputTimeline(
      { start: 0, end: 10 },
      [{ startTime: 5, freezeDuration: 0 }, { startTime: 6 }],
      30
    )
    expect(result.segments).toEqual([{ kind: 'play', srcStart: 0, srcEnd: 10 }])
  })

  it('creates a hold at the very start of the clip (start <= startTime)', () => {
    const result = buildOutputTimeline(
      { start: 0, end: 10 },
      [{ startTime: 0, freezeDuration: 2 }],
      10
    )
    // No leading play segment (would be zero-length); hold first, then play to end.
    expect(result.segments).toEqual([
      { kind: 'hold', srcTime: 0, duration: 2 },
      { kind: 'play', srcStart: 0, srcEnd: 10 },
    ])
    expect(result.duration).toBe(12)
    expect(result.frameCount).toBe(120)
  })

  it('excludes a hold whose startTime is exactly at the clip end (startTime < end required)', () => {
    const result = buildOutputTimeline(
      { start: 0, end: 10 },
      [{ startTime: 10, freezeDuration: 3 }],
      10
    )
    expect(result.segments).toEqual([{ kind: 'play', srcStart: 0, srcEnd: 10 }])
    expect(result.duration).toBe(10)
  })

  it('excludes holds outside the clip range entirely', () => {
    const result = buildOutputTimeline(
      { start: 5, end: 10 },
      [{ startTime: 4.999, freezeDuration: 3 }, { startTime: 10.001, freezeDuration: 3 }],
      10
    )
    expect(result.segments).toEqual([{ kind: 'play', srcStart: 5, srcEnd: 10 }])
  })

  it('builds play/hold/play/hold/play for multiple distinct hold times, sorted', () => {
    const result = buildOutputTimeline(
      { start: 0, end: 10 },
      [
        { startTime: 7, freezeDuration: 1 },
        { startTime: 3, freezeDuration: 0.5 },
      ],
      10
    )
    expect(result.segments).toEqual([
      { kind: 'play', srcStart: 0, srcEnd: 3 },
      { kind: 'hold', srcTime: 3, duration: 0.5 },
      { kind: 'play', srcStart: 3, srcEnd: 7 },
      { kind: 'hold', srcTime: 7, duration: 1 },
      { kind: 'play', srcStart: 7, srcEnd: 10 },
    ])
    expect(result.duration).toBe(10 + 0.5 + 1)
  })

  it('merges multiple annotations at the same startTime into one hold using the max duration', () => {
    const result = buildOutputTimeline(
      { start: 0, end: 10 },
      [
        { startTime: 5, freezeDuration: 1 },
        { startTime: 5, freezeDuration: 3 },
        { startTime: 5, freezeDuration: 2 },
      ],
      10
    )
    expect(result.segments).toEqual([
      { kind: 'play', srcStart: 0, srcEnd: 5 },
      { kind: 'hold', srcTime: 5, duration: 3 },
      { kind: 'play', srcStart: 5, srcEnd: 10 },
    ])
  })

  it('rounds frameCount correctly for a fractional fps like 29.97', () => {
    const result = buildOutputTimeline({ start: 0, end: 10 }, [], 29.97)
    expect(result.duration).toBe(10)
    expect(result.frameCount).toBe(Math.round(10 * 29.97)) // 300
    expect(result.frameCount).toBe(300)
  })

  it('rounds frameCount for a duration that does not divide evenly by fps', () => {
    const result = buildOutputTimeline({ start: 0, end: 1.001 }, [], 29.97)
    expect(result.frameCount).toBe(Math.round(1.001 * 29.97))
  })
})

describe('segmentFrameCounts', () => {
  it('sums to the same total as buildOutputTimeline.frameCount', () => {
    const { segments, frameCount } = buildOutputTimeline(
      { start: 0, end: 10 },
      [{ startTime: 4, freezeDuration: 1.5 }],
      29.97
    )
    const counts = segmentFrameCounts(segments, 29.97)
    expect(counts.reduce((a, b) => a + b, 0)).toBe(frameCount)
  })

  it('gives a hold segment round(duration * fps) frames', () => {
    const segments: OutputSegment[] = [
      { kind: 'play', srcStart: 0, srcEnd: 4 },
      { kind: 'hold', srcTime: 4, duration: 1.5 },
    ]
    const counts = segmentFrameCounts(segments, 10)
    expect(counts).toEqual([40, 15])
  })
})

describe('frameSourceTimes', () => {
  it('has no holds: evenly spaced source times covering [srcStart, srcEnd)', () => {
    const segments: OutputSegment[] = [{ kind: 'play', srcStart: 0, srcEnd: 1 }]
    const times = frameSourceTimes(segments, 10)
    expect(times).toHaveLength(10)
    expect(times[0]).toBe(0)
    for (let i = 0; i < times.length; i++) {
      expect(times[i]).toBeCloseTo(i / 10, 10)
    }
    // Never reaches srcEnd itself (half-open interval).
    expect(times[times.length - 1]).toBeLessThan(1)
  })

  it('hold at the start: first frames all map to the hold time', () => {
    const segments: OutputSegment[] = [
      { kind: 'hold', srcTime: 0, duration: 1 },
      { kind: 'play', srcStart: 0, srcEnd: 1 },
    ]
    const times = frameSourceTimes(segments, 10)
    expect(times).toHaveLength(20)
    expect(times.slice(0, 10)).toEqual(new Array(10).fill(0))
    expect(times[10]).toBeCloseTo(0, 10)
    expect(times[19]).toBeCloseTo(0.9, 10)
  })

  it('hold in the middle produces a flat run of repeated source times', () => {
    const segments: OutputSegment[] = [
      { kind: 'play', srcStart: 0, srcEnd: 2 },
      { kind: 'hold', srcTime: 2, duration: 0.5 },
      { kind: 'play', srcStart: 2, srcEnd: 4 },
    ]
    const times = frameSourceTimes(segments, 10)
    // 20 play frames + 5 hold frames + 20 play frames = 45
    expect(times).toHaveLength(45)
    expect(times.slice(20, 25)).toEqual(new Array(5).fill(2))
    expect(times[19]).toBeCloseTo(1.9, 10)
    expect(times[25]).toBeCloseTo(2, 10)
  })

  it('multiple holds each produce their own flat run', () => {
    const segments: OutputSegment[] = [
      { kind: 'hold', srcTime: 1, duration: 1 },
      { kind: 'hold', srcTime: 3, duration: 2 },
    ]
    const times = frameSourceTimes(segments, 10)
    expect(times).toHaveLength(30)
    expect(times.slice(0, 10)).toEqual(new Array(10).fill(1))
    expect(times.slice(10, 30)).toEqual(new Array(20).fill(3))
  })

  it('total length matches frameCount for fractional fps', () => {
    const { segments, frameCount } = buildOutputTimeline(
      { start: 0, end: 5.5 },
      [{ startTime: 2, freezeDuration: 0.75 }],
      29.97
    )
    const times = frameSourceTimes(segments, 29.97)
    expect(times).toHaveLength(frameCount)
  })
})

describe('framePresentations', () => {
  it('framePresentations tracks hold progress', () => {
    const segs: OutputSegment[] = [{ kind: 'play', srcStart: 0, srcEnd: 1 }, { kind: 'hold', srcTime: 1, duration: 0.5 }, { kind: 'play', srcStart: 1, srcEnd: 2 }]
    const p = framePresentations(segs, 10)
    expect(p.map((x) => x.srcTime)).toEqual(frameSourceTimes(segs, 10))
    expect(p[10]).toEqual({ srcTime: 1, segmentIndex: 1, holdElapsed: 0 })
    expect(p[14].holdElapsed).toBeCloseTo(0.4)
    expect(p[15]).toEqual({ srcTime: 1, segmentIndex: 2, holdElapsed: 0 })
  })
})

describe('buildOutputTimeline with speed steps', () => {
  const fps = 30
  const steps = buildSpeedSteps([{ start: 2, end: 4, speed: 0.5 }], 10, fps)
  const plays = (segments: OutputSegment[]) => segments.filter((s) => s.kind === 'play')

  it('splits a clip across a region into constant-speed play segments', () => {
    const { segments, duration, frameCount } = buildOutputTimeline({ start: 1, end: 5 }, [], fps, steps)
    const speeds = plays(segments).map((s) => s.speed)
    const expected = [undefined, 0.9, 0.8, 0.7, 0.6, 0.5, 0.6, 0.7, 0.8, 0.9, undefined]
    expect(speeds).toHaveLength(expected.length)
    speeds.forEach((speed, i) => (expected[i] === undefined ? expect(speed).toBeUndefined() : expect(speed).toBeCloseTo(expected[i]!, 9)))
    expect(duration).toBeCloseTo(1 + presentationOffset(steps, 2, 4) + 1, 9)
    expect(frameCount).toBe(Math.round(duration * fps))
    expect(segmentFrameCounts(segments, fps).reduce((a, b) => a + b, 0)).toBe(frameCount)

    const times = frameSourceTimes(segments, fps)
    const slowIndex = segments.findIndex((s) => s.kind === 'play' && s.speed === 0.5)
    const first = segmentFrameCounts(segments, fps).slice(0, slowIndex).reduce((a, b) => a + b, 0)
    for (let i = first + 1; i < first + 40; i++) expect(times[i] - times[i - 1]).toBeCloseTo(0.5 / fps, 9)
  })

  it('starts and ends a clip inside the ramps', () => {
    const { segments, frameCount } = buildOutputTimeline({ start: 2.1, end: 3.9 }, [], fps, steps)
    const first = segments[0]
    expect(first).toMatchObject({ kind: 'play', srcStart: 2.1, speed: speedAt(steps, 2.1) })
    expect(segmentFrameCounts(segments, fps).reduce((a, b) => a + b, 0)).toBe(frameCount)
    const times = frameSourceTimes(segments, fps)
    expect(times).toHaveLength(frameCount)
    expect(times[times.length - 1]).toBeLessThan(3.9)
  })

  it('holds a freeze inside the region between two slowed play segments', () => {
    const { segments } = buildOutputTimeline({ start: 1, end: 5 }, [{ startTime: 3, freezeDuration: 1.5 }], fps, steps)
    const h = segments.findIndex((s) => s.kind === 'hold')
    expect(segments[h - 1]).toMatchObject({ kind: 'play', srcEnd: 3, speed: 0.5 })
    expect(segments[h]).toEqual({ kind: 'hold', srcTime: 3, duration: 1.5 })
    expect(segments[h + 1]).toMatchObject({ kind: 'play', srcStart: 3, speed: 0.5 })
    expect(segmentFrameCounts(segments, fps)[h]).toBe(45)
  })

  it('matches the no-speed result with no steps or a single speed-1 step', () => {
    const freezes = [{ startTime: 7, freezeDuration: 1 }, { startTime: 3, freezeDuration: 0.5 }]
    const today = buildOutputTimeline({ start: 0, end: 10 }, freezes, 10)
    expect(buildOutputTimeline({ start: 0, end: 10 }, freezes, 10, undefined)).toEqual(today)
    expect(buildOutputTimeline({ start: 0, end: 10 }, freezes, 10, [{ start: 0, end: 10, speed: 1 }])).toEqual(today)
  })
})

describe('frame counts shared with the main process', () => {
  // Twin of the segmentFrameCountsForBuilder case in electron/clipExport.test.ts; keep the two in step.
  it('counts a slowed segment between plays and a hold', () => {
    const segments: OutputSegment[] = [
      { kind: 'play', srcStart: 1, srcEnd: 2 },
      { kind: 'play', srcStart: 2, srcEnd: 3, speed: 0.5 },
      { kind: 'hold', srcTime: 3, duration: 1 },
      { kind: 'play', srcStart: 3, srcEnd: 4 },
    ]
    expect(segmentFrameCounts(segments, 30)).toEqual([30, 60, 30, 30])
  })

  it('agrees with the main process alignment for an in point off-frame inside a ramp', () => {
    const fps = 30
    const steps = buildSpeedSteps([{ start: 2, end: 4, speed: 0.5 }], 10, fps)
    const { segments } = buildOutputTimeline({ start: 2.1017, end: 4.5 }, [{ startTime: 3.0123, freezeDuration: 0.5 }], fps, steps)
    // The main process's rule: each edge moves to the frame start of floor(t * fps + 1e-3).
    const align = (t: number) => Math.floor(t * fps + 1e-3) / fps
    const aligned = segments.map((s) => (s.kind === 'play' ? { ...s, srcStart: align(s.srcStart), srcEnd: align(s.srcEnd) } : s))
    expect(segmentFrameCounts(segments, fps)).toEqual(segmentFrameCounts(aligned, fps))
  })
})

// Speed-ramp cases (30 fps source; region [2, 4] unless noted) as
// [first source frame, end source frame, speed]. Twin of SPEED_CASES in
// electron/clipExport.test.ts, where the real ffmpeg export of each one must
// decode to exactly `plannedSourceFrames`; keep the two in step.
type FrameSegment = [number, number, number]
const RAMP_05: FrameSegment[] = [[68, 112, 0.5], [112, 114, 0.6], [114, 116, 0.7], [116, 118, 0.8], [118, 120, 0.9]]
const SPEED_CASES: Record<string, { clip: [number, number]; region: [number, number, number]; frames: FrameSegment[] }> = {
  '0.25': { clip: [1, 5], region: [2, 4, 0.25], frames: [[30, 60, 1], [60, 62, 0.85], [62, 64, 0.7], [64, 66, 0.55], [66, 68, 0.4], [68, 112, 0.25], [112, 114, 0.4], [114, 116, 0.55], [116, 118, 0.7], [118, 120, 0.85], [120, 150, 1]] },
  '0.5': { clip: [1, 5], region: [2, 4, 0.5], frames: [[30, 60, 1], [60, 62, 0.9], [62, 64, 0.8], [64, 66, 0.7], [66, 68, 0.6], ...RAMP_05, [120, 150, 1]] },
  '0.75': { clip: [1, 5], region: [2, 4, 0.75], frames: [[30, 60, 1], [60, 62, 0.95], [62, 64, 0.9], [64, 66, 0.85], [66, 68, 0.8], [68, 112, 0.75], [112, 114, 0.8], [114, 116, 0.85], [116, 118, 0.9], [118, 120, 0.95], [120, 150, 1]] },
  '2': { clip: [1, 5], region: [2, 4, 2], frames: [[30, 60, 1], [60, 62, 1.2], [62, 64, 1.4], [64, 66, 1.6], [66, 68, 1.8], [68, 112, 2], [112, 114, 1.8], [114, 116, 1.6], [116, 118, 1.4], [118, 120, 1.2], [120, 150, 1]] },
  from0: { clip: [0, 5], region: [2, 4, 0.5], frames: [[0, 60, 1], [60, 62, 0.9], [62, 64, 0.8], [64, 66, 0.7], [66, 68, 0.6], ...RAMP_05, [120, 150, 1]] },
  cut: { clip: [2.1, 3.9], region: [2, 4, 0.5], frames: [[63, 64, 0.8], [64, 66, 0.7], [66, 68, 0.6], [68, 112, 0.5], [112, 114, 0.6], [114, 116, 0.7], [116, 117, 0.8]] },
  odd: { clip: [1, 5], region: [61 / 30, 4, 2], frames: [[30, 61, 1], [61, 63, 1.2], [63, 65, 1.4], [65, 67, 1.6], [67, 69, 1.8], [69, 112, 2], [112, 114, 1.8], [114, 116, 1.6], [116, 118, 1.4], [118, 120, 1.2], [120, 150, 1]] },
}

/** Twin of the helper in electron/clipExport.test.ts: the source frame each output frame shows. */
function plannedSourceFrames(frames: FrameSegment[], fps: number, sourceFps: number): number[] {
  const segments: OutputSegment[] = frames.map(([a, b, speed]) => (speed === 1 ? { kind: 'play', srcStart: a / sourceFps, srcEnd: b / sourceFps } : { kind: 'play', srcStart: a / sourceFps, srcEnd: b / sourceFps, speed }))
  const counts = segmentFrameCounts(segments, fps)
  const out: number[] = []
  segments.forEach((segment, i) => {
    if (segment.kind !== 'play') return
    const [a, b, speed] = frames[i]
    for (let f = 0; f < counts[i]; f++) {
      if (speed === 1) {
        const t = segment.srcStart + (segment.srcEnd - segment.srcStart) * (f / counts[i])
        out.push(Math.floor(t * sourceFps + 1e-3))
      } else {
        out.push(a + Math.floor((f * (b - a)) / counts[i] + 1e-6))
      }
    }
  })
  return out
}

describe('the source frame each output frame of a speed ramp shows', () => {
  const sourceFps = 30
  const planOf = (name: string, fps: number) => {
    const { clip, region, frames } = SPEED_CASES[name]
    const steps = buildSpeedSteps([{ start: region[0], end: region[1], speed: region[2] }], 10, sourceFps)
    const { segments, frameCount } = buildOutputTimeline({ start: clip[0], end: clip[1] }, [], fps, steps, sourceFps)
    return { segments, frameCount, frames }
  }

  it.each(Object.keys(SPEED_CASES))('builds the shared segments for case %s', (name) => {
    const { segments, frames } = planOf(name, 30)
    expect(segments.map((s) => (s.kind === 'play' ? [Math.round(s.srcStart * sourceFps), Math.round(s.srcEnd * sourceFps), s.speed ?? 1] : s))).toEqual(frames)
  })

  it.each([
    ['0.5', 30], ['0.5', 60], ['0.5', 15], ['2', 30], ['2', 15], ['0.25', 30], ['0.75', 30],
    ['from0', 30], ['cut', 30], ['cut', 15], ['odd', 15], ['0.25', 60], ['0.75', 15],
  ] as const)('plans case %s at %i fps by the shared rule', (name, fps) => {
    const { segments, frameCount, frames } = planOf(name, fps)
    const planned = frameSourceTimes(segments, fps, sourceFps).map((t) => frameIndexAt(t, sourceFps))
    expect(planned).toHaveLength(frameCount)
    expect(planned).toEqual(plannedSourceFrames(frames, fps, sourceFps))
  })

  it('pins the 0.5 case at 30 fps through both ramps, showing every source frame', () => {
    const { segments } = planOf('0.5', 30)
    const planned = frameSourceTimes(segments, 30, sourceFps).map((t) => frameIndexAt(t, sourceFps))
    expect(segmentFrameCounts(segments, 30)).toEqual([30, 2, 3, 3, 3, 88, 3, 3, 3, 2, 30])
    expect(planned.slice(28, 44)).toEqual([58, 59, 60, 61, 62, 62, 63, 64, 64, 65, 66, 66, 67, 68, 68, 69])
    expect(planned.slice(126, 142)).toEqual([110, 111, 111, 112, 112, 113, 114, 114, 115, 116, 116, 117, 118, 119, 120, 121])
    expect(new Set(planned).size).toBe(120)
  })

  it('spreads a segment\'s source frames evenly over its planned frames', () => {
    expect([0, 1].map((f) => speedSegmentFrame(f, 2, 60, 62))).toEqual([60, 61])
    expect([0, 1, 2].map((f) => speedSegmentFrame(f, 3, 62, 64))).toEqual([62, 62, 63])
    expect([0, 1, 2, 3].map((f) => speedSegmentFrame(f, 4, 10, 18))).toEqual([10, 12, 14, 16])
  })

  it('keeps play-frame times inside the chosen frame, so reveals still advance every output frame', () => {
    const { segments } = planOf('0.25', 30)
    const times = frameSourceTimes(segments, 30, sourceFps)
    const slow = segmentFrameCounts(segments, 30).slice(0, 5).reduce((a, b) => a + b, 0)
    for (let i = slow + 1; i < slow + 40; i++) expect(times[i]).toBeGreaterThan(times[i - 1])
  })
})

describe('a freeze inside a speed step', () => {
  const sourceFps = 30
  // Region over source frames 30-60 of a 3 s video; the constant part is [38, 52).
  const steps2 = buildSpeedSteps([{ start: 1, end: 2, speed: 2 }], 3, sourceFps)
  const steps05 = buildSpeedSteps([{ start: 1, end: 2, speed: 0.5 }], 3, sourceFps)
  const freeze = (frame: number, freezeDuration = 1) => ({ startTime: frame / sourceFps, freezeDuration })
  /** Source frames of the play frames (hold frames left out) inside [from, to). */
  const playFrames = (segments: OutputSegment[], fps: number, from: number, to: number) =>
    framePresentations(segments, fps, sourceFps)
      .filter((p) => segments[p.segmentIndex].kind === 'play')
      .map((p) => frameIndexAt(p.srcTime, sourceFps))
      .filter((k) => k >= from && k < to)
  const diffs = (xs: number[]) => xs.slice(1).map((x, i) => x - xs[i])
  type Row = [number, number, number] | ['hold', number, number]
  const fromRows = (rows: Row[]): OutputSegment[] =>
    rows.map((r) =>
      r[0] === 'hold'
        ? { kind: 'hold', srcTime: r[1], duration: r[2] }
        : r[2] === 1
          ? { kind: 'play', srcStart: r[0] / sourceFps, srcEnd: r[1] / sourceFps }
          : { kind: 'play', srcStart: r[0] / sourceFps, srcEnd: r[1] / sourceFps, speed: r[2] }
    )
  const RAMP_UP_2: Row[] = [[30, 32, 1.2], [32, 34, 1.4], [34, 36, 1.6], [36, 38, 1.8]]
  const RAMP_DOWN_2: Row[] = [[52, 54, 1.8], [54, 56, 1.6], [56, 58, 1.4], [58, 60, 1.2]]

  it('keeps a 2x step on one cadence across a freeze that leaves an odd number of frames before it', () => {
    const { segments } = buildOutputTimeline({ start: 0, end: 3 }, [freeze(41)], 30, steps2, sourceFps)
    // Before the fix: 38 39 | 41 43 45 47 49.
    expect(playFrames(segments, 30, 38, 52)).toEqual([38, 40, 42, 44, 46, 48, 50])
  })

  it('keeps every step of 2 with two freezes in one region', () => {
    const { segments } = buildOutputTimeline({ start: 0, end: 3 }, [freeze(41), freeze(47, 0.5)], 30, steps2, sourceFps)
    const frames = playFrames(segments, 30, 38, 52)
    expect(frames).toHaveLength(7)
    expect(diffs(frames)).toEqual(new Array(6).fill(2))
  })

  it('shows every source frame of a 0.5x step exactly twice on both sides of a freeze', () => {
    const { segments } = buildOutputTimeline({ start: 0, end: 3 }, [freeze(41)], 30, steps05, sourceFps)
    const frames = playFrames(segments, 30, 38, 52)
    const range = Array.from({ length: 14 }, (_, k) => 38 + k)
    expect(frames).toEqual(range.flatMap((k) => [k, k]))
  })

  it('gives both pieces of the split step the whole step\'s grid, and nothing else a grid', () => {
    const { segments } = buildOutputTimeline({ start: 0, end: 3 }, [freeze(41)], 30, steps2, sourceFps)
    const h = segments.findIndex((s) => s.kind === 'hold')
    expect(segments[h - 1]).toEqual({ kind: 'play', srcStart: 38 / 30, srcEnd: 41 / 30, speed: 2, grid: { sourceFrames: 14, frames: 7, phase: 0 } })
    expect(segments[h + 1]).toEqual({ kind: 'play', srcStart: 41 / 30, srcEnd: 52 / 30, speed: 2, grid: { sourceFrames: 14, frames: 7, phase: 7 } })
    segments.forEach((s, i) => {
      if (i !== h - 1 && i !== h + 1) expect(s).not.toHaveProperty('grid')
    })
  })

  it('picks a grid segment\'s frames by the grid', () => {
    const grid = { sourceFrames: 14, frames: 7, phase: 7 }
    expect([0, 1, 2, 3, 4].map((f) => speedSegmentFrame(f, 5, 41, 52, grid))).toEqual([42, 44, 46, 48, 50])
    expect([0, 1].map((f) => speedSegmentFrame(f, 2, 38, 41, { sourceFrames: 14, frames: 7, phase: 0 }))).toEqual([38, 40])
  })

  it('keeps the frame counts summing to round(duration * fps)', () => {
    for (const [steps, freezes, fps] of [
      [steps2, [freeze(41)], 30], [steps2, [freeze(41), freeze(47, 0.5)], 30], [steps05, [freeze(41)], 30], [steps2, [freeze(43, 0.3)], 15],
    ] as const) {
      const { segments, duration, frameCount } = buildOutputTimeline({ start: 0, end: 3 }, [...freezes], fps, steps, sourceFps)
      expect(frameCount).toBe(Math.round(duration * fps))
      expect(segmentFrameCounts(segments, fps).reduce((a, b) => a + b, 0)).toBe(frameCount)
      expect(frameSourceTimes(segments, fps, sourceFps)).toHaveLength(frameCount)
    }
  })

  // Snapshots of the output before grids existed: no freeze inside a speed step means no change.
  it('leaves a timeline with speed steps and no freeze exactly as before', () => {
    const result = buildOutputTimeline({ start: 0, end: 3 }, [], 30, steps2, sourceFps)
    expect(result).toEqual({ segments: fromRows([[0, 30, 1], ...RAMP_UP_2, [38, 52, 2], ...RAMP_DOWN_2, [60, 90, 1]]), duration: 2.5970899470899473, frameCount: 78 })
    expect(JSON.stringify(result)).not.toContain('grid')
    expect(frameSourceTimes(result.segments, 30, sourceFps).map((t) => frameIndexAt(t, sourceFps)).join(' ')).toBe(
      '0 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 34 36 38 40 42 44 46 48 50 52 53 54 56 58 59 ' +
        '60 61 62 63 64 65 66 67 68 69 70 71 72 73 74 75 76 77 78 79 80 81 82 83 84 85 86 87 88 89'
    )
  })

  it('leaves a freeze exactly on a step edge exactly as before', () => {
    const result = buildOutputTimeline({ start: 0, end: 3 }, [freeze(38)], 30, steps05, sourceFps)
    expect(result).toEqual({
      segments: fromRows([
        [0, 30, 1], [30, 32, 0.9], [32, 34, 0.8], [34, 36, 0.7], [36, 38, 0.6], ['hold', 38 / 30, 1],
        [38, 52, 0.5], [52, 54, 0.6], [54, 56, 0.7], [56, 58, 0.8], [58, 60, 0.9], [60, 90, 1],
      ]),
      duration: 4.6608465608465615,
      frameCount: 140,
    })
    expect(JSON.stringify(result)).not.toContain('grid')
  })

  it('leaves freezes outside the speed steps exactly as before', () => {
    const result = buildOutputTimeline({ start: 0.5, end: 2.5 }, [{ startTime: 0.7, freezeDuration: 0.5 }, { startTime: 2.2, freezeDuration: 0.25 }], 15, steps2, sourceFps)
    expect(result).toEqual({
      segments: fromRows([[15, 21, 1], ['hold', 0.7, 0.5], [21, 30, 1], ...RAMP_UP_2, [38, 52, 2], ...RAMP_DOWN_2, [60, 66, 1], ['hold', 2.2, 0.25], [66, 75, 1]]),
      duration: 2.3470899470899473,
      frameCount: 35,
    })
    expect(JSON.stringify(result)).not.toContain('grid')
    expect(frameSourceTimes(result.segments, 15, sourceFps).map((t) => frameIndexAt(t, sourceFps)).join(' ')).toBe(
      '15 17 19 21 21 21 21 21 21 21 21 21 23 25 27 30 32 36 38 42 47 52 56 58 60 62 64 66 66 66 66 66 68 70 72'
    )
  })
})
