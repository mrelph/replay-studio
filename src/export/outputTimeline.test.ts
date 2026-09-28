import { describe, it, expect } from 'vitest'
import { buildOutputTimeline, frameSourceTimes, segmentFrameCounts } from './outputTimeline'
import type { OutputSegment } from '@/types/clip'

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
