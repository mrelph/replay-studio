import { describe, it, expect } from 'vitest'
import { buildReelPlan, buildReelBaseName, clampCardSeconds, defaultReelName, estimateEncodeBytes } from './reelPlan'
import { buildOutputTimeline } from './outputTimeline'
import type { Clip } from '@/types/clip'

const clip = (id: string, start: number, end: number, name = id, tags: string[] = []): Clip => ({
  id, name, start, end, color: '#000', tags, notes: '',
})
const FPS = 30000 / 1001

describe('buildReelPlan', () => {
  const clips = [clip('a', 10, 13.5, 'Breakout'), clip('b', 40, 42, 'PK'), clip('c', 5, 6, 'Goal')]

  it('keeps the given order and, without cards, has one part and one chapter per clip', () => {
    const plan = buildReelPlan(clips, [], FPS, { titleCards: false, cardSeconds: 2 })
    expect(plan.parts.map((p) => `${p.kind}:${p.clip.id}`)).toEqual(['clip:a', 'clip:b', 'clip:c'])
    expect(plan.chapters.map((c) => c.title)).toEqual(['Breakout', 'PK', 'Goal'])
    expect(plan.clipCount).toBe(3)
  })

  it('puts a card before each clip, inside that clip\'s chapter', () => {
    const plan = buildReelPlan(clips, [], FPS, { titleCards: true, cardSeconds: 2 })
    expect(plan.parts.map((p) => p.kind)).toEqual(['card', 'clip', 'card', 'clip', 'card', 'clip'])
    const card = plan.parts[2]
    expect(card.segments).toEqual([{ kind: 'hold', srcTime: 40, duration: 2 }])
    expect(card.frameCount).toBe(Math.round(2 * FPS))
    expect(card.number).toBe(2)
    expect(plan.chapters[1].startFrame).toBe(plan.parts[0].frameCount + plan.parts[1].frameCount)
    expect(plan.chapters[1].frameCount).toBe(plan.parts[2].frameCount + plan.parts[3].frameCount)
  })

  it('tiles chapters exactly over the parts at 29.97 (no drift)', () => {
    const many = Array.from({ length: 25 }, (_, i) => clip(`k${i}`, i * 10, i * 10 + 3.3))
    const plan = buildReelPlan(many, [], FPS, { titleCards: true, cardSeconds: 1.5 })
    const partFrames = plan.parts.reduce((s, p) => s + p.frameCount, 0)
    expect(plan.frameCount).toBe(partFrames)
    let expected = 0
    for (const chapter of plan.chapters) {
      expect(chapter.startFrame).toBe(expected)
      expected += chapter.frameCount
    }
    expect(expected).toBe(plan.frameCount)
    expect(plan.duration).toBeCloseTo(plan.frameCount / FPS, 9)
  })

  it('includes a clip\'s freezes inside its clip part, like single-clip export', () => {
    const annotations = [{ startTime: 11, freezeDuration: 3 }, { startTime: 41, freezeDuration: 1 }]
    const plan = buildReelPlan([clips[0]], annotations, FPS, { titleCards: false, cardSeconds: 2 })
    expect(plan.parts[0].segments).toEqual(buildOutputTimeline(clips[0], annotations, FPS).segments)
    expect(plan.parts[0].frameCount).toBe(Math.round(6.5 * FPS))
  })

  it('rejects an empty selection and a bad frame rate', () => {
    expect(() => buildReelPlan([], [], FPS, { titleCards: true, cardSeconds: 2 })).toThrow(/at least one clip/)
    expect(() => buildReelPlan(clips, [], 0, { titleCards: true, cardSeconds: 2 })).toThrow()
  })

  it('clamps card length to 1-5 s', () => {
    expect(clampCardSeconds(0.2)).toBe(1)
    expect(clampCardSeconds(9)).toBe(5)
    expect(clampCardSeconds(Number.NaN)).toBe(2)
    const plan = buildReelPlan([clips[0]], [], 30, { titleCards: true, cardSeconds: 30 })
    expect(plan.parts[0].frameCount).toBe(150)
  })
})

describe('reel naming', () => {
  it('defaults to the tag filter, then the video name, then Highlights', () => {
    expect(defaultReelName(['PK', 'Breakout'], 'game.mp4')).toBe('PK, Breakout')
    expect(defaultReelName([], 'Rink 2026-09-27.mp4')).toBe('Rink 2026-09-27')
    expect(defaultReelName([], null)).toBe('Highlights')
  })

  it('builds a filesystem-safe base name', () => {
    expect(buildReelBaseName('PK: 2nd / 3rd?')).toBe('Reel - PK 2nd  3rd')
    expect(buildReelBaseName('  ')).toBe('Reel - Highlights')
  })
})

describe('estimateEncodeBytes', () => {
  it('scales with duration and drops with quality', () => {
    const high = estimateEncodeBytes(60, 1920, 1080, 30, 'high')
    expect(estimateEncodeBytes(120, 1920, 1080, 30, 'high')).toBeCloseTo(high * 2, -3)
    expect(estimateEncodeBytes(60, 1920, 1080, 30, 'medium')).toBeLessThan(high)
    expect(estimateEncodeBytes(60, 1920, 1080, 30, 'low')).toBeLessThan(estimateEncodeBytes(60, 1920, 1080, 30, 'medium'))
  })
})
