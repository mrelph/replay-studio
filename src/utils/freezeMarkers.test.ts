import { describe, it, expect } from 'vitest'
import { recordedHold, findFreezeAt, MAX_RECORDED_HOLD_SECONDS } from './freezeMarkers'
import type { Annotation } from '@/stores/drawingStore'
import { timeForFrame } from './frames'

describe('recordedHold', () => {
  it('records the paused time, rounded to 0.1 s', () => {
    expect(recordedHold(10, 10, 2.34)).toEqual({ record: true, seconds: 2.3, capped: false })
  })

  it('still records after frame-stepping a little while paused', () => {
    expect(recordedHold(10, 10.3, 1.5).record).toBe(true)
  })

  it('ignores a pause where the coach scrubbed away', () => {
    expect(recordedHold(10, 25, 4)).toEqual({ record: false, reason: 'moved' })
    expect(recordedHold(10, 5, 4)).toEqual({ record: false, reason: 'moved' })
    expect(recordedHold(10, 9, 4)).toEqual({ record: false, reason: 'moved' })
  })

  it('ignores a double-tap', () => {
    expect(recordedHold(10, 10, 0.2)).toEqual({ record: false, reason: 'too-short' })
  })

  it('caps very long pauses', () => {
    expect(recordedHold(10, 10, 240)).toEqual({ record: true, seconds: MAX_RECORDED_HOLD_SECONDS, capped: true })
  })
})

describe('findFreezeAt', () => {
  const ann = (id: string, startTime: number, freezeDuration?: number) =>
    ({ id, startTime, freezeDuration, endTime: startTime + 1, layer: 1, toolType: 'freeze' }) as unknown as Annotation

  it('matches by frame, not exact float time', () => {
    const fps = 30000 / 1001
    const list = [ann('a', timeForFrame(31, fps), 2), ann('b', 5, 3)]
    expect(findFreezeAt(list, 31.6 / fps, fps)?.id).toBe('a') // later in the same frame
    expect(findFreezeAt(list, 32.2 / fps, fps)).toBeUndefined() // next frame
  })

  it('ignores annotations without a freeze', () => {
    expect(findFreezeAt([ann('a', 5)], 5, 30)).toBeUndefined()
  })
})
