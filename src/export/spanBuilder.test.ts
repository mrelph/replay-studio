import { describe, it, expect } from 'vitest'
import {
  buildDrawingSpans,
  buildDrawingSpansWithinBudget,
  computeFrameSignature,
  MAX_DISTINCT_OVERLAYS,
  signatureKey,
  type DrawingSpan,
  type SpanAnnotationLike,
} from './spanBuilder'
import { framePresentations } from './outputTimeline'
import type { OutputSegment } from '@/types/clip'

describe('signatureKey / computeFrameSignature', () => {
  it('is order-independent: two annotations visible in any iteration order produce the same key', () => {
    const annotations: SpanAnnotationLike[] = [
      { id: 'b', startTime: 0, endTime: 10 },
      { id: 'a', startTime: 0, endTime: 10 },
    ]
    const sig = computeFrameSignature(annotations, 5)
    expect(signatureKey(sig)).toBe('a:1.00:12/12|b:1.00:12/12')
  })

  it('excludes annotations outside their time range', () => {
    const annotations: SpanAnnotationLike[] = [{ id: 'a', startTime: 2, endTime: 4 }]
    expect(computeFrameSignature(annotations, 1)).toEqual([])
    expect(computeFrameSignature(annotations, 5)).toEqual([])
    expect(computeFrameSignature(annotations, 3)).toEqual([{ id: 'a', opacityBucket: 1, revealBucket: 12, revealSteps: 12 }])
  })
})

