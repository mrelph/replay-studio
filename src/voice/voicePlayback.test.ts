import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { Annotation } from '@/stores/drawingStore'
import type { VoiceClip } from '@/types/voice'
import { timeForFrame } from '@/utils/frames'
import { clearVoiceAudio, setVoiceAudio } from './voiceAudio'
import {
  advanceVoice,
  createFrameLoop,
  createPlayingVoiceDuck,
  effectiveHolds,
  hasVoiceAhead,
  playVoice,
  stopVoice,
  voiceCrossed,
  voiceFrameEnd,
  voiceOnFrame,
  voiceToStart,
  voicesToStart,
  setVoicePlayerFactory,
} from './voicePlayback'

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

describe('voicesToStart', () => {
  it('returns every crossed playing clip, earliest first, with voiceToStart\'s rule', () => {
    const clips = [clip('b', 5.2, 1, false), clip('f', 5.05, 1, true), clip('a', 5.1, 1, false), clip('c', 5.4, 1, false)]
    expect(voicesToStart(clips, 5, 5.3, null, null).map((c) => c.id)).toEqual(['a', 'b'])
    expect(voicesToStart(clips, 5, 5.3, 5.15, null).map((c) => c.id)).toEqual(['a'])
    expect(voicesToStart(clips, 5, 5.3, null, 'a').map((c) => c.id)).toEqual(['b'])
  })
})

describe('hasVoiceAhead', () => {
  it('is true only for a playing clip that starts after the time', () => {
    expect(hasVoiceAhead([], 0)).toBe(false)
    expect(hasVoiceAhead([clip('f', 5, 1, true)], 0)).toBe(false)
    expect(hasVoiceAhead([clip('a', 5, 1, false)], 5)).toBe(false)
    expect(hasVoiceAhead([clip('a', 5, 1, false)], 4.99)).toBe(true)
  })
})

describe('voiceFrameEnd', () => {
  const hold = { id: 'hold-1', time: 5, seconds: 2 }

  it('reaches the current time when no hold is pending in between', () => {
    expect(voiceFrameEnd([], new Set(), 4, 5.2)).toBe(5.2)
    expect(voiceFrameEnd([hold], new Set(['hold-1']), 4, 5.2)).toBe(5.2)
    expect(voiceFrameEnd([hold], new Set(), 5.1, 5.2)).toBe(5.2)
  })

  it('stops at a hold timeupdate has not fired yet, the earliest of several', () => {
    const later = { id: 'hold-2', time: 5.1, seconds: 1 }
    expect(voiceFrameEnd([later, hold], new Set(), 4, 5.2)).toBe(5)
    // Parked on the hold: no further until the hold fires.
    expect(voiceFrameEnd([hold], new Set(), 5, 5.2)).toBe(5)
  })
})

describe('advanceVoice', () => {
  const a = clip('a', 5.1, 1, false)

  it('a clip a frame check started is not started again by the next timeupdate', () => {
    // timeupdate at 5.0, frames at 5.05 and 5.117, timeupdate at 5.25.
    let cursor = 5
    const started: string[] = []
    for (const end of [5.05, 5.117, 5.25]) {
      const step = advanceVoice([a], cursor, end, null)
      started.push(...step.start.map((c) => c.id))
      cursor = step.cursor
    }
    expect(started).toEqual(['a'])
    expect(cursor).toBe(5.25)
  })

  it('starts the clip on the frame that crosses it', () => {
    expect(advanceVoice([a], 5.083, 5.117, null).start.map((c) => c.id)).toEqual(['a'])
    expect(advanceVoice([a], 5.05, 5.083, null).start).toEqual([])
  })

  it('never moves back', () => {
    expect(advanceVoice([a], 5.2, 5, null)).toEqual({ start: [], cursor: 5.2, clearSkip: false })
  })

  it('skips the clip started when playback began on its frame, and reports when it is behind', () => {
    expect(advanceVoice([a], 5.09, 5.1, a)).toEqual({ start: [], cursor: 5.1, clearSkip: true })
    expect(advanceVoice([a], 5.08, 5.09, a)).toEqual({ start: [], cursor: 5.09, clearSkip: false })
  })

  it('a hold on the same tick: only clips at or before the hold start, those after start once after it', () => {
    const before = clip('before', 4.98, 1, false)
    const after = clip('after', 5.1, 1, false)
    const tick = advanceVoice([before, after], 4.95, 5, null)
    expect(tick.start.map((c) => c.id)).toEqual(['before'])
    const resumed = advanceVoice([before, after], tick.cursor, 5.25, null)
    expect(resumed.start.map((c) => c.id)).toEqual(['after'])
  })
})

describe('createFrameLoop', () => {
  it('uses requestVideoFrameCallback when the video has it, until onFrame returns false', () => {
    const callbacks: (() => void)[] = []
    const video = {
      requestVideoFrameCallback: vi.fn((cb: () => void) => callbacks.push(cb)),
      cancelVideoFrameCallback: vi.fn(),
    }
    let frames = 0
    const loop = createFrameLoop(video, () => ++frames < 3)
    loop.start()
    loop.start()
    expect(video.requestVideoFrameCallback).toHaveBeenCalledTimes(1)
    while (callbacks.length) callbacks.shift()!()
    expect(frames).toBe(3)
    expect(loop.running).toBe(false)
  })

  it('stop cancels the pending video frame callback', () => {
    const video = { requestVideoFrameCallback: vi.fn(() => 7), cancelVideoFrameCallback: vi.fn() }
    const loop = createFrameLoop(video, () => true)
    loop.start()
    loop.stop()
    expect(video.cancelVideoFrameCallback).toHaveBeenCalledWith(7)
    expect(loop.running).toBe(false)
  })

  it('falls back to requestAnimationFrame', () => {
    const raf = vi.spyOn(globalThis, 'requestAnimationFrame').mockImplementation(() => 3)
    const caf = vi.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation(() => {})
    const loop = createFrameLoop({}, () => true)
    loop.start()
    expect(raf).toHaveBeenCalledTimes(1)
    loop.stop()
    expect(caf).toHaveBeenCalledWith(3)
    raf.mockRestore()
    caf.mockRestore()
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
