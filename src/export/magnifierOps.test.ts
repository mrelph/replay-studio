import { describe, it, expect } from 'vitest'
import { buildMagnifierOps, type MagnifierAnnotationLike } from './magnifierOps'
import type { OutputSegment, VideoProbe } from '@/types/clip'

const PROBE: Pick<VideoProbe, 'width' | 'height'> = { width: 1920, height: 1080 }

function magnifier(overrides: Partial<MagnifierAnnotationLike> = {}): MagnifierAnnotationLike {
  return {
    id: 'mag-1',
    startTime: 0,
    endTime: 10,
    circle: { left: 100, top: 100, radius: 50 },
    ...overrides,
  }
}

describe('buildMagnifierOps', () => {
  it('maps a magnifier visible throughout a single play segment to one enable window covering the whole clip', () => {
    const segments: OutputSegment[] = [{ kind: 'play', srcStart: 0, srcEnd: 10 }]
    const ops = buildMagnifierOps({ start: 0, end: 10 }, segments, [magnifier()], 30, PROBE)

    expect(ops).toHaveLength(1)
    expect(ops[0].enable).toEqual([{ start: 0, end: 10 }])
    // Source rect / dest circle come straight from computeMagnifierSampleRect / the circle geometry.
    expect(ops[0].destCircle).toEqual({ centerX: 150, centerY: 150, radius: 50 })
    expect(ops[0].sourceRect.width).toBeCloseTo(40, 5) // size(100)/zoom(2.5)
  })

  it('maps a magnifier only visible in part of a play segment to a proportionally-scaled output window', () => {
    const segments: OutputSegment[] = [{ kind: 'play', srcStart: 0, srcEnd: 10 }]
    const ops = buildMagnifierOps(
      { start: 0, end: 10 },
      segments,
      [magnifier({ startTime: 2, endTime: 5 })],
      30,
      PROBE
    )
    expect(ops).toHaveLength(1)
    expect(ops[0].enable).toEqual([{ start: 2, end: 5 }])
  })

  it('fixture: a magnifier spanning a hold is enabled for the hold\'s entire output-time duration', () => {
    const segments: OutputSegment[] = [
      { kind: 'play', srcStart: 0, srcEnd: 2 },
      { kind: 'hold', srcTime: 2, duration: 1 },
      { kind: 'play', srcStart: 2, srcEnd: 4 },
    ]
    // Visible window [1.5, 2.5] straddles the hold's srcTime (2) -> hold contributes
    // its whole output-time range (2s to 3s, since the first play segment is [0,2)).
    const ops = buildMagnifierOps(
      { start: 0, end: 4 },
      segments,
      [magnifier({ startTime: 1.5, endTime: 2.5 })],
      10,
      PROBE
    )
    expect(ops).toHaveLength(1)
    // Windows: partial overlap of play[0,2) -> [1.5,2), full hold -> [2,3), partial overlap of play[2,4) -> [3,3.5).
    expect(ops[0].enable).toEqual([
      { start: 1.5, end: 2 },
      { start: 2, end: 3 },
      { start: 3, end: 3.5 },
    ])
  })

  it('a magnifier never visible during the clip is omitted', () => {
    const segments: OutputSegment[] = [{ kind: 'play', srcStart: 0, srcEnd: 10 }]
    const ops = buildMagnifierOps(
      { start: 0, end: 10 },
      segments,
      [magnifier({ startTime: 20, endTime: 25 })],
      30,
      PROBE
    )
    expect(ops).toEqual([])
  })

  it('clamps a magnifier visible window to the clip range', () => {
    const segments: OutputSegment[] = [{ kind: 'play', srcStart: 2, srcEnd: 8 }]
    const ops = buildMagnifierOps(
      { start: 2, end: 8 },
      segments,
      [magnifier({ startTime: 0, endTime: 100 })],
      30,
      PROBE
    )
    expect(ops).toHaveLength(1)
    expect(ops[0].enable).toEqual([{ start: 0, end: 6 }])
  })

  it('handles multiple magnifiers independently', () => {
    const segments: OutputSegment[] = [{ kind: 'play', srcStart: 0, srcEnd: 10 }]
    const ops = buildMagnifierOps(
      { start: 0, end: 10 },
      segments,
      [
        magnifier({ id: 'a', startTime: 0, endTime: 3, circle: { left: 0, top: 0, radius: 20 } }),
        magnifier({ id: 'b', startTime: 5, endTime: 8, circle: { left: 500, top: 500, radius: 30 } }),
      ],
      30,
      PROBE
    )
    expect(ops).toHaveLength(2)
    expect(ops[0].enable).toEqual([{ start: 0, end: 3 }])
    expect(ops[1].enable).toEqual([{ start: 5, end: 8 }])
    expect(ops[1].destCircle).toEqual({ centerX: 530, centerY: 530, radius: 30 })
  })
})