describe('buildDrawingSpans', () => {
  const PLAY_10S: OutputSegment[] = [{ kind: 'play', srcStart: 0, srcEnd: 10 }]

  it('fixture: a static drawing spanning part of the clip produces before/during/after spans', () => {
    // Visible [3, 7]; clip is 10s @ 10fps -> frames 0..9 at t=0,1,...,9.
    const annotations: SpanAnnotationLike[] = [{ id: 'a', startTime: 3, endTime: 7 }]
    const spans = buildDrawingSpans(PLAY_10S, annotations, 1)

    expect(spans).toHaveLength(3)
    expect(spans[0]).toMatchObject({ signature: [], frameStart: 0, frameCount: 3 })
    expect(spans[1].signature).toEqual([{ id: 'a', opacityBucket: 1, revealBucket: 12, revealSteps: 12 }])
    expect(spans[1].frameStart).toBe(3)
    expect(spans[1].frameCount).toBe(5) // frames at t=3..7 inclusive
    expect(spans[2]).toMatchObject({ signature: [], frameStart: 8, frameCount: 2 })

    const total = spans.reduce((sum, s) => sum + s.frameCount, 0)
    expect(total).toBe(10)
  })

  it('fixture: a drawing that fills the whole clip produces exactly one span', () => {
    const annotations: SpanAnnotationLike[] = [{ id: 'a', startTime: 0, endTime: 10 }]
    const spans = buildDrawingSpans(PLAY_10S, annotations, 1)
    expect(spans).toHaveLength(1)
    expect(spans[0].frameCount).toBe(10)
  })

  it('fixture: a fade-in produces one span per distinct quantized opacity step', () => {
    // fadeIn=1s over a 1s clip @ 10fps -> opacity ramps every frame; each
    // frame's opacity quantizes to a different 1/50 bucket, except floor 0.5
    // may repeat for the first couple of frames.
    const annotations: SpanAnnotationLike[] = [{ id: 'a', startTime: 0, endTime: 1, fadeIn: 1 }]
    const spans = buildDrawingSpans([{ kind: 'play', srcStart: 0, srcEnd: 1 }], annotations, 10)

    // 10 frames total, opacity increasing -> several distinct spans (much
    // more than the 1-span "static" case), each 1-2 frames wide.
    expect(spans.length).toBeGreaterThan(3)
    const total = spans.reduce((sum, s) => sum + s.frameCount, 0)
    expect(total).toBe(10)
    // Monotonically increasing opacity across spans.
    const opacities = spans.map((s) => s.signature[0]?.opacityBucket ?? 0)
    for (let i = 1; i < opacities.length; i++) {
      expect(opacities[i]).toBeGreaterThanOrEqual(opacities[i - 1])
    }
  })

  it('fixture: a hold across a drawing keeps one uniform signature across the whole hold (constant source time)', () => {
    const segments: OutputSegment[] = [
      { kind: 'play', srcStart: 0, srcEnd: 2 },
      { kind: 'hold', srcTime: 2, duration: 1 },
      { kind: 'play', srcStart: 2, srcEnd: 4 },
    ]
    const fps = 10
    // Drawing visible exactly during the hold's source instant (and a bit before/after).
    const annotations: SpanAnnotationLike[] = [{ id: 'a', startTime: 1.5, endTime: 2.5 }]
    const spans = buildDrawingSpans(segments, annotations, fps)

    // Hold is frames [20, 30) (1s @ 10fps after the 2s/20-frame play). Every
    // one of those frames shares srcTime=2, so no span boundary should fall
    // strictly inside that range — one span (or a merge with an identically-
    // signed neighbor) must cover it in one uninterrupted run.
    const holdStart = 20
    const holdEnd = 30
    const boundaries = new Set<number>()
    for (const span of spans) {
      boundaries.add(span.frameStart)
      boundaries.add(span.frameStart + span.frameCount)
    }
    for (let frame = holdStart + 1; frame < holdEnd; frame++) {
      expect(boundaries.has(frame)).toBe(false)
    }

    // And the frames covering the hold are indeed all visible (non-empty signature).
    const holdSpan = spans.find((s) => s.frameStart <= holdStart && s.frameStart + s.frameCount >= holdEnd)
    expect(holdSpan?.signature.length).toBeGreaterThan(0)
  })

  it('fixture: two overlapping drawings produce a distinct signature for the overlap region', () => {
    const annotations: SpanAnnotationLike[] = [
      { id: 'a', startTime: 0, endTime: 6 },
      { id: 'b', startTime: 4, endTime: 10 },
    ]
    const spans = buildDrawingSpans(PLAY_10S, annotations, 1)

    // [0,4): only a. [4,6]: a+b. [7,10): only b (b's own endTime is inclusive at 10 but frames stop at 9).
    const keys = spans.map((s) => signatureKey(s.signature))
    expect(keys).toEqual([
      'a:1.00:12/12', // t=0..3
      'a:1.00:12/12|b:1.00:12/12', // t=4..6
      'b:1.00:12/12', // t=7..9
    ])
    expect(spans[0].frameCount).toBe(4)
    expect(spans[1].frameCount).toBe(3)
    expect(spans[2].frameCount).toBe(3)
  })

  it('fixture: a magnifier-like annotation (id only, no special-casing here) contributes to the signature like any other', () => {
    // spanBuilder doesn't know about magnifiers specifically — toolType
    // filtering happens in clipRenderer — but its signature math must still
    // treat a magnifier's id/opacity normally so the ring PNG is included.
    const annotations: SpanAnnotationLike[] = [{ id: 'mag-1', startTime: 0, endTime: 10 }]
    const spans = buildDrawingSpans(PLAY_10S, annotations, 1)
    expect(spans).toHaveLength(1)
    expect(spans[0].signature).toEqual([{ id: 'mag-1', opacityBucket: 1, revealBucket: 12, revealSteps: 12 }])
  })

  it('a clip with no annotations produces a single empty-signature span', () => {
    const spans = buildDrawingSpans(PLAY_10S, [], 1)
    expect(spans).toHaveLength(1)
    expect(spans[0]).toEqual({ signature: [], frameStart: 0, frameCount: 10 })
  })
})

