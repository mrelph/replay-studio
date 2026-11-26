import { describe, it, expect } from 'vitest'
import { frameHoldSeconds, frozenVoiceAt, sanitizeVoiceClips, voiceFreezes, DUCK_GAIN } from './voiceClips'
import type { VoiceClip } from '@/types/voice'

const clip = (id: string, startTime: number, duration = 2, frozen = true): VoiceClip => ({ id, startTime, duration, frozen, mime: 'audio/webm' })

describe('frozenVoiceAt', () => {
  it('matches by frame index at 30 fps', () => {
    const clips = [clip('a', 1)]
    expect(frozenVoiceAt(clips, 1.01, 30)?.id).toBe('a')
    expect(frozenVoiceAt(clips, 1.05, 30)).toBeUndefined()
  })
  it('ignores non-frozen clips', () => {
    expect(frozenVoiceAt([clip('a', 1, 2, false)], 1, 30)).toBeUndefined()
  })
})

describe('voiceFreezes', () => {
  it('returns only frozen clips', () => {
    expect(voiceFreezes([clip('a', 1, 3), clip('b', 5, 2, false)])).toEqual([{ startTime: 1, freezeDuration: 3 }])
  })
})

describe('frameHoldSeconds', () => {
  it('returns the longer of carrier and voice', () => {
    expect(frameHoldSeconds([{ startTime: 1, freezeDuration: 4 }], [clip('a', 1, 2)], 1, 30)).toBe(4)
    expect(frameHoldSeconds([{ startTime: 1, freezeDuration: 1 }], [clip('a', 1, 2)], 1, 30)).toBe(2)
  })
  it('is 0 with neither', () => {
    expect(frameHoldSeconds([{ startTime: 3 }], [clip('a', 1, 2)], 5, 30)).toBe(0)
    expect(frameHoldSeconds([], [], 1, 30)).toBe(0)
  })
})

describe('sanitizeVoiceClips', () => {
  it('drops malformed entries', () => {
    const good = clip('ok', 1, 2)
    const out = sanitizeVoiceClips([
      good,
      { ...good, id: 'neg', startTime: -1 },
      { ...good, id: 'short', duration: 0.1 },
      { ...good, id: undefined },
      { ...good, id: 'long', duration: 200 },
      null,
    ])
    expect(out).toEqual([good])
  })
  it('returns [] for non-arrays', () => {
    expect(sanitizeVoiceClips('x')).toEqual([])
    expect(sanitizeVoiceClips(undefined)).toEqual([])
  })
})

describe('DUCK_GAIN', () => {
  it('has the agreed gains', () => {
    expect(DUCK_GAIN).toEqual({ low: 0.25, off: 0, full: 1 })
  })
})
