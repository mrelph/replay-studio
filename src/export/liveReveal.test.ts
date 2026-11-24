import { describe, expect, it } from 'vitest'
import { stepLiveReveal } from './liveReveal'
import { revealFraction } from './annotationTiming'

describe('stepLiveReveal', () => {
  const base = { fps: 30, autoHold: null, now: 0 }
  const ann = [{ id: 'a', startTime: 5, endTime: 8, drawIn: 0.4 }]
  it('user pause shows finished shapes and disarms', () => {
    const armed = new Map([['a', 0]])
    expect(stepLiveReveal({ ...base, annotations: ann, prevTime: 5.1, time: 5.1, playing: false, armed }).get('a')).toBe(1)
    expect(armed.size).toBe(0)
  })
  it('arms when playback arrives and animates', () => {
    const armed = new Map<string, number>()
    expect(stepLiveReveal({ ...base, annotations: ann, prevTime: 4.99, time: 5.0, playing: true, armed }).get('a')).toBe(0)
    expect(armed.has('a')).toBe(true)
    expect(stepLiveReveal({ ...base, annotations: ann, prevTime: 5.0, time: 5.2, playing: true, armed }).get('a')).toBeCloseTo(0.875)
    expect(stepLiveReveal({ ...base, annotations: ann, prevTime: 5.2, time: 5.5, playing: true, armed }).get('a')).toBe(1)
  })
  it('does not replay a drawing when Play is pressed on its own frame', () => {
    const armed = new Map<string, number>()
    expect(stepLiveReveal({ ...base, annotations: ann, prevTime: 5, time: 5.016, playing: true, armed }).get('a')).toBe(1)
  })
  it('a seek into the annotation does not arm it', () => {
    const armed = new Map<string, number>()
    expect(stepLiveReveal({ ...base, annotations: ann, prevTime: 1, time: 5.1, playing: true, armed }).get('a')).toBe(1)
  })
  it('keeps animating through an automatic hold', () => {
    const armed = new Map([['a', 0]])
    const hold = { time: 5, startedAt: 1000, endedAt: null }
    expect(stepLiveReveal({ ...base, annotations: ann, prevTime: 5, time: 5, playing: false, autoHold: hold, now: 1200, armed }).get('a')).toBeCloseTo(0.875)
    expect(stepLiveReveal({ ...base, annotations: ann, prevTime: 5, time: 5, playing: false, autoHold: hold, now: 1500, armed }).get('a')).toBe(1)
  })
  it('counts a finished hold after playback resumes', () => {
    const armed = new Map([['a', 0]])
    const hold = { time: 5, startedAt: 1000, endedAt: 1200 }
    expect(stepLiveReveal({ ...base, annotations: ann, prevTime: 5, time: 5.1, playing: true, autoHold: hold, now: 9999, armed }).get('a')).toBeCloseTo(revealFraction(0.3, 0.4))
  })
  it('disarms after the annotation ends or playback moves before it', () => {
    const armed = new Map([['a', 0]])
    stepLiveReveal({ ...base, annotations: ann, prevTime: 7.9, time: 8.1, playing: true, armed })
    expect(armed.has('a')).toBe(false)
  })
  it('annotations without drawIn are always finished', () => {
    const armed = new Map<string, number>()
    expect(stepLiveReveal({ ...base, annotations: [{ id: 'b', startTime: 5, endTime: 8 }], prevTime: 4.99, time: 5, playing: true, armed }).get('b')).toBe(1)
  })
  it('does not restart a drawing when a freeze snaps playback back to its start frame', () => {
    const armed = new Map([['a', 0]])
    expect(stepLiveReveal({ ...base, annotations: ann, prevTime: 5.0, time: 5.2, playing: true, armed }).get('a')).toBeCloseTo(0.875)
    const hold = { time: 5, startedAt: 1000, endedAt: null }
    expect(stepLiveReveal({ ...base, annotations: ann, prevTime: 5.2, time: 5.0, playing: false, autoHold: hold, now: 1000, armed }).get('a')).toBeCloseTo(0.875)
    expect(stepLiveReveal({ ...base, annotations: ann, prevTime: 5.0, time: 5.0, playing: false, autoHold: hold, now: 1400, armed }).get('a')).toBe(1)
  })
  it('counts a hold recorded a frame after the start frame', () => {
    const armed = new Map([['a', 0]])
    const hold = { time: 5.05, startedAt: 1000, endedAt: null }
    expect(stepLiveReveal({ ...base, annotations: ann, prevTime: 5.05, time: 5.05, playing: false, autoHold: hold, now: 1100, armed }).get('a')).toBeCloseTo(revealFraction(0.05 + 0.1, 0.4))
    expect(stepLiveReveal({ ...base, annotations: ann, prevTime: 5.05, time: 5.05, playing: false, autoHold: hold, now: 1500, armed }).get('a')).toBe(1)
  })
  it('ignores a hold on an earlier frame', () => {
    const armed = new Map([['a', 0]])
    const hold = { time: 4.9, startedAt: 1000, endedAt: 1400 }
    expect(stepLiveReveal({ ...base, annotations: ann, prevTime: 5.0, time: 5.1, playing: true, autoHold: hold, now: 9999, armed }).get('a')).toBeCloseTo(revealFraction(0.1, 0.4))
  })
  it('replays from the start after disarming', () => {
    const armed = new Map<string, number>()
    stepLiveReveal({ ...base, annotations: ann, prevTime: 4.99, time: 5.0, playing: true, armed })
    expect(stepLiveReveal({ ...base, annotations: ann, prevTime: 5.0, time: 5.5, playing: true, armed }).get('a')).toBe(1)
    stepLiveReveal({ ...base, annotations: ann, prevTime: 5.5, time: 4.0, playing: true, armed })
    expect(armed.has('a')).toBe(false)
    expect(stepLiveReveal({ ...base, annotations: ann, prevTime: 4.99, time: 5.0, playing: true, armed }).get('a')).toBe(0)
  })
})
