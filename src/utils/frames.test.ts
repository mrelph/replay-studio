import { describe, it, expect } from 'vitest'
import { frameIndexAt, timeForFrame, stepFrames, snapToFrame, formatTimecode, nextForwardRate, nextReverseRate, frameStart, lastTimeInFrame } from './frames'

/** What Chromium reports after seeking to `target`: whole microseconds, truncated. */
const reported = (target: number) => Math.floor(target * 1e6) / 1e6

describe('frame math', () => {
  it('round-trips frame index through seek time at NTSC rates', () => {
    for (const fps of [23.976, 29.97, 30, 59.94, 60]) {
      for (const k of [0, 1, 2, 29, 30, 1799, 107892]) {
        expect(frameIndexAt(timeForFrame(k, fps), fps)).toBe(k)
      }
    }
  })

  it('steps whole frames from mid-frame positions', () => {
    const t = stepFrames(1.02, 1, 30, 100) // frame 30 → 31
    expect(frameIndexAt(t, 30)).toBe(31)
    expect(frameIndexAt(stepFrames(1.02, -1, 30, 100), 30)).toBe(29)
  })

  it('clamps to [0, duration]', () => {
    expect(stepFrames(0, -1, 30, 10)).toBe(0)
    expect(stepFrames(10, 5, 30, 10)).toBe(10)
  })

  it('formats timecode with frames in source fps', () => {
    expect(formatTimecode(0, 30)).toBe('00:00:00')
    expect(formatTimecode(timeForFrame(59, 30), 30)).toBe('00:01:29')
    expect(formatTimecode(timeForFrame(61, 60), 60)).toBe('00:01:01')
    expect(formatTimecode(125.5, 24)).toBe('02:05:12')
  })

  it('starts every second at :00 at 29.97 fps', () => {
    const fps = 30000 / 1001
    expect(formatTimecode(timeForFrame(29, fps), fps)).toBe('00:00:29')
    expect(formatTimecode(timeForFrame(30, fps), fps)).toBe('00:01:00')
    expect(formatTimecode(timeForFrame(31, fps), fps)).toBe('00:01:01')
    expect(formatTimecode(timeForFrame(89, fps), fps)).toBe('00:02:29')
    // 1 hour in: seconds track the wall clock rather than drifting 3.6 s.
    expect(formatTimecode(timeForFrame(107892, fps), fps)).toBe('59:59:29')
    expect(formatTimecode(timeForFrame(107893, fps), fps)).toBe('60:00:00')
  })
})

describe('JKL shuttle rates', () => {
  it('L starts at the base rate, then doubles to 8x', () => {
    expect(nextForwardRate('stopped', 1, 0.5)).toBe(0.5)
    expect(nextForwardRate('reverse', 4, 1)).toBe(1)
    expect(nextForwardRate('forward', 1, 1)).toBe(2)
    expect(nextForwardRate('forward', 8, 1)).toBe(8)
  })

  it('J starts reverse at 1x, then doubles to 8x', () => {
    expect(nextReverseRate('forward', 2)).toBe(1)
    expect(nextReverseRate('reverse', 1)).toBe(2)
    expect(nextReverseRate('reverse', 8)).toBe(8)
  })
})

describe('snapToFrame', () => {
  it('moves a mid-frame time back to the start of its frame', () => {
    expect(frameIndexAt(snapToFrame(3.0569, 30), 30)).toBe(91)
    expect(snapToFrame(3.0569, 30)).toBeLessThan(3.0569)
    expect(snapToFrame(0.01, 30)).toBe(0)
  })
})

describe('frameStart / lastTimeInFrame', () => {
  const rates = [30, 30000 / 1001, 25, 60]
  const frames = [1, 7, 91, 300, 1799]

  it('frameStart is the exact frame start and still maps back to its frame', () => {
    expect(frameStart(91, 30)).toBe(91 / 30)
    expect(frameStart(0, 30)).toBe(0)
    for (const fps of rates) for (const k of frames) expect(frameIndexAt(frameStart(k, fps), fps)).toBe(k)
  })

  it('every time the video reports for a frame lies in [frameStart, lastTimeInFrame]', () => {
    for (const fps of rates) {
      for (const k of frames) {
        const t = reported(timeForFrame(k, fps))
        expect(t).toBeGreaterThanOrEqual(frameStart(k, fps))
        expect(t).toBeLessThanOrEqual(lastTimeInFrame(k, fps))
        expect(reported(timeForFrame(k + 1, fps))).toBeGreaterThan(lastTimeInFrame(k, fps))
      }
    }
  })
})
