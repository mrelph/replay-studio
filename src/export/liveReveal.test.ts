import { describe, expect, it } from 'vitest'
import { stepLiveReveal, type ArmedReveal } from './liveReveal'
import { revealFraction } from './annotationTiming'

const armedWith = (id: string) => new Map<string, ArmedReveal>([[id, { peak: 0, due: false }]])

describe('stepLiveReveal', () => {
  const base = { fps: 30, autoHold: null, now: 0 }
  const ann = [{ id: 'a', startTime: 5, endTime: 8, drawIn: 0.4 }]
  it('user pause shows finished shapes and disarms', () => {
    const armed = armedWith('a')
    expect(stepLiveReveal({ ...base, annotations: ann, prevTime: 5.1, time: 5.1, playing: false, armed }).get('a')?.fraction).toBe(1)
    expect(armed.size).toBe(0)
  })
  it('arms when playback arrives and animates', () => {
    const armed = new Map<string, ArmedReveal>()
    expect(stepLiveReveal({ ...base, annotations: ann, prevTime: 4.99, time: 5.0, playing: true, armed }).get('a')?.fraction).toBe(0)
    expect(armed.has('a')).toBe(true)
    expect(stepLiveReveal({ ...base, annotations: ann, prevTime: 5.0, time: 5.2, playing: true, armed }).get('a')?.fraction).toBeCloseTo(0.875)
    expect(stepLiveReveal({ ...base, annotations: ann, prevTime: 5.2, time: 5.5, playing: true, armed }).get('a')?.fraction).toBe(1)
  })
  it('does not replay a drawing when Play is pressed on its own frame', () => {
    const armed = new Map<string, ArmedReveal>()
    expect(stepLiveReveal({ ...base, annotations: ann, prevTime: 5, time: 5.016, playing: true, armed }).get('a')?.fraction).toBe(1)
  })
  it('a seek into the annotation does not arm it', () => {
    const armed = new Map<string, ArmedReveal>()
    expect(stepLiveReveal({ ...base, annotations: ann, prevTime: 1, time: 5.1, playing: true, armed }).get('a')?.fraction).toBe(1)
  })
  it('keeps animating through an automatic hold', () => {
    const armed = armedWith('a')
    const hold = { time: 5, startedAt: 1000, endedAt: null }
    expect(stepLiveReveal({ ...base, annotations: ann, prevTime: 5, time: 5, playing: false, autoHold: hold, now: 1200, armed }).get('a')?.fraction).toBeCloseTo(0.875)
    expect(stepLiveReveal({ ...base, annotations: ann, prevTime: 5, time: 5, playing: false, autoHold: hold, now: 1500, armed }).get('a')?.fraction).toBe(1)
  })
  it('counts a finished hold after playback resumes', () => {
    const armed = armedWith('a')
    const hold = { time: 5, startedAt: 1000, endedAt: 1200 }
    expect(stepLiveReveal({ ...base, annotations: ann, prevTime: 5, time: 5.1, playing: true, autoHold: hold, now: 9999, armed }).get('a')?.fraction).toBeCloseTo(revealFraction(0.3, 0.4))
  })
  it('disarms after the annotation ends or playback moves before it', () => {
    const armed = armedWith('a')
    stepLiveReveal({ ...base, annotations: ann, prevTime: 7.9, time: 8.1, playing: true, armed })
    expect(armed.has('a')).toBe(false)
  })
  it('annotations without drawIn are always finished', () => {
    const armed = new Map<string, ArmedReveal>()
    expect(stepLiveReveal({ ...base, annotations: [{ id: 'b', startTime: 5, endTime: 8 }], prevTime: 4.99, time: 5, playing: true, armed }).get('b')?.fraction).toBe(1)
  })
  it('does not restart a drawing when a freeze snaps playback back to its start frame', () => {
    const armed = armedWith('a')
    expect(stepLiveReveal({ ...base, annotations: ann, prevTime: 5.0, time: 5.2, playing: true, armed }).get('a')?.fraction).toBeCloseTo(0.875)
    const hold = { time: 5, startedAt: 1000, endedAt: null }
    expect(stepLiveReveal({ ...base, annotations: ann, prevTime: 5.2, time: 5.0, playing: false, autoHold: hold, now: 1000, armed }).get('a')?.fraction).toBeCloseTo(0.875)
    expect(stepLiveReveal({ ...base, annotations: ann, prevTime: 5.0, time: 5.0, playing: false, autoHold: hold, now: 1400, armed }).get('a')?.fraction).toBe(1)
  })
  it('counts a hold recorded a frame after the start frame', () => {
    const armed = armedWith('a')
    const hold = { time: 5.05, startedAt: 1000, endedAt: null }
    expect(stepLiveReveal({ ...base, annotations: ann, prevTime: 5.05, time: 5.05, playing: false, autoHold: hold, now: 1100, armed }).get('a')?.fraction).toBeCloseTo(revealFraction(0.05 + 0.1, 0.4))
    expect(stepLiveReveal({ ...base, annotations: ann, prevTime: 5.05, time: 5.05, playing: false, autoHold: hold, now: 1500, armed }).get('a')?.fraction).toBe(1)
  })
  it('ignores a hold on an earlier frame', () => {
    const armed = armedWith('a')
    const hold = { time: 4.9, startedAt: 1000, endedAt: 1400 }
    expect(stepLiveReveal({ ...base, annotations: ann, prevTime: 5.0, time: 5.1, playing: true, autoHold: hold, now: 9999, armed }).get('a')?.fraction).toBeCloseTo(revealFraction(0.1, 0.4))
  })
  it('replays from the start after disarming', () => {
    const armed = new Map<string, ArmedReveal>()
    stepLiveReveal({ ...base, annotations: ann, prevTime: 4.99, time: 5.0, playing: true, armed })
    expect(stepLiveReveal({ ...base, annotations: ann, prevTime: 5.0, time: 5.5, playing: true, armed }).get('a')?.fraction).toBe(1)
    stepLiveReveal({ ...base, annotations: ann, prevTime: 5.5, time: 4.0, playing: true, armed })
    expect(armed.has('a')).toBe(false)
    expect(stepLiveReveal({ ...base, annotations: ann, prevTime: 4.99, time: 5.0, playing: true, armed }).get('a')?.fraction).toBe(0)
  })
})

