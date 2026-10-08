import { describe, it, expect } from 'vitest'
import { clipMatchesTags, inclusionForTags, syncOrder, moveInOrder, reelClips, individualBaseNames, reelProgressLabel } from './reelSelection'
import type { Clip } from '@/types/clip'

const clip = (id: string, tags: string[] = []): Clip => ({ id, name: id.toUpperCase(), start: 0, end: 1, color: '#000', tags, notes: '' })
const clips = [clip('a', ['PK']), clip('b', ['Breakout', 'pk']), clip('c', ['Goal'])]

describe('reel selection', () => {
  it('includes everything without a filter, else ANY-matching clips (case-insensitive)', () => {
    expect(inclusionForTags(clips, new Set())).toEqual({ a: true, b: true, c: true })
    expect(inclusionForTags(clips, new Set(['pk']))).toEqual({ a: true, b: true, c: false })
    expect(clipMatchesTags(clips[2], new Set(['goal', 'pk']))).toBe(true)
  })

  it('keeps a custom order as clips come and go', () => {
    const order = ['c', 'a', 'b']
    expect(syncOrder(order, [clips[0], clips[2]])).toEqual(['c', 'a'])
    expect(syncOrder(order, [...clips, clip('d')])).toEqual(['c', 'a', 'b', 'd'])
  })

  it('moves a clip, clamping the target', () => {
    expect(moveInOrder(['a', 'b', 'c'], 'c', 0)).toEqual(['c', 'a', 'b'])
    expect(moveInOrder(['a', 'b', 'c'], 'a', 99)).toEqual(['b', 'c', 'a'])
    expect(moveInOrder(['a', 'b'], 'zz', 0)).toEqual(['a', 'b'])
  })

  it('lists included clips in reel order and names their files by reel position', () => {
    const inReel = reelClips(clips, ['c', 'b', 'a'], { a: true, b: false, c: true })
    expect(inReel.map((c) => c.id)).toEqual(['c', 'a'])
    expect(individualBaseNames(inReel)).toEqual({ c: '01 - C [Goal]', a: '02 - A [PK]' })
  })

  it('labels each progress step', () => {
    expect(reelProgressLabel({ step: 'card', number: 3, total: 7, percent: 30 })).toBe('Title card 3 of 7…')
    expect(reelProgressLabel({ step: 'clip', number: 3, total: 7, percent: 35 })).toBe('Clip 3 of 7…')
    expect(reelProgressLabel({ step: 'join', number: 0, total: 7, percent: 96 })).toBe('Joining reel…')
  })
})