describe('draw-on reveal buckets', () => {
  const play = (a: number, b: number): OutputSegment => ({ kind: 'play', srcStart: a, srcEnd: b })

  it('static annotations still dedupe to one span', () => {
    const spans = buildDrawingSpans([play(0, 2)], [{ id: 'a', startTime: 0, endTime: 2, toolType: 'line' }], 30)
    expect(spans).toHaveLength(1)
    expect(spans[0].signature[0]).toMatchObject({ revealBucket: 12, revealSteps: 12 })
  })
  it('a draw-on produces rising buckets then one finished span', () => {
    const spans = buildDrawingSpans([play(0, 2)], [{ id: 'a', startTime: 0, endTime: 2, drawIn: 0.4, toolType: 'line' }], 30)
    const buckets = spans.map((s) => s.signature[0].revealBucket)
    expect(buckets[0]).toBe(0)
    expect(buckets).toEqual([...buckets].sort((x, y) => x - y))
    expect(buckets[buckets.length - 1]).toBe(12)
    expect(spans.length).toBeLessThanOrEqual(13)
  })
  it('treats the 1-step fallback as finished for every visible frame', () => {
    const spans = buildDrawingSpans([play(0, 2)], [{ id: 'a', startTime: 0, endTime: 2, drawIn: 0.4, toolType: 'line' }], 30, { maxRevealSteps: 1 })
    expect(spans).toHaveLength(1)
    expect(spans[0].signature[0]).toMatchObject({ revealBucket: 1, revealSteps: 1 })
  })
  it('gives a tool with no reveal a single span even with a drawIn', () => {
    const spans = buildDrawingSpans([play(0, 2)], [{ id: 'a', startTime: 0, endTime: 2, drawIn: 0.4, toolType: 'text' }], 30)
    expect(spans).toHaveLength(1)
    expect(spans[0].signature[0]).toMatchObject({ revealBucket: 12, revealSteps: 12 })
  })
  it('reveals during a hold on the start frame', () => {
    const segs: OutputSegment[] = [{ kind: 'hold', srcTime: 1, duration: 1 }, play(1, 2)]
    const spans = buildDrawingSpans(segs, [{ id: 'a', startTime: 1, endTime: 2, drawIn: 0.4, toolType: 'pen' }], 30)
    const holdSpans = spans.filter((s) => s.frameStart < 30)
    expect(holdSpans.length).toBeGreaterThan(1)
    expect(holdSpans[holdSpans.length - 1].signature[0].revealBucket).toBe(12)
  })
  it('matches a hold a sub-frame before the drawing by frame index', () => {
    const segs: OutputSegment[] = [play(0.9, 1.0), { kind: 'hold', srcTime: 1.0, duration: 1 }, play(1.0, 2)]
    const spans = buildDrawingSpans(segs, [{ id: 'a', startTime: 1.004, endTime: 2, drawIn: 0.4, toolType: 'pen' }], 30, { sourceFps: 30 })
    const first = spans.find((s) => s.signature.length > 0)!
    expect(first.signature[0].revealBucket).toBe(12) // the whole hold counts as elapsed
  })
  it('keeps revealing through a freeze recorded a frame after the drawing started', () => {
    const segs: OutputSegment[] = [play(2.5, 3.0567), { kind: 'hold', srcTime: 3.0567, duration: 2.7 }, play(3.0567, 5)]
    const spans = buildDrawingSpans(segs, [{ id: 'a', startTime: 3.011, endTime: 5.5, drawIn: 0.4, toolType: 'pen' }], 30, { sourceFps: 30 })
    const holdLastFrame = Math.round(0.5567 * 30) + Math.round(2.7 * 30) - 1
    expect(spans.some((s) => s.frameStart < holdLastFrame && s.signature[0]?.revealBucket === 12)).toBe(true)
    const buckets = spans.filter((s) => s.signature.length > 0).map((s) => s.signature[0].revealBucket)
    expect(buckets).toEqual([...buckets].sort((x, y) => x - y))
  })
  it('does not count a hold before the start frame', () => {
    const segs: OutputSegment[] = [{ kind: 'hold', srcTime: 2.0, duration: 1 }, play(2.0, 4)]
    const spans = buildDrawingSpans(segs, [{ id: 'a', startTime: 3.0, endTime: 4, drawIn: 0.4, toolType: 'pen' }], 30, { sourceFps: 30 })
    const first = spans.find((s) => s.signature.length > 0)!
    expect(first.signature[0].revealBucket).toBe(0)
  })
  it('a clip starting after the annotation shows it finished (Review Focus 1)', () => {
    const spans = buildDrawingSpans([play(5, 6)], [{ id: 'a', startTime: 4, endTime: 8, drawIn: 0.4, toolType: 'line' }], 30)
    expect(spans).toHaveLength(1)
    expect(spans[0].signature[0].revealBucket).toBe(12)
  })
  it('15 fps output of 60 fps source still finishes the reveal (Review Focus 4)', () => {
    const segs: OutputSegment[] = [{ kind: 'hold', srcTime: 1, duration: 0.5 }, play(1, 2)]
    const spans = buildDrawingSpans(segs, [{ id: 'a', startTime: 1.001, endTime: 2, drawIn: 0.4, toolType: 'line' }], 15, { sourceFps: 60 })
    expect(spans.some((s) => s.signature[0]?.revealBucket === 12)).toBe(true)
  })
  it('respects maxRevealSteps', () => {
    const spans = buildDrawingSpans([play(0, 2)], [{ id: 'a', startTime: 0, endTime: 2, drawIn: 0.4, toolType: 'line' }], 60, { maxRevealSteps: 3 })
    expect(new Set(spans.map((s) => signatureKey(s.signature))).size).toBeLessThanOrEqual(4)
  })
  it('falls back to fewer steps to stay within the overlay budget', () => {
    const anns = Array.from({ length: 60 }, (_, i) => ({ id: `a${i}`, startTime: i, endTime: i + 0.9, drawIn: 0.4, toolType: 'line' }))
    expect(new Set(buildDrawingSpans([play(0, 60)], anns, 30).map((s) => signatureKey(s.signature))).size).toBeGreaterThan(MAX_DISTINCT_OVERLAYS)
    const spans = buildDrawingSpansWithinBudget([play(0, 60)], anns, 30)
    expect(new Set(spans.map((s) => signatureKey(s.signature))).size).toBeLessThanOrEqual(MAX_DISTINCT_OVERLAYS)
  })
})

