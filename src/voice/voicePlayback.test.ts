import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { Annotation } from '@/stores/drawingStore'
import type { VoiceClip } from '@/types/voice'
import { timeForFrame } from '@/utils/frames'
import { clearVoiceAudio, setVoiceAudio } from './voiceAudio'
import { effectiveHolds, playVoice, stopVoice, voiceCrossed, setVoicePlayerFactory } from './voicePlayback'

const fps = 30000 / 1001
const t = timeForFrame(150, fps)

const ann = (id: string, toolType: string, startTime: number, freezeDuration?: number) =>
  ({ id, toolType, startTime, endTime: startTime + 2, layer: 0, freezeDuration }) as unknown as Annotation

const clip = (id: string, startTime: number, duration: number, frozen: boolean): VoiceClip => ({
  id,
  startTime,
  duration,
  frozen,
  mime: 'audio/webm',
})

describe('effectiveHolds', () => {
  it('merges a carrier and a longer frozen voice on one frame', () => {
    const holds = effectiveHolds([ann('arrow-1', 'arrow', t, 1)], [clip('v1', t + 0.2 / fps, 3, true)], fps)
    expect(holds).toHaveLength(1)
    expect(holds[0]).toMatchObject({ time: t, seconds: 3, voiceId: 'v1' })
  })

  it('keeps the carrier length when it is longer than the voice', () => {
    const holds = effectiveHolds([ann('arrow-1', 'arrow', t, 4)], [clip('v1', t, 1.5, true)], fps)
    expect(holds).toEqual([expect.objectContaining({ time: t, seconds: 4, voiceId: 'v1' })])
  })

  it('holds on a voice-only frame at the clip start', () => {
    const holds = effectiveHolds([], [clip('v1', t, 2.5, true)], fps)
    expect(holds).toEqual([expect.objectContaining({ time: t, seconds: 2.5, voiceId: 'v1' })])
  })

  it('leaves carrier-only holds as they are today', () => {
    const later = timeForFrame(300, fps)
    const holds = effectiveHolds(
      [ann('b', 'arrow', later, 2), ann('p', 'path', t), ann('a', 'freeze', t, 1.4), ann('z', 'freeze', t + 5, 0)],
      [],
      fps,
    )
    expect(holds.map(({ time, seconds, voiceId }) => ({ time, seconds, voiceId }))).toEqual([
      { time: later, seconds: 2, voiceId: undefined },
      { time: t, seconds: 1.4, voiceId: undefined },
    ])
  })

  it('uses the voice length on a frame whose freeze was set to 0', () => {
    const holds = effectiveHolds([ann('f', 'freeze', t, 0)], [clip('v1', t, 2, true)], fps)
    expect(holds).toEqual([expect.objectContaining({ time: t, seconds: 2, voiceId: 'v1' })])
  })

  it('ignores playing clips and gives one stable id per frame', () => {
    const a = effectiveHolds([ann('f', 'freeze', t, 1)], [clip('v1', t + 1, 2, false)], fps)
    const b = effectiveHolds([ann('f2', 'freeze', t, 1)], [clip('v2', t, 2, true)], fps)
    expect(a).toHaveLength(1)
    expect(a[0].voiceId).toBeUndefined()
    expect(a[0].id).toBe(b[0].id)
  })
})

describe('voiceCrossed', () => {
  const clips = [clip('frozen', 2, 1, true), clip('a', 2, 1, false), clip('b', 5, 1, false)]

  it('counts a start exactly at curTime', () => {
    expect(voiceCrossed(clips, 1.5, 2)?.id).toBe('a')
  })

  it('does not count a start at prevTime', () => {
    expect(voiceCrossed(clips, 2, 2.4)).toBeUndefined()
  })

  it('never returns frozen clips', () => {
    expect(voiceCrossed([clip('frozen', 2, 1, true)], 1, 3)).toBeUndefined()
  })
})

class FakeAudio extends EventTarget {
  static made: FakeAudio[] = []
  paused = true
  constructor(public src: string) {
    super()
    FakeAudio.made.push(this)
  }
  play() {
    this.paused = false
    return Promise.resolve()
  }
  pause() {
    this.paused = true
  }
}

describe('playVoice', () => {
  beforeEach(() => {
    let n = 0
    URL.createObjectURL = vi.fn(() => `blob:voice-${++n}`)
    URL.revokeObjectURL = vi.fn()
    FakeAudio.made = []
    setVoicePlayerFactory((url) => new FakeAudio(url) as unknown as HTMLAudioElement)
    setVoiceAudio('v1', new Blob(['1']))
    setVoiceAudio('v2', new Blob(['2']))
  })

  afterEach(() => {
    stopVoice()
    setVoicePlayerFactory(null)
    clearVoiceAudio()
  })

  it('plays the clip and stops when asked', () => {
    const onEnd = vi.fn()
    const stop = playVoice('v1', onEnd)
    expect(FakeAudio.made).toHaveLength(1)
    expect(FakeAudio.made[0].paused).toBe(false)
    stop()
    expect(FakeAudio.made[0].paused).toBe(true)
    expect(onEnd).toHaveBeenCalledTimes(1)
    stop()
    expect(onEnd).toHaveBeenCalledTimes(1)
  })

  it('plays one clip at a time', () => {
    const first = vi.fn()
    playVoice('v1', first)
    playVoice('v2')
    expect(FakeAudio.made[0].paused).toBe(true)
    expect(first).toHaveBeenCalledTimes(1)
    expect(FakeAudio.made[1].paused).toBe(false)
  })

  it('reports the natural end, and stopVoice stops the current clip', () => {
    const onEnd = vi.fn()
    playVoice('v1', onEnd)
    FakeAudio.made[0].dispatchEvent(new Event('ended'))
    expect(onEnd).toHaveBeenCalledTimes(1)
    playVoice('v2')
    stopVoice()
    expect(FakeAudio.made[1].paused).toBe(true)
  })

  it('ends at once when the clip has no audio', () => {
    const onEnd = vi.fn()
    playVoice('missing', onEnd)
    expect(FakeAudio.made).toHaveLength(0)
    expect(onEnd).toHaveBeenCalledTimes(1)
  })
})
