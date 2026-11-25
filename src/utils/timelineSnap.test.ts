import { describe, it, expect } from 'vitest'
import { snapTime, snapTargets, freezeFieldState } from './timelineSnap'
import { snapToFrame } from './frames'
import type { Annotation } from '@/stores/drawingStore'

const ann = (id: string, startTime: number, extra: Partial<Annotation> = {}): Annotation =>
  ({ id, startTime, endTime: startTime + 1, layer: 1, toolType: id.split('-')[0], object: {} as never, ...extra })

describe('snapTime', () => {
  it('snaps to a target within 6 px', () => {
    expect(snapTime(3.05, [3.0], 100, 30, false)).toBeCloseTo(snapToFrame(3.0, 30))
  })
  it('does not snap to targets when free', () => {
    expect(snapTime(3.05, [3.0], 100, 30, true)).toBeCloseTo(snapToFrame(3.05, 30))
  })
  it('ignores targets out of reach', () => {
    expect(snapTime(3.2, [3.0], 100, 30, false)).toBeCloseTo(snapToFrame(3.2, 30))
  })
  it('picks the nearest target', () => {
    expect(snapTime(3.05, [3.0, 3.06], 100, 30, false)).toBeCloseTo(snapToFrame(3.06, 30))
  })
  it('never goes below 0', () => {
    expect(snapTime(-0.2, [], 100, 30, false)).toBe(0)
  })
})

describe('snapTargets', () => {
  it('has the playhead and holding frames, not the dragged one or zero holds', () => {
    const list = [ann('freeze-1', 2, { freezeDuration: 1 }), ann('freeze-2', 4, { freezeDuration: 0 }), ann('freeze-3', 6, { freezeDuration: 2 }), ann('path-1', 8)]
    expect(snapTargets(list, 1, 'freeze-3')).toEqual([1, 2])
  })
})

describe('freezeFieldState', () => {
  it('shows 0 and an Auto button for a drawing with no freeze', () => {
    expect(freezeFieldState([ann('path-1', 2)], 2, 30)).toEqual({ seconds: 0, isAuto: false, showAutoButton: true })
  })
  it('shows the label, not the button, for an automatic freeze', () => {
    const list = [ann('path-1', 2), ann('freeze-1', 2, { freezeDuration: 1.5, freezeAuto: true })]
    expect(freezeFieldState(list, 2, 30)).toEqual({ seconds: 1.5, isAuto: true, showAutoButton: false })
  })
  it('keeps the button for a hand-set hold, including 0', () => {
    const list = [ann('path-1', 2), ann('freeze-1', 2, { freezeDuration: 0, freezeAuto: false })]
    expect(freezeFieldState(list, 2, 30)).toEqual({ seconds: 0, isAuto: false, showAutoButton: true })
  })
  it('hides the button on a lone marker with no drawings', () => {
    expect(freezeFieldState([ann('freeze-1', 2, { freezeDuration: 3 })], 2, 30).showAutoButton).toBe(false)
  })
})
