import { describe, it, expect } from 'vitest'
import { normalizeRegion, placeSpeedRegion, sanitizeSpeedRegions } from './speedRegions'

const r = (id: string, start: number, end: number, speed = 0.5) => ({ id, start, end, speed })
const span = (list: { start: number; end: number; speed: number }[]) => list.map((x) => [x.start, x.end, x.speed])

describe('placeSpeedRegion', () => {
  it('adds to an empty list', () => {
    expect(placeSpeedRegion([], r('a', 2, 4), 20, 30)).toEqual([r('a', 2, 4)])
  })

  it('splits a region that contains the new one', () => {
    const out = placeSpeedRegion([r('a', 2, 8)], r('b', 4, 6, 0.25), 20, 30)
    expect(span(out)).toEqual([[2, 4, 0.5], [4, 6, 0.25], [6, 8, 0.5]])
    expect(new Set(out.map((x) => x.id)).size).toBe(3)
  })

  it('removes covered regions and trims partial overlaps', () => {
    expect(placeSpeedRegion([r('a', 3, 4)], r('b', 2, 5), 20, 30).map((x) => x.id)).toEqual(['b'])
    expect(placeSpeedRegion([r('a', 2, 5)], r('b', 4, 7), 20, 30).map((x) => [x.start, x.end])).toEqual([[2, 4], [4, 7]])
  })

  it('drops remnants under 0.1 s', () => {
    expect(placeSpeedRegion([r('a', 2, 5)], r('b', 2.05, 7), 20, 30).map((x) => x.id)).toEqual(['b'])
  })

  it('does not collide a moved region with itself', () => {
    expect(placeSpeedRegion([r('a', 2, 4)], r('a', 3, 5), 20, 30)).toEqual([r('a', 3, 5)])
  })

  it('leaves the list alone when the region is too short', () => {
    const list = [r('a', 2, 4)]
    expect(placeSpeedRegion(list, r('b', 6, 6.05), 20, 30)).toEqual(list)
  })
})

describe('normalizeRegion', () => {
  it('rejects regions under 4 frames', () => {
    expect(normalizeRegion(r('a', 2.011, 2.05), 20, 30)).toBeNull()
  })

  it('clamps to the video and snaps to frame starts', () => {
    expect(normalizeRegion(r('a', -1, 25), 20, 30)).toMatchObject({ start: 0, end: 20 })
    expect(normalizeRegion(r('a', 1.01, 2.02), 20, 30)).toMatchObject({ start: 1, end: 2 })
  })
})

describe('sanitizeSpeedRegions', () => {
  it('returns [] for non-arrays', () => {
    expect(sanitizeSpeedRegions('nope', 20, 30)).toEqual([])
  })

  it('drops malformed entries, clamps speeds and lets earlier entries win overlaps', () => {
    const out = sanitizeSpeedRegions(
      [{ id: 'a', start: 2, end: 4, speed: 100 }, { start: NaN, end: 1 }, null, r('b', 5, 4), r('c', 3, 6, 0)],
      20,
      30,
    )
    expect(out.map((x) => [x.id, x.start, x.end, x.speed])).toEqual([['a', 2, 4, 4], ['c', 4, 6, 0.1]])
  })

  it('keeps the larger gap when an earlier entry splits a later one', () => {
    const out = sanitizeSpeedRegions([r('a', 4, 5), r('b', 2, 9)], 20, 30)
    expect(out.map((x) => [x.id, x.start, x.end])).toEqual([['b', 5, 9], ['a', 4, 5]].sort((x, y) => (x[1] as number) - (y[1] as number)))
  })

  it('sorts the result and gives duplicate or missing ids fresh ones', () => {
    const out = sanitizeSpeedRegions([r('a', 6, 8), { start: 1, end: 3, speed: 0.5 }, r('a', 10, 12)], 20, 30)
    expect(out.map((x) => x.start)).toEqual([1, 6, 10])
    expect(new Set(out.map((x) => x.id)).size).toBe(3)
  })
})
