import { describe, it, expect } from 'vitest'
import { zoneClick, zoneKey, zonePathData } from './zoneGeometry'

const sq = [{ x: 10, y: 10 }, { x: 50, y: 10 }, { x: 50, y: 40 }]

describe('zonePathData', () => {
  it('closes the corners into one path', () => {
    expect(zonePathData(sq)).toBe('M 10 10 L 50 10 L 50 40 Z')
  })
})

describe('zoneClick', () => {
  it('finishes on a click near the first corner once there are 3 corners', () => {
    expect(zoneClick(sq, { x: 14, y: 13 })).toEqual({ type: 'finish' })
    expect(zoneClick(sq.slice(0, 2), { x: 14, y: 13 })).toEqual({ type: 'add', point: { x: 14, y: 13 } })
  })

  it('ignores a duplicate of the last corner (the second click of a double-click)', () => {
    expect(zoneClick(sq, { x: 51, y: 41 })).toEqual({ type: 'ignore' })
    expect(zoneClick(sq.slice(0, 1), { x: 10, y: 10 })).toEqual({ type: 'ignore' })
  })

  it('measures both distances in display pixels at the given zoom', () => {
    const corner = { x: 100, y: 100 }
    const tri = [corner, { x: 300, y: 100 }, { x: 300, y: 300 }]
    expect(zoneClick(tri, { x: 120, y: 100 }, 0.4)).toEqual({ type: 'finish' })
    expect(zoneClick(tri, { x: 125, y: 100 }, 0.4)).toEqual({ type: 'finish' })
    expect(zoneClick(tri, { x: 126, y: 100 }, 0.4)).toEqual({ type: 'add', point: { x: 126, y: 100 } })
    expect(zoneClick(tri, { x: 304, y: 300 }, 0.4)).toEqual({ type: 'ignore' })
    expect(zoneClick(tri, { x: 305, y: 300 }, 0.4)).toEqual({ type: 'ignore' })
    expect(zoneClick(tri, { x: 306, y: 300 }, 0.4)).toEqual({ type: 'add', point: { x: 306, y: 300 } })
    expect(zoneClick(tri, { x: 111, y: 100 })).toEqual({ type: 'add', point: { x: 111, y: 100 } })
    expect(zoneClick(tri, { x: 303, y: 300 })).toEqual({ type: 'add', point: { x: 303, y: 300 } })
  })

  it('adds any other click as a corner', () => {
    expect(zoneClick(sq, { x: 90, y: 90 })).toEqual({ type: 'add', point: { x: 90, y: 90 } })
    expect(zoneClick([], { x: 10, y: 10 })).toEqual({ type: 'add', point: { x: 10, y: 10 } })
  })
})

describe('zoneKey', () => {
  it('passes every key while there are no corners', () => {
    expect(zoneKey(0, 'Escape')).toBe('pass')
    expect(zoneKey(0, ' ')).toBe('pass')
    expect(zoneKey(0, 'Enter')).toBe('pass')
  })

  it('handles Enter, Escape and Backspace/Delete, and swallows the rest', () => {
    expect(zoneKey(2, 'Enter')).toBe('finish')
    expect(zoneKey(2, 'Escape')).toBe('cancel')
    expect(zoneKey(2, 'Backspace')).toBe('undo-corner')
    expect(zoneKey(2, 'Delete')).toBe('undo-corner')
    expect(zoneKey(2, ' ')).toBe('swallow')
    expect(zoneKey(2, '3')).toBe('swallow')
    expect(zoneKey(2, 'v')).toBe('swallow')
  })
})
