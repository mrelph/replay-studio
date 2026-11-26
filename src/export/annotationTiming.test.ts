import { describe, it, expect } from 'vitest'
import { annotationStateAt, isRevealDue, revealElapsed, revealFraction } from './annotationTiming'
import { buildSpeedSteps, presentationOffset } from './speedMap'

describe('revealFraction', () => {
  it('is 1 with no drawIn', () => {
    expect(revealFraction(0, undefined)).toBe(1)
    expect(revealFraction(0, 0)).toBe(1)
    expect(revealFraction(0, -1)).toBe(1)
    expect(revealFraction(0, NaN)).toBe(1)
  })
  it('runs 0 → 1 with ease-out', () => {
    expect(revealFraction(0, 0.4)).toBe(0)
    expect(revealFraction(0.2, 0.4)).toBeCloseTo(0.875)
    expect(revealFraction(0.4, 0.4)).toBe(1)
    expect(revealFraction(9, 0.4)).toBe(1)
  })
})

describe('revealElapsed', () => {
  it('adds hold time to source time', () => {
    expect(revealElapsed(5, 5, 0.3)).toBeCloseTo(0.3)
    expect(revealElapsed(5, 5.1, 0.3)).toBeCloseTo(0.4)
    expect(revealElapsed(5, 4, 0)).toBe(0)
  })

  it('subtracts the reveal delay and floors at zero', () => {
    expect(revealElapsed(3, 3, 0.5, 0.35)).toBeCloseTo(0.15)
    expect(revealElapsed(3, 3, 0.2, 0.35)).toBe(0)
    expect(revealElapsed(3, 3.4, 0, undefined)).toBeCloseTo(0.4)
  })
})

describe('isRevealDue', () => {
  it('is always due without a positive delay', () => {
    expect(isRevealDue(3, 3, 0, undefined)).toBe(true)
    expect(isRevealDue(3, 3, 0, 0)).toBe(true)
    expect(isRevealDue(3, 3, 0, -1)).toBe(true)
    expect(isRevealDue(3, 3, 0, Number.NaN)).toBe(true)
  })

  it('becomes due once hold time reaches the delay', () => {
    expect(isRevealDue(3, 3, 0.34, 0.35)).toBe(false)
    expect(isRevealDue(3, 3, 0.35, 0.35)).toBe(true)
  })

  it('becomes due from source time alone when there is no hold', () => {
    expect(isRevealDue(3, 3.4, 0, 0.35)).toBe(true)
  })
})

it('drops the fade-in floor when drawIn is set', () => {
  expect(annotationStateAt({ startTime: 5, endTime: 10, fadeIn: 0.2, drawIn: 0.4 }, 5).opacity).toBe(1)
  expect(annotationStateAt({ startTime: 5, endTime: 10, fadeIn: 0.2 }, 5).opacity).toBe(0.5)
})

describe('annotationStateAt', () => {
  it('is hidden before startTime', () => {
    expect(annotationStateAt({ startTime: 5, endTime: 10 }, 4.999)).toEqual({ visible: false, opacity: 0 })
  })

  it('is hidden after endTime', () => {
    expect(annotationStateAt({ startTime: 5, endTime: 10 }, 10.001)).toEqual({ visible: false, opacity: 0 })
  })

  it('is visible at exactly startTime and endTime (inclusive range)', () => {
    expect(annotationStateAt({ startTime: 5, endTime: 10 }, 5).visible).toBe(true)
    expect(annotationStateAt({ startTime: 5, endTime: 10 }, 10).visible).toBe(true)
  })

  it('is fully opaque with no fade windows configured', () => {
    expect(annotationStateAt({ startTime: 0, endTime: 5 }, 2.5)).toEqual({ visible: true, opacity: 1 })
  })

  it('ramps opacity up during fade-in, floored at 0.5', () => {
    // fadeIn = 1s; at t=0 (start of fade), ratio 0 -> floored to 0.5
    expect(annotationStateAt({ startTime: 0, endTime: 10, fadeIn: 1 }, 0).opacity).toBe(0.5)
    // Halfway through fade-in: ratio 0.5, above floor
    expect(annotationStateAt({ startTime: 0, endTime: 10, fadeIn: 1 }, 0.5).opacity).toBeCloseTo(0.5, 5)
    // 90% through fade-in: ratio 0.9, above floor
    expect(annotationStateAt({ startTime: 0, endTime: 10, fadeIn: 1 }, 0.9).opacity).toBeCloseTo(0.9, 5)
    // At/after fade-in window: full opacity
    expect(annotationStateAt({ startTime: 0, endTime: 10, fadeIn: 1 }, 1).opacity).toBe(1)
  })

  it('ramps opacity down during fade-out, floored at 0.2', () => {
    // fadeOut = 1s, endTime = 10; at t=10 (timeToEnd=0), floored to 0.2
    expect(annotationStateAt({ startTime: 0, endTime: 10, fadeOut: 1 }, 10).opacity).toBe(0.2)
    // Halfway through fade-out window (t=9.5, timeToEnd=0.5): ratio 0.5
    expect(annotationStateAt({ startTime: 0, endTime: 10, fadeOut: 1 }, 9.5).opacity).toBeCloseTo(0.5, 5)
    // Just before the fade-out window starts: full opacity
    expect(annotationStateAt({ startTime: 0, endTime: 10, fadeOut: 1 }, 8.999).opacity).toBe(1)
  })

  it('prefers fade-in over fade-out when both windows would overlap', () => {
    // A very short annotation where fadeIn and fadeOut windows overlap the
    // whole range; fade-in wins per the original `else if`.
    const state = annotationStateAt({ startTime: 0, endTime: 1, fadeIn: 2, fadeOut: 2 }, 0.5)
    // timeInRange = 0.5 < fadeIn(2) -> fade-in branch: max(0.5, 0.5/2) = max(0.5, 0.25) = 0.5
    expect(state.opacity).toBe(0.5)
  })

  it('handles zero-length fade windows as "no fade"', () => {
    expect(annotationStateAt({ startTime: 0, endTime: 10, fadeIn: 0, fadeOut: 0 }, 0).opacity).toBe(1)
  })
})

