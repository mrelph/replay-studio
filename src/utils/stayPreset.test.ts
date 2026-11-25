import { describe, it, expect } from 'vitest'
import { stayTiming, STAY_PRESETS, STAY_TOOL_TYPES } from './stayPreset'
import { annotationStateAt } from '@/export/annotationTiming'
import { frameStart, timeForFrame } from './frames'

const d = { fadeIn: 0.1, fadeOut: 0.1 }

describe('stayTiming', () => {
  it('N seconds keeps the tool fades and clamps to the video', () => {
    expect(stayTiming(2, 3, 60, 30, d)).toEqual({ endTime: 5, fadeIn: 0.1, fadeOut: 0.1 })
    expect(stayTiming(4, 58, 60, 30, d).endTime).toBe(60)
  })

  it('To end runs to the video duration', () => {
    expect(stayTiming('end', 3, 60, 30, d).endTime).toBe(60)
  })

  it('Freeze only is visible on its own frame and gone on the next, with no fades', () => {
    const f = stayTiming('freeze', 3, 60, 30, d)
    expect(f.fadeIn).toBe(0)
    expect(f.fadeOut).toBe(0)
    expect(f.endTime).toBeGreaterThan(3)
    expect(f.endTime).toBeLessThan(3 + 1 / 30)
    expect(annotationStateAt({ startTime: 3, ...f }, 3)).toEqual({ visible: true, opacity: 1 })
    expect(annotationStateAt({ startTime: 3, ...f }, 3 + 1 / 30).visible).toBe(false)
  })

  it('Freeze only covers its whole frame and ends just before the next frame starts', () => {
    for (const fps of [30, 30000 / 1001, 25, 60]) {
      const start = frameStart(60, fps)
      const f = stayTiming('freeze', start, 60, fps, d)
      expect(f.endTime).toBeLessThan(frameStart(61, fps))
      // An unsnapped 1.7.0 H marker later in the frame still shows the drawing.
      expect(annotationStateAt({ startTime: start, ...f }, start + 0.75 / fps).visible).toBe(true)
      expect(annotationStateAt({ startTime: start, ...f }, Math.floor(timeForFrame(60, fps) * 1e6) / 1e6).visible).toBe(true)
      expect(annotationStateAt({ startTime: start, ...f }, Math.floor(timeForFrame(61, fps) * 1e6) / 1e6).visible).toBe(false)
    }
    expect(annotationStateAt({ startTime: 2, ...stayTiming('freeze', 2, 60, 30, d) }, 2.025).visible).toBe(true)
  })

  it('Freeze only clamps to the video when the frame ends past it', () => {
    expect(stayTiming('freeze', 59.99, 59.995, 30, d).endTime).toBe(59.995)
    expect(stayTiming('freeze', 2, 0, 30, d).endTime).toBeGreaterThan(2)
  })

  it('Freeze only on the last frame stays visible on it', () => {
    const last = stayTiming('freeze', 60, 60, 30, d)
    expect(last.endTime).toBeGreaterThan(60 - 1e-9)
    expect(annotationStateAt({ startTime: 60, ...last }, 60).visible).toBe(true)
  })

  it('exposes the chips and tool set', () => {
    expect(STAY_PRESETS.map((p) => p.label)).toEqual(['Freeze only', '1s', '2s', '4s', 'To end'])
    expect(STAY_TOOL_TYPES.has('path')).toBe(true)
    expect(STAY_TOOL_TYPES.has('tracker')).toBe(false)
  })
})
