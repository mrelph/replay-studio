import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { Annotation } from '@/stores/drawingStore'
import type { VoiceClip } from '@/types/voice'
import { timeForFrame } from '@/utils/frames'
import { clearVoiceAudio, setVoiceAudio } from './voiceAudio'
import { createPlayingVoiceDuck, effectiveHolds, playVoice, stopVoice, voiceCrossed, voiceOnFrame, voiceToStart, setVoicePlayerFactory } from './voicePlayback'

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

describe('voiceToStart', () => {
  const after = clip('after', 5.1, 1, false)

  it('starts a crossed clip when no hold fires', () => {
    expect(voiceToStart([after], 4.95, 5.2, null, null)?.id).toBe('after')
  })

  it('waits for the freeze to end when a hold fires before the clip on the same tick', () => {
    expect(voiceToStart([after], 4.95, 5.2, 5, null)).toBeUndefined()
    // After the hold the player resumes from 5.000 and the next tick crosses 5.10 once.
    expect(voiceToStart([after], 5, 5.25, null, null)?.id).toBe('after')
  })

  it('starts a clip before the hold on the same tick', () => {
    expect(voiceToStart([clip('before', 4.98, 1, false)], 4.95, 5.2, 5, null)?.id).toBe('before')
  })

  it('skips the clip already started when playback began on its frame', () => {
    expect(voiceToStart([after], 5.09, 5.3, null, 'after')).toBeUndefined()
  })
})

describe('voiceOnFrame', () => {
  const start = timeForFrame(90, fps) + 0.01

  it('finds a playing clip whose start is on the frame', () => {
    expect(voiceOnFrame([clip('a', start, 1, false)], timeForFrame(90, fps), fps)?.id).toBe('a')
  })

  it('ignores frozen clips and other frames', () => {
    expect(voiceOnFrame([clip('f', start, 1, true)], timeForFrame(90, fps), fps)).toBeUndefined()
    expect(voiceOnFrame([clip('a', start, 1, false)], timeForFrame(91, fps), fps)).toBeUndefined()
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

  it('lets playing clips overlap, each ending on its own', () => {
    const first = vi.fn()
    const second = vi.fn()
    playVoice('v1', first, 'play')
    playVoice('v2', second, 'play')
    expect(FakeAudio.made.map((a) => a.paused)).toEqual([false, false])
    FakeAudio.made[0].dispatchEvent(new Event('ended'))
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).not.toHaveBeenCalled()
  })

  it('a hold voice or a preview leaves the playing clips sounding; each replaces its own channel only', () => {
    playVoice('v1', undefined, 'play')
    playVoice('v2', undefined, 'hold')
    playVoice('v1', undefined, 'preview')
    expect(FakeAudio.made.map((a) => a.paused)).toEqual([false, false, false])
    playVoice('v2', undefined, 'hold')
    expect(FakeAudio.made.map((a) => a.paused)).toEqual([false, true, false, false])
    playVoice('v2')
    expect(FakeAudio.made.map((a) => a.paused)).toEqual([false, true, true, false, false])
    stopVoice('preview')
    expect(FakeAudio.made[4].paused).toBe(true)
    expect(FakeAudio.made[0].paused).toBe(false)
  })

  it('stopVoice with no channel stops every clip', () => {
    const ends = [vi.fn(), vi.fn(), vi.fn()]
    playVoice('v1', ends[0], 'play')
    playVoice('v2', ends[1], 'play')
    playVoice('v1', ends[2], 'hold')
    stopVoice()
    expect(FakeAudio.made.every((a) => a.paused)).toBe(true)
    ends.forEach((end) => expect(end).toHaveBeenCalledTimes(1))
  })

  it('keeps the game sound ducked while any playing clip sounds', () => {
    const video = { volume: 0.8 }
    const duck = createPlayingVoiceDuck(video, () => 0.8, () => 0.25)
    duck.play('v1')
    duck.play('v2')
    expect(video.volume).toBeCloseTo(0.2, 9)
    FakeAudio.made[0].dispatchEvent(new Event('ended'))
    expect(video.volume).toBeCloseTo(0.2, 9)
    FakeAudio.made[1].dispatchEvent(new Event('ended'))
    expect(video.volume).toBe(0.8)
  })

  it('stopVoice restores the ducked game sound', () => {
    const video = { volume: 1 }
    let volume = 1
    const duck = createPlayingVoiceDuck(video, () => volume, () => 0.25)
    duck.play('v1')
    duck.play('v2')
    volume = 0.5
    duck.volumeChanged()
    expect(video.volume).toBe(0.125)
    stopVoice()
    expect(video.volume).toBe(0.5)
    duck.volumeChanged()
    expect(video.volume).toBe(0.5)
  })

  it('ends at once when the clip has no audio', () => {
    const onEnd = vi.fn()
    playVoice('missing', onEnd)
    expect(FakeAudio.made).toHaveLength(0)
    expect(onEnd).toHaveBeenCalledTimes(1)
  })
})
