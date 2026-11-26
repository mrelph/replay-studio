import { describe, it, expect } from 'vitest'
import type { OutputSegment } from '@/types/clip'
import type { VoiceClip } from '@/types/voice'
import { buildOutputTimeline } from './outputTimeline'
import { alignVoiceToCarriers, buildVoiceMix, placeVoice, voiceLimitError, withVoiceFreezes } from './voiceMix'

const voice = (id: string, startTime: number, duration: number, frozen: boolean): VoiceClip => ({
  id, startTime, duration, frozen, mime: 'audio/webm',
})

describe('timeline holds from frozen voice clips', () => {
  const carrier = { startTime: 3, freezeDuration: 1, toolType: 'freeze' }

  it('a frozen 3 s clip on a frame with a 1 s freeze yields one 3 s hold', () => {
    const entries = withVoiceFreezes([carrier], [voice('v', 3.01, 3, true)], 30)
    const { segments } = buildOutputTimeline({ start: 0, end: 10 }, entries, 30)
    expect(segments).toEqual([
      { kind: 'play', srcStart: 0, srcEnd: 3 },
      { kind: 'hold', srcTime: 3, duration: 3 },
      { kind: 'play', srcStart: 3, srcEnd: 10 },
    ])
  })

  it('a frozen clip with no carrier creates its own hold', () => {
    const { segments } = buildOutputTimeline({ start: 0, end: 10 }, withVoiceFreezes([], [voice('v', 5, 2, true)], 30), 30)
    expect(segments).toContainEqual({ kind: 'hold', srcTime: 5, duration: 2 })
  })

  it('with no voice clips the segments are the same as without voice', () => {
    const annotations = [carrier, { startTime: 6, freezeDuration: 0.5 }]
    const clip = { start: 1, end: 9 }
    expect(buildOutputTimeline(clip, withVoiceFreezes(annotations, [], 30), 30)).toEqual(buildOutputTimeline(clip, annotations, 30))
  })

  it('moves only frozen clips onto their frame\'s carrier', () => {
    const clips = [voice('a', 3.01, 2, true), voice('b', 3.01, 2, false), voice('c', 7, 2, true)]
    expect(alignVoiceToCarriers([carrier], clips, 30).map((c) => c.startTime)).toEqual([3, 3.01, 7])
  })
})

describe('placeVoice', () => {
  it('puts a frozen clip at the start of its hold', () => {
    const { segments } = buildOutputTimeline(
      { start: 0, end: 10 },
      withVoiceFreezes([{ startTime: 2, freezeDuration: 1 }], [voice('v', 4, 2, true)], 30),
      30,
    )
    expect(placeVoice(segments, { start: 0, end: 10 }, [voice('v', 4, 2, true)], 30)).toEqual([
      { id: 'v', outStart: 5, duration: 2, duck: false },
    ])
  })

  it('finds the hold by frame, not by exact time', () => {
    const segments: OutputSegment[] = [
      { kind: 'play', srcStart: 0, srcEnd: 2 },
      { kind: 'hold', srcTime: 2, duration: 1.5 },
      { kind: 'play', srcStart: 2, srcEnd: 4 },
    ]
    expect(placeVoice(segments, { start: 0, end: 4 }, [voice('v', 2.02, 1, true)], 30)[0].outStart).toBe(2)
  })

  it('places a playing clip after the holds before it', () => {
    const { segments } = buildOutputTimeline({ start: 2, end: 10 }, [{ startTime: 3, freezeDuration: 2 }], 30)
    expect(placeVoice(segments, { start: 2, end: 10 }, [voice('v', 4, 1, false)], 30)).toEqual([
      { id: 'v', outStart: 4, duration: 1, duck: true },
    ])
  })

  it('doubles the source offset inside a 0.5x segment', () => {
    const segments: OutputSegment[] = [
      { kind: 'play', srcStart: 0, srcEnd: 2 },
      { kind: 'play', srcStart: 2, srcEnd: 4, speed: 0.5 },
      { kind: 'play', srcStart: 4, srcEnd: 10 },
    ]
    expect(placeVoice(segments, { start: 0, end: 10 }, [voice('v', 3, 1, false)], 30)[0].outStart).toBe(4)
  })

  it('leaves out clips starting before the clip or at its end', () => {
    const clip = { start: 2, end: 6 }
    const { segments } = buildOutputTimeline(clip, [], 30)
    const placed = placeVoice(segments, clip, [voice('early', 1.9, 1, false), voice('end', 6, 1, false), voice('in', 2, 1, false)], 30)
    expect(placed.map((p) => p.id)).toEqual(['in'])
  })

  it('cuts the duration at the output end and drops a clip left too short', () => {
    const clip = { start: 0, end: 5 }
    const { segments } = buildOutputTimeline(clip, [], 30)
    const placed = placeVoice(segments, clip, [voice('cut', 4, 3, false), voice('short', 4.97, 1, false)], 30)
    expect(placed).toHaveLength(1)
    expect(placed[0].id).toBe('cut')
    expect(placed[0].duration).toBeCloseTo(1, 9)
  })
})

describe('voiceLimitError', () => {
  it('allows 40 clips in a clip and refuses 41', () => {
    const clips = (n: number) => Array.from({ length: n }, (_, i) => voice(`v${i}`, i * 0.5, 0.4, false))
    expect(voiceLimitError({ start: 0, end: 30 }, clips(40))).toBeNull()
    expect(voiceLimitError({ start: 0, end: 30 }, clips(41))).toBe('Too many voice clips in this clip (max 40)')
    expect(voiceLimitError({ start: 25, end: 30 }, clips(41))).toBeNull()
  })
})

describe('buildVoiceMix', () => {
  // jsdom's Blob has no arrayBuffer().
  const blob = { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer } as unknown as Blob

  it('is undefined when no placement has audio', async () => {
    expect(await buildVoiceMix([], 'low')).toBeUndefined()
    expect(await buildVoiceMix([{ id: 'x', outStart: 0, duration: 1, duck: true }], 'low', () => undefined)).toBeUndefined()
  })

  it('carries the audio bytes and ducks only under playing clips', async () => {
    const mix = await buildVoiceMix(
      [
        { id: 'a', outStart: 1, duration: 2, duck: true },
        { id: 'b', outStart: 5, duration: 1, duck: false },
        { id: 'c', outStart: 2.5, duration: 1, duck: true },
      ],
      'low',
      () => blob,
    )
    expect(mix?.tracks.map((t) => [Array.from(t.data), t.outStart, t.duration])).toEqual([
      [[1, 2, 3], 1, 2],
      [[1, 2, 3], 5, 1],
      [[1, 2, 3], 2.5, 1],
    ])
    expect(mix?.duckWindows).toEqual([{ start: 1, end: 3.5 }])
    expect(mix?.duckGain).toBe(0.25)
    expect((await buildVoiceMix([{ id: 'a', outStart: 0, duration: 1, duck: true }], 'off', () => blob))?.duckGain).toBe(0)
  })
})
