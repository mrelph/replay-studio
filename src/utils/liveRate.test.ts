import { describe, expect, it } from 'vitest'
import { liveOutput, liveRate, regionBadge, regionMutes } from './liveRate'
import type { SpeedStep } from '@/export/speedMap'

describe('liveRate', () => {
  it('multiplies the user rate by the region speed', () => {
    expect(liveRate(1, 0.5, null)).toBe(0.5)
  })

  it('clamps to the range Chromium accepts', () => {
    expect(liveRate(8, 4, null)).toBe(16)
    expect(liveRate(0.25, 0.1, null)).toBe(0.0625)
  })

  it('lets the recording speed override the map', () => {
    expect(liveRate(1, 1, 0.5)).toBe(0.5)
    expect(liveRate(2, 0.25, 0.5)).toBe(1)
  })
})

describe('regionMutes', () => {
  it('mutes only when the effective speed is not 1', () => {
    expect(regionMutes(1, null)).toBe(false)
    expect(regionMutes(0.5, null)).toBe(true)
    expect(regionMutes(1, 0.5)).toBe(true)
  })
})

describe('liveOutput', () => {
  const steps: SpeedStep[] = [
    { start: 0, end: 1, speed: 1 },
    { start: 1, end: 2, speed: 0.5 },
    { start: 2, end: 3, speed: 1 },
  ]
  const base = { userRate: 1, userMuted: false, reversing: false, steps, recordingSpeed: null }

  it('plays at the user rate with the user mute outside regions or with no regions', () => {
    expect(liveOutput({ ...base, time: 0.5 })).toEqual({ rate: 1, muted: false })
    expect(liveOutput({ ...base, steps: undefined, userRate: 2, userMuted: true, time: 1.5 })).toEqual({ rate: 2, muted: true })
  })

  it('slows and mutes inside a region, keeping the user mute on leaving', () => {
    expect(liveOutput({ ...base, time: 1.5 })).toEqual({ rate: 0.5, muted: true })
    expect(liveOutput({ ...base, userMuted: true, time: 2.5 })).toEqual({ rate: 1, muted: true })
  })

  it('leaves the rate alone and ignores regions while reversing', () => {
    expect(liveOutput({ ...base, reversing: true, time: 1.5 })).toEqual({ rate: null, muted: false })
  })
})

describe('regionBadge', () => {
  const regions = [{ start: 1, end: 2, speed: 0.5 }]

  it('labels the region under the playhead', () => {
    expect(regionBadge(regions, 1.5)).toBe('50%')
    expect(regionBadge(regions, 1 - 1e-6)).toBe('50%')
    expect(regionBadge(regions, 2)).toBeNull()
    expect(regionBadge(regions, 0.5)).toBeNull()
  })
})
