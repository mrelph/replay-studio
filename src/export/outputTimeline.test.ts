import { describe, it, expect } from 'vitest'
import { buildOutputTimeline, framePresentations, frameSourceTimes, segmentFrameCounts } from './outputTimeline'
import type { OutputSegment } from '@/types/clip'
import { buildSpeedSteps, presentationOffset, speedAt } from './speedMap'

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
