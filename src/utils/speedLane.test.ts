import { describe, it, expect } from 'vitest'
import { formatSpeed } from './speedRegions'
import { deleteKeyTarget, dragSpeedRegion, rampFraction, type SpeedDragContext } from './speedLane'

const region = { id: 'a', start: 2, end: 4, speed: 0.5 }
const ctx: SpeedDragContext = { duration: 20, fps: 30, playhead: 10, pxPerSecond: 50, free: false }

describe('formatSpeed', () => {
  it('shows slow speeds as percentages and fast ones as multiples', () => {
    expect(formatSpeed(0.5)).toBe('50%')
    expect(formatSpeed(0.25)).toBe('25%')
    expect(formatSpeed(0.75)).toBe('75%')
    expect(formatSpeed(2)).toBe('2x')
    expect(formatSpeed(1.5)).toBe('1.5x')
  })
})

describe('dragSpeedRegion', () => {
  it('moves the body keeping the length, on whole frames', () => {
    const moved = dragSpeedRegion(region, 'move', 6.01, 0.5, ctx)
    expect(moved.end - moved.start).toBeCloseTo(2, 6)
    expect(Math.round(moved.start * 30)).toBeCloseTo(moved.start * 30, 6)
    expect(moved.start).toBeCloseTo(5.5, 1)
  })

  it('clamps a move inside the video', () => {
    expect(dragSpeedRegion(region, 'move', -5, 0, ctx).start).toBe(0)
    const late = dragSpeedRegion(region, 'move', 99, 0, ctx)
    expect(late.end).toBeLessThanOrEqual(20)
    expect(late.end - late.start).toBeCloseTo(2, 6)
  })

  it('snaps an edge to the playhead unless free', () => {
    expect(dragSpeedRegion(region, 'end', 10.02, 0, ctx).end).toBeCloseTo(10, 1)
    const free = dragSpeedRegion(region, 'end', 10.1, 0, { ...ctx, playhead: 10.05, free: true })
    expect(free.end).not.toBeCloseTo(10.05, 3)
  })

  it('keeps the minimum of 4 frames when an edge is pushed past the other', () => {
    const shortStart = dragSpeedRegion(region, 'start', 9, 0, ctx)
    expect(shortStart.end).toBe(4)
    expect(Math.round((shortStart.end - shortStart.start) * 30)).toBe(4)
    const shortEnd = dragSpeedRegion(region, 'end', 0, 0, ctx)
    expect(shortEnd.start).toBe(2)
    expect(Math.round((shortEnd.end - shortEnd.start) * 30)).toBe(4)
  })

  it('keeps the original region when no valid size exists', () => {
    const tiny = { id: 'a', start: 1, end: 1.1, speed: 0.5 }
    expect(dragSpeedRegion(tiny, 'move', 5, 0, ctx)).toEqual(tiny)
  })

  it('preserves id and speed', () => {
    const moved = dragSpeedRegion(region, 'move', 8, 1, ctx)
    expect(moved.id).toBe('a')
    expect(moved.speed).toBe(0.5)
  })
})

describe('rampFraction', () => {
  it('is the ramp length over the region, at most half', () => {
    expect(rampFraction({ start: 0, end: 5 })).toBeCloseTo(0.05, 6)
    expect(rampFraction({ start: 0, end: 0.4 })).toBe(0.5)
  })
})

describe('deleteKeyTarget', () => {
  const key = (k: string, tag = 'DIV', editable = false) => ({ key: k, tagName: tag, isContentEditable: editable })
  it('prefers the speed region over an annotation', () => {
    expect(deleteKeyTarget(key('Delete'), 's1', 'a1')).toBe('region')
    expect(deleteKeyTarget(key('Backspace'), null, 'a1')).toBe('annotation')
  })
  it('removes a selected voice clip, below a speed region', () => {
    expect(deleteKeyTarget(key('Delete'), null, 'a1', 'v1')).toBe('voice')
    expect(deleteKeyTarget(key('Delete'), 's1', null, 'v1')).toBe('region')
    expect(deleteKeyTarget(key('Delete', 'INPUT'), null, null, 'v1')).toBeNull()
  })
  it('does nothing without a selection or for other keys', () => {
    expect(deleteKeyTarget(key('Delete'), null, null)).toBeNull()
    expect(deleteKeyTarget(key('x'), 's1', 'a1')).toBeNull()
  })
  it('clears a selected speed region on Escape', () => {
    expect(deleteKeyTarget(key('Escape'), 's1', null)).toBe('deselect-region')
    expect(deleteKeyTarget(key('Escape'), null, 'a1')).toBeNull()
    expect(deleteKeyTarget(key('Escape', 'INPUT'), 's1', null)).toBeNull()
  })
  it('clears a selected voice clip on Escape', () => {
    expect(deleteKeyTarget(key('Escape'), null, null, 'v1')).toBe('deselect-voice')
    expect(deleteKeyTarget(key('Escape'), 's1', null, 'v1')).toBe('deselect-region')
  })
  it('never fires while typing', () => {
    expect(deleteKeyTarget(key('Delete', 'INPUT'), 's1', null)).toBeNull()
    expect(deleteKeyTarget(key('Backspace', 'TEXTAREA'), null, 'a1')).toBeNull()
    expect(deleteKeyTarget(key('Delete', 'SELECT'), 's1', null)).toBeNull()
    expect(deleteKeyTarget(key('Delete', 'DIV', true), 's1', null)).toBeNull()
  })
})
