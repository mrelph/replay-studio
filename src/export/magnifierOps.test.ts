import { describe, it, expect } from 'vitest'
import { buildMagnifierOps, type MagnifierAnnotationLike } from './magnifierOps'
import { buildDrawingSpans } from './spanBuilder'
import type { OutputSegment, VideoProbe } from '@/types/clip'
import { buildOutputTimeline } from './outputTimeline'
import { buildSpeedSteps, presentationOffset } from './speedMap'

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

describe('buildMagnifierOps with revealDelay', () => {
  const HELD: OutputSegment[] = [
    { kind: 'play', srcStart: 2.9, srcEnd: 3.0 },
    { kind: 'hold', srcTime: 3.0, duration: 2.3 },
    { kind: 'play', srcStart: 3.0, srcEnd: 4.0 },
  ]

  it('starts the zoom on the frame its ring appears, not before', () => {
    const mag = magnifier({ startTime: 3, endTime: 5, revealDelay: 0.35 })
    const ops = buildMagnifierOps({ start: 2.9, end: 4.0 }, HELD, [mag], 30, PROBE, undefined, 30)
    const ring = buildDrawingSpans(HELD, [{ ...mag, toolType: 'magnifier' }], 30, { sourceFps: 30 }).find((s) => s.signature.length > 0)!
    expect(ring.frameStart).toBe(3 + 11)
    expect(ops).toHaveLength(1)
    expect(ops[0].enable[0].start).toBeCloseTo(ring.frameStart / 30, 9)
    for (const w of ops[0].enable) expect(w.start).toBeGreaterThanOrEqual(ring.frameStart / 30 - 1e-9)
    expect(ops[0].enable[ops[0].enable.length - 1].end).toBeCloseTo((3 + 69 + 30) / 30, 9)
  })

  it('omits a magnifier that never becomes due in the clip', () => {
    const mag = magnifier({ startTime: 3, endTime: 5, revealDelay: 2 })
    expect(buildMagnifierOps({ start: 2.9, end: 4.0 }, [{ kind: 'play', srcStart: 2.9, srcEnd: 4.0 }], [mag], 30, PROBE)).toEqual([])
  })

  it('leaves a magnifier without revealDelay exactly as before', () => {
    const segments: OutputSegment[] = [
      { kind: 'play', srcStart: 0, srcEnd: 2 },
      { kind: 'hold', srcTime: 2, duration: 1 },
      { kind: 'play', srcStart: 2, srcEnd: 4 },
    ]
    const expected = [
      { start: 1.5, end: 2 },
      { start: 2, end: 3 },
      { start: 3, end: 3.5 },
    ]
    for (const revealDelay of [undefined, 0]) {
      const ops = buildMagnifierOps({ start: 0, end: 4 }, segments, [magnifier({ startTime: 1.5, endTime: 2.5, revealDelay })], 10, PROBE)
      expect(ops[0].enable).toEqual(expected)
    }
  })
})

describe('buildMagnifierOps in a clip from 0', () => {
  it('starts the zoom on the output frame its ring appears, for a magnifier on an exact frame start', () => {
    const fps = 25
    const segments: OutputSegment[] = [{ kind: 'play', srcStart: 0, srcEnd: 10 }]
    for (const revealDelay of [undefined, 0.2]) {
      const mag = magnifier({ startTime: 11 / fps, endTime: 11 / fps + 2, revealDelay })
      const ops = buildMagnifierOps({ start: 0, end: 10 }, segments, [mag], fps, PROBE, undefined, fps)
      const ring = buildDrawingSpans(segments, [{ ...mag, toolType: 'magnifier' }], fps, { sourceFps: fps }).find((s) => s.signature.length > 0)!
      expect(ring.frameStart).toBe(revealDelay ? 16 : 11)
      expect(ops[0].enable[0].start).toBeLessThanOrEqual(ring.frameStart / fps + 1e-9)
      expect(ops[0].enable[0].start).toBeGreaterThan((ring.frameStart - 1) / fps)
    }
  })
})

describe('buildMagnifierOps in a slow-motion region', () => {
  const fps = 30
  const steps = buildSpeedSteps([{ start: 2, end: 4, speed: 0.5 }], 10, fps)
  const clip = { start: 1, end: 5 }
  const { segments } = buildOutputTimeline(clip, [], fps, steps)

  it('stretches the zoom by the region speed, as one window', () => {
    const [inside] = buildMagnifierOps(clip, segments, [magnifier({ startTime: 2.5, endTime: 3.5 })], fps, PROBE, undefined, fps, steps)
    expect(inside.enable).toHaveLength(1)
    expect(Math.abs(inside.enable[0].end - inside.enable[0].start - 2)).toBeLessThanOrEqual(1 / fps + 1e-9)

    const [across] = buildMagnifierOps(clip, segments, [magnifier({ startTime: 1.5, endTime: 4.5 })], fps, PROBE, undefined, fps, steps)
    expect(across.enable).toHaveLength(1)
    expect(across.enable[0].end - across.enable[0].start).toBeCloseTo(1 + presentationOffset(steps, 2, 4), 1)
  })

  it('starts a delayed zoom on the frame its ring appears', () => {
    const mag = magnifier({ startTime: 3, endTime: 3.6, revealDelay: 0.35 })
    const [op] = buildMagnifierOps(clip, segments, [mag], fps, PROBE, undefined, fps, steps)
    const ring = buildDrawingSpans(segments, [{ ...mag, toolType: 'magnifier' }], fps, { sourceFps: fps, speedSteps: steps }).find((s) => s.signature.length > 0)!
    expect(op.enable[0].start).toBeCloseTo(ring.frameStart / fps, 9)
  })

  it('leaves the hold fixture unchanged with no regions', () => {
    const { segments: held } = buildOutputTimeline({ start: 0, end: 4 }, [{ startTime: 2, freezeDuration: 1 }], 10)
    const ops = buildMagnifierOps({ start: 0, end: 4 }, held, [magnifier({ startTime: 1.5, endTime: 2.5 })], 10, PROBE)
    expect(ops[0].enable).toEqual([
      { start: 1.5, end: 2 },
      { start: 2, end: 3 },
      { start: 3, end: 3.5 },
    ])
  })
})
