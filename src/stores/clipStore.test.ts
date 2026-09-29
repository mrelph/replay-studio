import { describe, it, expect, beforeEach } from 'vitest'
import { useClipStore } from './clipStore'

function resetStore() {
  useClipStore.setState({ clips: [], selectedClipId: null })
}

describe('clipStore', () => {
  beforeEach(() => {
    resetStore()
  })

  describe('addClip', () => {
    it('defaults tags to [] and notes to empty string', () => {
      const clip = useClipStore.getState().addClip(0, 5)
      expect(clip?.tags).toEqual([])
      expect(clip?.notes).toBe('')
    })

    it('normalizes tags passed in at creation time', () => {
      const clip = useClipStore.getState().addClip(0, 5, undefined, ['  Offense   Set  ', 'offense set', 'PP'])
      expect(clip?.tags).toEqual(['Offense Set', 'PP'])
    })

    it('selects the newly created clip', () => {
      const clip = useClipStore.getState().addClip(0, 5)
      expect(useClipStore.getState().selectedClipId).toBe(clip?.id)
    })

    it('returns null for a too-short range and does not add a clip', () => {
      const clip = useClipStore.getState().addClip(1, 1.01)
      expect(clip).toBeNull()
      expect(useClipStore.getState().clips).toHaveLength(0)
    })
  })

  describe('tag actions', () => {
    it('setClipTags normalizes (dedupe, whitespace, cap at 12)', () => {
      const clip = useClipStore.getState().addClip(0, 5)!
      const many = Array.from({ length: 15 }, (_, i) => `tag${i}`)
      useClipStore.getState().setClipTags(clip.id, many)
      const updated = useClipStore.getState().clips.find((c) => c.id === clip.id)
      expect(updated?.tags).toHaveLength(12)
      expect(updated?.tags).toEqual(many.slice(0, 12))
    })

    it('addClipTag appends and re-normalizes against existing tags', () => {
      const clip = useClipStore.getState().addClip(0, 5, undefined, ['Offense'])!
      useClipStore.getState().addClipTag(clip.id, 'offense') // case-insensitive dup, dropped
      useClipStore.getState().addClipTag(clip.id, 'PP')
      const updated = useClipStore.getState().clips.find((c) => c.id === clip.id)
      expect(updated?.tags).toEqual(['Offense', 'PP'])
    })

    it('removeClipTag removes case-insensitively', () => {
      const clip = useClipStore.getState().addClip(0, 5, undefined, ['Offense', 'PP'])!
      useClipStore.getState().removeClipTag(clip.id, 'offense')
      const updated = useClipStore.getState().clips.find((c) => c.id === clip.id)
      expect(updated?.tags).toEqual(['PP'])
    })

    it('does not affect other clips', () => {
      const a = useClipStore.getState().addClip(0, 5, undefined, ['A'])!
      const b = useClipStore.getState().addClip(5, 10, undefined, ['B'])!
      useClipStore.getState().addClipTag(a.id, 'X')
      const clips = useClipStore.getState().clips
      expect(clips.find((c) => c.id === a.id)?.tags).toEqual(['A', 'X'])
      expect(clips.find((c) => c.id === b.id)?.tags).toEqual(['B'])
    })
  })

  describe('setClipNotes', () => {
    it('caps notes at 2000 chars', () => {
      const clip = useClipStore.getState().addClip(0, 5)!
      useClipStore.getState().setClipNotes(clip.id, 'a'.repeat(2500))
      const updated = useClipStore.getState().clips.find((c) => c.id === clip.id)
      expect(updated?.notes).toHaveLength(2000)
    })

    it('sets notes for the target clip only', () => {
      const clip = useClipStore.getState().addClip(0, 5)!
      useClipStore.getState().setClipNotes(clip.id, 'Watch the breakout')
      const updated = useClipStore.getState().clips.find((c) => c.id === clip.id)
      expect(updated?.notes).toBe('Watch the breakout')
    })
  })
})