describe('stepLiveReveal drawn order (revealDelay)', () => {
  const anns = [
    { id: 'a', startTime: 3, endTime: 5, drawIn: 0.35, revealDelay: 0 },
    { id: 'b', startTime: 3, endTime: 5, drawIn: 0.4, revealDelay: 0.35 },
    { id: 't', startTime: 3, endTime: 5, revealDelay: 0.75 },
  ]
  const step = (armed: Map<string, ArmedReveal>, over: Partial<Parameters<typeof stepLiveReveal>[0]>) =>
    stepLiveReveal({ annotations: anns, prevTime: 3, time: 3, playing: false, autoHold: null, now: 0, fps: 30, armed, ...over })

  it('reveals each drawing on its turn during a hold on its frame', () => {
    const armed = new Map<string, ArmedReveal>()
    const hold = { time: 3, startedAt: 1000, endedAt: null }
    let r = step(armed, { autoHold: hold, now: 1200 })
    expect(r.get('b')).toMatchObject({ due: false })
    expect(r.get('t')).toMatchObject({ due: false })
    expect(r.get('a')?.due).toBe(true)
    expect(r.get('a')?.fraction).toBeGreaterThan(0)
    expect(r.get('a')?.fraction).toBeLessThan(1)
    r = step(armed, { autoHold: hold, now: 1400 })
    expect(r.get('b')?.due).toBe(true)
    expect(r.get('t')?.due).toBe(false)
    r = step(armed, { autoHold: hold, now: 1800 })
    expect(r.get('t')).toEqual({ fraction: 1, due: true })
  })

  it('keeps a due drawing shown after the hold ends and playback snaps back', () => {
    const armed = new Map<string, ArmedReveal>()
    step(armed, { autoHold: { time: 3, startedAt: 1000, endedAt: null }, now: 1400 })
    const ended = { time: 3, startedAt: 1000, endedAt: 1400 }
    expect(step(armed, { autoHold: ended, playing: true, prevTime: 3.05, time: 3.0, now: 5000 }).get('b')?.due).toBe(true)
  })

  it('latches due when a new hold snaps playback back to the start frame', () => {
    const armed = new Map<string, ArmedReveal>()
    step(armed, { playing: true, prevTime: 2.99, time: 3.0 })
    expect(step(armed, { playing: true, prevTime: 3.0, time: 3.4 }).get('b')?.due).toBe(true)
    const r = step(armed, { prevTime: 3.4, time: 3.0, autoHold: { time: 3, startedAt: 1000, endedAt: null }, now: 1000 })
    expect(r.get('b')?.due).toBe(true)
    expect(r.get('b')?.fraction).toBeGreaterThan(0)
  })

  it('arms a delayed drawing with no draw-on when playback arrives', () => {
    const armed = new Map<string, ArmedReveal>()
    expect(step(armed, { playing: true, prevTime: 2.99, time: 3.0 }).get('t')?.due).toBe(false)
    expect(step(armed, { playing: true, prevTime: 3.0, time: 3.8 }).get('t')).toEqual({ fraction: 1, due: true })
  })

  it('shows everything finished while paused by the user', () => {
    const armed = new Map<string, ArmedReveal>()
    step(armed, { autoHold: { time: 3, startedAt: 1000, endedAt: null }, now: 1100 })
    const r = step(armed, { autoHold: { time: 3, startedAt: 1000, endedAt: 1100 }, now: 2000 })
    for (const id of ['a', 'b', 't']) expect(r.get(id)).toEqual({ fraction: 1, due: true })
  })

  it('shows a delayed drawing that playback did not arrive at', () => {
    const armed = new Map<string, ArmedReveal>()
    expect(step(armed, { playing: true, prevTime: 1, time: 3.1 }).get('t')).toEqual({ fraction: 1, due: true })
  })
})
