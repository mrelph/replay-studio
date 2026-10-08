import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { normalizeTag, normalizeTags } from '@/utils/clipTags'
import { clampCardSeconds, DEFAULT_CARD_SECONDS } from '@/export/reelPlan'

const MIN_ROLL_SECONDS = 0
const MAX_ROLL_SECONDS = 60
const DEFAULT_PRE_ROLL = 8
const DEFAULT_POST_ROLL = 4

function clampRoll(seconds: number): number {
  if (!Number.isFinite(seconds)) return MIN_ROLL_SECONDS
  return Math.max(MIN_ROLL_SECONDS, Math.min(MAX_ROLL_SECONDS, seconds))
}

interface ClipPrefsState {
  /** Seconds of video kept before the playhead when marking a moment (clip.markMoment). */
  preRoll: number
  /** Seconds of video kept after the playhead when marking a moment. */
  postRoll: number
  /** Tags auto-applied to clips created via "Add clip" (Shift+C) or "Mark moment" (X). */
  stickyTags: string[]
  /** Highlight reel dialog: title card before each clip, its length, and whether clips are also saved individually. */
  reelTitleCards: boolean
  reelCardSeconds: number
  reelSaveIndividual: boolean
  setReelTitleCards: (on: boolean) => void
  setReelCardSeconds: (seconds: number) => void
  setReelSaveIndividual: (on: boolean) => void
  setPreRoll: (seconds: number) => void
  setPostRoll: (seconds: number) => void
  setStickyTags: (tags: string[]) => void
  /** Adds the tag if not already sticky, removes it if it is. */
  toggleStickyTag: (tag: string) => void
}

// zustand's persist middleware already wraps storage getItem/setItem in
// try/catch internally, so a missing or broken localStorage (private
// browsing, quota, etc.) falls back to the in-memory defaults below rather
// than throwing — same behavior relied on by shortcutsStore.ts.
export const useClipPrefsStore = create<ClipPrefsState>()(
  persist(
    (set, get) => ({
      preRoll: DEFAULT_PRE_ROLL,
      postRoll: DEFAULT_POST_ROLL,
      stickyTags: [],
      reelTitleCards: false,
      reelCardSeconds: DEFAULT_CARD_SECONDS,
      reelSaveIndividual: false,

      setReelTitleCards: (on) => set({ reelTitleCards: on }),
      setReelCardSeconds: (seconds) => set({ reelCardSeconds: clampCardSeconds(seconds) }),
      setReelSaveIndividual: (on) => set({ reelSaveIndividual: on }),
      setPreRoll: (seconds) => set({ preRoll: clampRoll(seconds) }),
      setPostRoll: (seconds) => set({ postRoll: clampRoll(seconds) }),
      setStickyTags: (tags) => set({ stickyTags: normalizeTags(tags) }),

      toggleStickyTag: (tag) => {
        const normalized = normalizeTag(tag)
        if (!normalized) return
        const key = normalized.toLowerCase()
        const { stickyTags } = get()
        const isSticky = stickyTags.some((t) => t.toLowerCase() === key)
        set({
          stickyTags: isSticky
            ? stickyTags.filter((t) => t.toLowerCase() !== key)
            : normalizeTags([...stickyTags, normalized]),
        })
      },
    }),
    { name: 'replay-studio-clip-prefs' }
  )
)