describe('timing inside a slow-motion region', () => {
  const steps = buildSpeedSteps([{ start: 2, end: 4, speed: 0.5 }], 10, 30)
  const el = (a: number, b: number) => presentationOffset(steps, a, b)

  it('runs fades and reveals on presentation time', () => {
    // a 0.3 s fade-in starting at 3.0 (inside the 0.5 region) is over after 0.15 s of source time
    expect(annotationStateAt({ startTime: 3, endTime: 3.9, fadeIn: 0.3 }, 3.1, el).opacity).toBeCloseTo(Math.max(0.5, 0.2 / 0.3))
    expect(annotationStateAt({ startTime: 3, endTime: 3.9, fadeIn: 0.3 }, 3.16, el).opacity).toBe(1)
    expect(annotationStateAt({ startTime: 3, endTime: 3.9, fadeIn: 0.3 }, 3.16).opacity).toBeLessThan(1)
    expect(revealElapsed(3, 3.1, 0, 0, el)).toBeCloseTo(0.2)
    expect(revealElapsed(3, 3.1, 0.5, 0.35, el)).toBeCloseTo(0.35)
    expect(isRevealDue(3, 3.1, 0, 0.35, el)).toBe(false)
    expect(isRevealDue(3, 3.18, 0, 0.35, el)).toBe(true)
  })

  it('runs a fade-out on presentation time', () => {
    expect(annotationStateAt({ startTime: 2.5, endTime: 3.5, fadeOut: 0.4 }, 3.35, el).opacity).toBeCloseTo(0.3 / 0.4)
    expect(annotationStateAt({ startTime: 2.5, endTime: 3.5, fadeOut: 0.4 }, 3.35).opacity).toBeCloseTo(0.15 / 0.4)
  })
})

describe('fade-in during an automatic hold', () => {
  const zone = { startTime: 3, endTime: 6, fadeIn: 0.2, fadeOut: 0.15 }

  it('advances the fade-in with hold time on the start frame', () => {
    expect(annotationStateAt(zone, 3, undefined, 0).opacity).toBe(0.5)
    expect(annotationStateAt(zone, 3, undefined, 0.15).opacity).toBeCloseTo(0.75)
    expect(annotationStateAt(zone, 3, undefined, 0.2).opacity).toBe(1)
    expect(annotationStateAt(zone, 3, undefined, 1.5).opacity).toBe(1)
  })

  it('adds the hold to source time after playback resumes', () => {
    expect(annotationStateAt(zone, 3.05, undefined, 0.1).opacity).toBeCloseTo(0.75)
    expect(annotationStateAt(zone, 3.05, undefined, 1).opacity).toBe(1)
  })

  it('starts the fade after the reveal delay', () => {
    const later = { ...zone, revealDelay: 0.35 }
    expect(annotationStateAt(later, 3, undefined, 0.35).opacity).toBe(0.5)
    expect(annotationStateAt(later, 3, undefined, 0.5).opacity).toBeCloseTo(0.75)
    expect(annotationStateAt(later, 3, undefined, 0.55).opacity).toBe(1)
  })

  it('is unchanged without a hold, and leaves draw-on and fade-out alone', () => {
    expect(annotationStateAt({ ...zone, revealDelay: 0.35 }, 3.1).opacity).toBeCloseTo(0.5)
    expect(annotationStateAt({ ...zone, drawIn: 0.4 }, 3, undefined, 0.1).opacity).toBe(1)
    expect(annotationStateAt(zone, 5.9, undefined, 2).opacity).toBeCloseTo(0.1 / 0.15)
  })
})
