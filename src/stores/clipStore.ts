import { create } from 'zustand'
import type { Clip } from '@/types/clip'

// Cycled for new clips so adjacent bars on the timeline are distinguishable.
export const CLIP_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ec4899', '#8b5cf6', '#14b8a6', '#ef4444', '#eab308']

const MIN_CLIP_SECONDS = 0.1

interface ClipState {
  clips: Clip[]
  selectedClipId: string | null

  /** Adds a clip for [start, end) and returns it, or null if the range is empty. */
  addClip: (start: number, end: number, name?: string) => Clip | null
  updateClip: (id: string, patch: Partial<Omit<Clip, 'id'>>) => void
  removeClip: (id: string) => void
  moveClip: (id: string, toIndex: number) => void
  selectClip: (id: string | null) => void
  /** Replaces all clips (project load / new video). */
  setClips: (clips: Clip[]) => void
}

let idCounter = 0
function newClipId() {
  idCounter += 1
  return `clip-${Date.now().toString(36)}-${idCounter}`
}

export const useClipStore = create<ClipState>((set, get) => ({
  clips: [],
  selectedClipId: null,

  addClip: (start, end, name) => {
    const lo = Math.max(0, Math.min(start, end))
    const hi = Math.max(start, end)
    if (hi - lo < MIN_CLIP_SECONDS) return null
    const { clips } = get()
    const clip: Clip = {
      id: newClipId(),
      name: name?.trim() || `Clip ${clips.length + 1}`,
      start: lo,
      end: hi,
      color: CLIP_COLORS[clips.length % CLIP_COLORS.length],
    }
    set({ clips: [...clips, clip], selectedClipId: clip.id })
    return clip
  },

  updateClip: (id, patch) => {
    set((state) => ({
      clips: state.clips.map((clip) => {
        if (clip.id !== id) return clip
        const next = { ...clip, ...patch }
        // Reject edits that would collapse or invert the range.
        if (next.end - next.start < MIN_CLIP_SECONDS || next.start < 0) return clip
        return next
      }),
    }))
  },

  removeClip: (id) => {
    set((state) => ({
      clips: state.clips.filter((clip) => clip.id !== id),
      selectedClipId: state.selectedClipId === id ? null : state.selectedClipId,
    }))
  },

  moveClip: (id, toIndex) => {
    set((state) => {
      const from = state.clips.findIndex((clip) => clip.id === id)
      if (from === -1) return state
      const clips = [...state.clips]
      const [clip] = clips.splice(from, 1)
      clips.splice(Math.max(0, Math.min(toIndex, clips.length)), 0, clip)
      return { clips }
    })
  },

  selectClip: (id) => set({ selectedClipId: id }),

  setClips: (clips) => set({ clips, selectedClipId: null }),
}))
