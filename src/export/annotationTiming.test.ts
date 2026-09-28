import { describe, it, expect } from 'vitest'
import { annotationStateAt } from './annotationTiming'

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
