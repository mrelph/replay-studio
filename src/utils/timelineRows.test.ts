import { describe, it, expect } from 'vitest'
import { assignRows, rowCount, autoLaneHeight, hiddenRowsBelow } from './timelineRows'

const item = (id: string, startTime: number, endTime: number) => ({ id, startTime, endTime })

describe('assignRows', () => {
  it('puts overlapping items on separate rows', () => {
    const rows = assignRows([item('a', 1, 3), item('b', 2, 4)], 0.1)
    expect(rows.get('a')).toBe(0)
    expect(rows.get('b')).toBe(1)
  })

  it('lets touching items share a row', () => {
    const rows = assignRows([item('a', 1, 2), item('b', 2, 3)], 0.1)
    expect(rows.get('a')).toBe(0)
    expect(rows.get('b')).toBe(0)
  })

  it('stacks zero-length items on the same frame using the minimum span', () => {
    const rows = assignRows([item('a', 5, 5), item('b', 5, 5), item('c', 5, 5)], 0.1)
    expect([rows.get('a'), rows.get('b'), rows.get('c')]).toEqual([0, 1, 2])
  })

  it('reuses the lowest freed row', () => {
    const rows = assignRows([item('a', 0, 10), item('b', 1, 2), item('c', 3, 4)], 0.1)
    expect([rows.get('a'), rows.get('b'), rows.get('c')]).toEqual([0, 1, 1])
  })

  it('does not depend on input order for different start times', () => {
    const forward = assignRows([item('a', 0, 10), item('b', 1, 2), item('c', 3, 4)], 0.1)
    const shuffled = assignRows([item('c', 3, 4), item('a', 0, 10), item('b', 1, 2)], 0.1)
    expect(shuffled).toEqual(forward)
  })

  it('keeps input order for equal start times', () => {
    const rows = assignRows([item('x', 2, 4), item('y', 2, 4)], 0.1)
    expect(rows.get('x')).toBe(0)
    expect(rows.get('y')).toBe(1)
  })

  it('never wraps: overlapping items each get their own row', () => {
    const items = Array.from({ length: 8 }, (_, i) => item(`i${i}`, i, 20))
    const rows = assignRows(items, 0.1)
    expect(items.map((it) => rows.get(it.id))).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  })
})

describe('rowCount', () => {
  it('is 0 for an empty map', () => {
    expect(rowCount(new Map())).toBe(0)
  })

  it('is the highest row plus one', () => {
    expect(rowCount(new Map([['a', 0], ['b', 2]]))).toBe(3)
  })
})

describe('autoLaneHeight', () => {
  it('fits the rows plus padding', () => {
    expect(autoLaneHeight(3, 32)).toBe(124)
  })

  it('never goes below the default height', () => {
    expect(autoLaneHeight(0, 32)).toBe(96)
  })

  it('caps at 8 visible rows', () => {
    expect(autoLaneHeight(10, 48)).toBe(280)
  })
})

describe('hiddenRowsBelow', () => {
  it('counts rows cut off at the bottom', () => {
    expect(hiddenRowsBelow(0, 232, 10)).toBe(2)
  })

  it('is 0 when scrolled to the bottom', () => {
    expect(hiddenRowsBelow(56, 232, 10)).toBe(0)
  })

  it('is 0 when everything fits', () => {
    expect(hiddenRowsBelow(0, 232, 3)).toBe(0)
  })
})