describe('drawn-order visibility (revealDelay)', () => {
  const play = (a: number, b: number): OutputSegment => ({ kind: 'play', srcStart: a, srcEnd: b })
  const HELD: OutputSegment[] = [play(2.9, 3.0), { kind: 'hold', srcTime: 3.0, duration: 2.3 }, play(3.0, 4.0)]
  const anns: SpanAnnotationLike[] = [
    { id: 'a', startTime: 3, endTime: 5, drawIn: 0.35, revealDelay: 0, toolType: 'line' },
    { id: 'b', startTime: 3, endTime: 5, drawIn: 0.4, revealDelay: 0.35, toolType: 'pen' },
    { id: 't', startTime: 3, endTime: 5, revealDelay: 0.75, toolType: 'text' },
  ]
  const HOLD_START = 3 // play 2.9 -> 3.0 at 30 fps is 3 frames
  const firstFrameWith = (spans: DrawingSpan[], id: string) => spans.find((s) => s.signature.some((g) => g.id === id))!
  const stateOf = (span: DrawingSpan, id: string) => span.signature.find((g) => g.id === id)!

  it('shows only the first drawing on the first hold frame', () => {
    const spans = buildDrawingSpans(HELD, anns, 30, { sourceFps: 30 })
    const at = spans.find((s) => s.frameStart <= HOLD_START && HOLD_START < s.frameStart + s.frameCount)!
    expect(at.signature.map((g) => g.id)).toEqual(['a'])
  })

  it('brings each drawing in once its delay of hold time has passed', () => {
    for (const maxRevealSteps of [12, 1]) {
      const spans = buildDrawingSpans(HELD, anns, 30, { sourceFps: 30, maxRevealSteps })
      const b = firstFrameWith(spans, 'b')
      const t = firstFrameWith(spans, 't')
      expect(b.frameStart).toBe(HOLD_START + 11) // first f with f / 30 >= 0.35
      expect(t.frameStart).toBe(HOLD_START + 23) // first f with f / 30 >= 0.75
      expect(firstFrameWith(spans, 'a').frameStart).toBe(HOLD_START)
      expect(stateOf(t, 't').revealBucket).toBe(maxRevealSteps)
      if (maxRevealSteps === 1) {
        for (const span of spans) for (const g of span.signature) expect(g.revealBucket).toBe(1)
      }
    }
  })

  it('uses source time when there is no hold (Review Focus 3)', () => {
    const segs = [play(2.9, 4.0)]
    const times = framePresentations(segs, 30).map((f) => f.srcTime)
    const spans = buildDrawingSpans(segs, anns, 30, { sourceFps: 30 })
    const b = firstFrameWith(spans, 'b').frameStart
    const t = firstFrameWith(spans, 't').frameStart
    expect(times[b]).toBeGreaterThanOrEqual(3.35 - 1e-6)
    expect(times[b - 1]).toBeLessThan(3.35)
    expect(times[t]).toBeGreaterThanOrEqual(3.75 - 1e-6)
    expect(times[t - 1]).toBeLessThan(3.75)

    const late = buildDrawingSpans([play(3.5, 4.0)], anns, 30, { sourceFps: 30 })
    expect(late[0].frameStart).toBe(0)
    expect(late[0].signature.map((g) => g.id)).toContain('b')
  })

  it('leaves annotations without revealDelay exactly as before', () => {
    const segs: OutputSegment[] = [play(2.5, 3.0567), { kind: 'hold', srcTime: 3.0567, duration: 2.7 }, play(3.0567, 5)]
    const fixture: SpanAnnotationLike[] = [
      { id: 'a', startTime: 3.011, endTime: 5.5, drawIn: 0.4, toolType: 'pen' },
      { id: 'x', startTime: 3.5, endTime: 4.5, fadeIn: 0.3, toolType: 'text' },
    ]
    const spans = buildDrawingSpans(segs, fixture, 30, { sourceFps: 30 })
    // Captured from the span builder before revealDelay existed.
    expect(spans.map((s) => [s.frameStart, s.frameCount, s.signature.map((g) => [g.id, g.opacityBucket, g.revealBucket])])).toEqual([
      [0, 16, []],
      [16, 1, [['a', 1, 1]]],
      [17, 1, [['a', 1, 3]]],
      [18, 1, [['a', 1, 5]]],
      [19, 1, [['a', 1, 7]]],
      [20, 1, [['a', 1, 8]]],
      [21, 1, [['a', 1, 9]]],
      [22, 1, [['a', 1, 10]]],
      [23, 5, [['a', 1, 11]]],
      [28, 84, [['a', 1, 12]]],
      [112, 4, [['a', 1, 12], ['x', 0.5, 12]]],
      [116, 1, [['a', 1, 12], ['x', 0.54, 12]]],
      [117, 1, [['a', 1, 12], ['x', 0.64, 12]]],
      [118, 1, [['a', 1, 12], ['x', 0.76, 12]]],
      [119, 1, [['a', 1, 12], ['x', 0.86, 12]]],
      [120, 1, [['a', 1, 12], ['x', 0.98, 12]]],
      [121, 21, [['a', 1, 12], ['x', 1, 12]]],
      [142, 14, [['a', 1, 12]]],
    ])
  })

  it('omits a not-yet-due annotation from a single frame signature at any step count', () => {
    const t: SpanAnnotationLike = { id: 't', startTime: 3, endTime: 5, revealDelay: 0.75, toolType: 'text' }
    for (const steps of [12, 1]) {
      expect(computeFrameSignature([t], 3.5, steps)).toEqual([])
      expect(computeFrameSignature([t], 3.5, steps, () => 0.25)).toHaveLength(1)
    }
  })
})
