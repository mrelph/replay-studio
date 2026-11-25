import { describe, expect, it } from 'vitest'
import {
  buildSpeedSteps,
  presentationOffset,
  sourceAtPresentation,
  speedAt,
  type SpeedStep,
} from './speedMap'

const region = (start: number, end: number, speed: number) => ({ id: 'a', start, end, speed })

function expectWellFormed(steps: SpeedStep[], duration: number, fps: number, minFrames = 2) {
  expect(steps[0].start).toBe(0)
  expect(steps[steps.length - 1].end).toBe(duration)
  for (let i = 0; i < steps.length; i++) {
    if (i > 0) expect(steps[i].start).toBe(steps[i - 1].end)
    expect(Math.abs(steps[i].start * fps - Math.round(steps[i].start * fps))).toBeLessThan(1e-6)
    if (i < steps.length - 1 || duration * fps === Math.round(duration * fps)) {
      expect((steps[i].end - steps[i].start) * fps).toBeGreaterThanOrEqual(minFrames - 1e-6)
    }
  }
}

describe('speed map', () => {
  const one = buildSpeedSteps([region(2, 4, 0.5)], 10, 30)

  it('ramps in whole-frame steps inside the region', () => {
    expect(one.map((s) => +s.speed.toFixed(3))).toEqual([1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.6, 0.7, 0.8, 0.9, 1])
    expect(one[0]).toEqual({ start: 0, end: 2, speed: 1 })
    expect(one[1].end - one[1].start).toBeCloseTo(2 / 30)
    expect(one[one.length - 1].end).toBe(10)
    for (let i = 1; i < one.length; i++) expect(one[i].start).toBe(one[i - 1].end)
    for (const s of one) expect(Math.abs(s.start * 30 - Math.round(s.start * 30))).toBeLessThan(1e-6)
  })

  it('is one step of speed 1 with no regions', () => {
    expect(buildSpeedSteps([], 10, 30)).toEqual([{ start: 0, end: 10, speed: 1 }])
  })

  it('converts between source and presentation time', () => {
    expect(presentationOffset(one, 0, 2)).toBeCloseTo(2)
    expect(presentationOffset(one, 2.5, 3.5)).toBeCloseTo(2)
    expect(presentationOffset(one, 3.5, 2.5)).toBeCloseTo(-2)
    expect(presentationOffset(one, 2, 4)).toBeCloseTo(
      2 * (2 / 30) * (1 / 0.9 + 1 / 0.8 + 1 / 0.7 + 1 / 0.6) + (2 - 16 / 30) / 0.5,
    )
    expect(sourceAtPresentation(one, 2.5, 2)).toBeCloseTo(3.5)
    expect(sourceAtPresentation(one, 0, presentationOffset(one, 0, 7.3))).toBeCloseTo(7.3)
    expect(sourceAtPresentation(one, 9, 100)).toBe(10)
  })

  it('looks up the speed at a source time', () => {
    expect(speedAt(one, 3)).toBe(0.5)
    expect(speedAt(one, 1)).toBe(1)
    expect(speedAt(one, 99)).toBe(1)
  })

  it('uses fewer, longer steps per frame count at 60 fps', () => {
    const steps = buildSpeedSteps([region(2, 4, 0.25)], 10, 60)
    expect(steps.length).toBe(13)
    expectWellFormed(steps, 10, 60)
  })

  it('gives a short region half its length to each ramp', () => {
    const steps = buildSpeedSteps([region(0, 0.2, 0.5)], 10, 30)
    expect(steps).toEqual([
      { start: 0, end: 0.2, speed: 0.75 },
      { start: 0.2, end: 10, speed: 1 },
    ])
    expectWellFormed(steps, 10, 30)
  })

  it('handles the smallest region (4 frames)', () => {
    const steps = buildSpeedSteps([region(1, 1 + 4 / 30, 0.5)], 10, 30)
    expect(steps.map((s) => s.speed)).toEqual([1, 0.75, 1])
    expectWellFormed(steps, 10, 30)
  })

  it('handles a region ending at the duration', () => {
    const steps = buildSpeedSteps([region(8, 10, 0.5)], 10, 30)
    expect(steps[steps.length - 1].speed).toBe(0.9)
    expectWellFormed(steps, 10, 30)
  })

  it('uses a single step for a region with fewer than 2 ramp frames', () => {
    const steps = buildSpeedSteps([region(1, 1.1, 0.5)], 10, 10)
    expect(steps.map((s) => s.speed)).toEqual([1, 0.5, 1])
  })

  it('puts extra ramp frames on the steps nearest the middle', () => {
    // 50 fps: 13 ramp frames over 5 steps
    const steps = buildSpeedSteps([region(2, 4, 0.5)], 10, 50)
    const frames = steps.slice(1, 6).map((s) => Math.round((s.end - s.start) * 50))
    expect(frames).toEqual([2, 2, 3, 3, 3])
    expectWellFormed(steps, 10, 50)
  })

  it('ramps directly between touching regions without returning to 1', () => {
    const steps = buildSpeedSteps([region(2, 4, 0.5), region(4, 6, 0.25)], 10, 30)
    const speeds = steps.map((s) => s.speed)
    const from = speeds.indexOf(0.5)
    const to = speeds.indexOf(0.25)
    expect(from).toBeGreaterThan(0)
    expect(to).toBeGreaterThan(from)
    for (let i = from; i < to; i++) expect(speeds[i + 1]).toBeLessThan(speeds[i])
    for (let i = from; i <= to; i++) {
      expect(speeds[i]).toBeLessThanOrEqual(0.5)
      expect(speeds[i]).toBeGreaterThanOrEqual(0.25)
    }
    expectWellFormed(steps, 10, 30)
  })

  it('ramps up between touching regions of rising speed monotonically', () => {
    const steps = buildSpeedSteps([region(2, 4, 0.5), region(4, 6, 2)], 10, 30)
    const speeds = steps.map((s) => s.speed)
    const from = speeds.indexOf(0.5)
    const to = speeds.indexOf(2)
    for (let i = from; i < to; i++) expect(speeds[i + 1]).toBeGreaterThan(speeds[i])
    expectWellFormed(steps, 10, 30)
  })

  it('keeps separate regions independent', () => {
    const steps = buildSpeedSteps([region(1, 2, 0.5), region(5, 6, 2)], 10, 30)
    expect(steps.filter((s) => s.speed === 1).length).toBe(3)
    expectWellFormed(steps, 10, 30)
  })
})
