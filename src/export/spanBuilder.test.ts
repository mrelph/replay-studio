import { describe, it, expect } from 'vitest'
import { buildDrawingSpans, computeFrameSignature, signatureKey, type SpanAnnotationLike } from './spanBuilder'
import type { OutputSegment } from '@/types/clip'

describe('signatureKey / computeFrameSignature', () => {
  it('is order-independent: two annotations visible in any iteration order produce the same key', () => {
    const annotations: SpanAnnotationLike[] = [
      { id: 'b', startTime: 0, endTime: 10 },
      { id: 'a', startTime: 0, endTime: 10 },
    ]
    const sig = computeFrameSignature(annotations, 5)
    expect(signatureKey(sig)).toBe('a:1.00|b:1.00')
  })

  it('excludes annotations outside their time range', () => {
    const annotations: SpanAnnotationLike[] = [{ id: 'a', startTime: 2, endTime: 4 }]
    expect(computeFrameSignature(annotations, 1)).toEqual([])
    expect(computeFrameSignature(annotations, 5)).toEqual([])
    expect(computeFrameSignature(annotations, 3)).toEqual([{ id: 'a', opacityBucket: 1 }])
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
    expect(spans[1].signature).toEqual([{ id: 'a', opacityBucket: 1 }])
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
      'a:1.00', // t=0..3
      'a:1.00|b:1.00', // t=4..6
      'b:1.00', // t=7..9
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
    expect(spans[0].signature).toEqual([{ id: 'mag-1', opacityBucket: 1 }])
  })

  it('a clip with no annotations produces a single empty-signature span', () => {
    const spans = buildDrawingSpans(PLAY_10S, [], 1)
    expect(spans).toHaveLength(1)
    expect(spans[0]).toEqual({ signature: [], frameStart: 0, frameCount: 10 })
  })
})
