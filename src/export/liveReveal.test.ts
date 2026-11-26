import { describe, expect, it } from 'vitest'
import { stepLiveReveal, type ArmedReveal } from './liveReveal'
import { annotationStateAt, revealFraction } from './annotationTiming'
import { buildSpeedSteps } from './speedMap'
import { frameStart, timeForFrame } from '@/utils/frames'

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

  it('keeps a due drawing shown after a short hold ends and playback snaps back', () => {
    const armed = new Map<string, ArmedReveal>()
    step(armed, { playing: true, prevTime: 2.99, time: 3.0 })
    expect(step(armed, { playing: true, prevTime: 3.0, time: 3.4 }).get('b')?.due).toBe(true)
    // The hold on frame 3 lasted 0.1 s, less than b's delay: only the latch keeps b due.
    const ended = { time: 3, startedAt: 1000, endedAt: 1100 }
    expect(step(armed, { autoHold: ended, playing: true, prevTime: 3.4, time: 3.0, now: 5000 }).get('b')?.due).toBe(true)
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

describe('stepLiveReveal on the exact frame start', () => {
  const fps = 30
  const start = frameStart(91, fps)
  // Chromium reports the hold's seek time in whole microseconds, just below it.
  const held = Math.floor(timeForFrame(91, fps) * 1e6) / 1e6
  const anns = [
    { id: 'a', startTime: start, endTime: start + 2, drawIn: 0.35, revealDelay: 0 },
    { id: 'b', startTime: start, endTime: start + 2, drawIn: 0.4, revealDelay: 0.35 },
  ]

  it('reveals in order during a hold seeked to the frame\'s marker', () => {
    const armed = new Map<string, ArmedReveal>()
    const hold = { time: timeForFrame(91, fps), startedAt: 1000, endedAt: null }
    const step = (now: number) => stepLiveReveal({ annotations: anns, prevTime: held, time: held, playing: false, autoHold: hold, now, fps, armed })
    let r = step(1100)
    expect(r.get('a')?.due).toBe(true)
    expect(r.get('a')?.fraction).toBeLessThan(1)
    expect(r.get('b')?.due).toBe(false)
    r = step(1800)
    expect(r.get('b')).toEqual({ fraction: 1, due: true })
  })

  it('arms when playback crosses into the frame, not when Play starts on it', () => {
    const arrive = new Map<string, ArmedReveal>()
    expect(stepLiveReveal({ annotations: anns, prevTime: start - 0.02, time: start + 0.001, playing: true, autoHold: null, now: 0, fps, armed: arrive }).get('a')?.fraction).toBeLessThan(1)
    const onFrame = new Map<string, ArmedReveal>()
    expect(stepLiveReveal({ annotations: anns, prevTime: held, time: held + 0.016, playing: true, autoHold: null, now: 0, fps, armed: onFrame }).get('a')?.fraction).toBe(1)
  })
})

describe('stepLiveReveal inside a slow-motion region', () => {
  const ann = [{ id: 'a', startTime: 3, endTime: 3.9, drawIn: 0.4 }]
  const step = (armed: Map<string, ArmedReveal>, prevTime: number, time: number, speedSteps?: ReturnType<typeof buildSpeedSteps>) =>
    stepLiveReveal({ annotations: ann, prevTime, time, playing: true, autoHold: null, now: 0, fps: 30, armed, speedSteps })

  it('draws on in the same wall time as at normal speed', () => {
    const steps = buildSpeedSteps([{ start: 2, end: 4, speed: 0.5 }], 10, 30)
    const slow = new Map<string, ArmedReveal>()
    step(slow, 2.99, 3.0, steps)
    // 0.2 s of wall time at half speed is 0.1 s of source time
    const slowFraction = step(slow, 3.0, 3.1, steps).get('a')?.fraction
    const normal = new Map<string, ArmedReveal>()
    step(normal, 2.99, 3.0)
    const normalFraction = step(normal, 3.0, 3.2).get('a')?.fraction
    expect(slowFraction).toBeCloseTo(revealFraction(0.2, 0.4))
    expect(slowFraction).toBeCloseTo(normalFraction!)
  })
})

describe('stepLiveReveal fade-in hold time', () => {
  const zone = { id: 'z', startTime: 3, endTime: 6, fadeIn: 0.2 }
  const step = (over: Partial<Parameters<typeof stepLiveReveal>[0]>) =>
    stepLiveReveal({ annotations: [zone], prevTime: 3, time: 3, playing: false, autoHold: null, now: 0, fps: 30, armed: new Map(), ...over })

  it('reports the hold time of a freeze on the start frame', () => {
    const hold = { time: 3, startedAt: 1000, endedAt: null }
    expect(step({ autoHold: hold, now: 1100 }).get('z')?.holdElapsed).toBeCloseTo(0.1)
    expect(step({ autoHold: { ...hold, endedAt: 1500 }, playing: true, time: 3.1, now: 9000 }).get('z')?.holdElapsed).toBeCloseTo(0.5)
    expect(annotationStateAt(zone, 3, undefined, step({ autoHold: hold, now: 1100 }).get('z')?.holdElapsed).opacity).toBeCloseTo(0.5)
    expect(annotationStateAt(zone, 3, undefined, step({ autoHold: hold, now: 1250 }).get('z')?.holdElapsed).opacity).toBe(1)
  })

  it('reports 0 while paused by the user or for a hold on an earlier frame', () => {
    expect(step({ autoHold: { time: 3, startedAt: 1000, endedAt: 1100 }, now: 2000 }).get('z')?.holdElapsed ?? 0).toBe(0)
    expect(step({ autoHold: { time: 2.9, startedAt: 1000, endedAt: 1400 }, playing: true, time: 3.1, now: 9000 }).get('z')?.holdElapsed ?? 0).toBe(0)
  })

  it('leaves annotations without a fade-in as they were', () => {
    const r = stepLiveReveal({ annotations: [{ id: 'b', startTime: 3, endTime: 6 }], prevTime: 3, time: 3, playing: false, autoHold: { time: 3, startedAt: 1000, endedAt: null }, now: 1100, fps: 30, armed: new Map() })
    expect(r.get('b')).toEqual({ fraction: 1, due: true })
  })
})

describe('stepLiveReveal fade-in latch', () => {
  const zone = { id: 'z', startTime: 3, endTime: 6, fadeIn: 0.2, fadeOut: 0.15, revealDelay: 0.5 }
  const opacity = (r: Map<string, { holdElapsed?: number }>, t: number, ann: typeof zone = zone) => annotationStateAt(ann, t, undefined, r.get(ann.id)?.holdElapsed).opacity
  const run = (ann: typeof zone) => {
    const armed = new Map<string, ArmedReveal>()
    const step = (over: Partial<Parameters<typeof stepLiveReveal>[0]>) =>
      stepLiveReveal({ annotations: [ann], prevTime: 3, time: 3, playing: false, autoHold: null, now: 0, fps: 30, armed, ...over })
    return { armed, step }
  }

  it('stays at full strength through a later freeze and after it', () => {
    const { step } = run(zone)
    const first = { time: 3, startedAt: 1000, endedAt: null }
    expect(opacity(step({ autoHold: first, now: 1500 }), 3)).toBe(0.5)
    expect(opacity(step({ autoHold: first, now: 1800 }), 3)).toBe(1)
    const ended = { ...first, endedAt: 1800 }
    expect(opacity(step({ autoHold: ended, playing: true, prevTime: 3, time: 3.3, now: 2100 }), 3.3)).toBe(1)
    const second = { time: 3.3, startedAt: 2100, endedAt: null }
    for (const now of [2100, 2105, 2150, 2300]) expect(opacity(step({ autoHold: second, prevTime: 3.3, time: 3.3, now }), 3.3)).toBe(1)
    expect(opacity(step({ autoHold: { ...second, endedAt: 2105 }, playing: true, prevTime: 3.3, time: 3.4, now: 2200 }), 3.4)).toBe(1)
  })

  it('leaves a drawing with no delay as it was', () => {
    const plain = { ...zone, revealDelay: 0 }
    const { step, armed } = run(plain)
    const hold = { time: 3, startedAt: 1000, endedAt: null }
    expect(step({ autoHold: hold, now: 1100 }).get('z')?.holdElapsed).toBeCloseTo(0.1)
    expect(armed.size).toBe(0)
  })

  it('restarts the fade-in from the floor after playback leaves and plays back in', () => {
    const { step, armed } = run(zone)
    step({ autoHold: { time: 3, startedAt: 1000, endedAt: null }, now: 1800 })
    step({ autoHold: { time: 3, startedAt: 1000, endedAt: 1800 }, playing: true, prevTime: 3, time: 2.5, now: 2000 })
    expect(armed.has('z')).toBe(false)
    step({ playing: true, prevTime: 2.99, time: 3.0, now: 3000 })
    const hold = { time: 3, startedAt: 4000, endedAt: null }
    expect(opacity(step({ autoHold: hold, now: 4500 }), 3)).toBe(0.5)
    expect(opacity(step({ autoHold: hold, now: 4600 }), 3)).toBeCloseTo(0.5)
  })

  it('still fades out a latched drawing near its end', () => {
    const { step } = run(zone)
    step({ autoHold: { time: 3, startedAt: 1000, endedAt: null }, now: 1800 })
    const ended = { time: 3, startedAt: 1000, endedAt: 1800 }
    expect(opacity(step({ autoHold: ended, playing: true, prevTime: 5.9, time: 5.95, now: 9000 }), 5.95)).toBeCloseTo(0.05 / 0.15)
  })
})
