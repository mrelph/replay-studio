import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { normalizeTag, normalizeTags } from '@/utils/clipTags'

const MIN_ROLL_SECONDS = 0
const MAX_ROLL_SECONDS = 60
const DEFAULT_PRE_ROLL = 8
const DEFAULT_POST_ROLL = 4
const DEFAULT_HOLD_SECONDS = 3
const MIN_HOLD_SECONDS = 0.5
const MAX_HOLD_SECONDS = 30

function clampRoll(seconds: number): number {
  if (!Number.isFinite(seconds)) return MIN_ROLL_SECONDS
  return Math.max(MIN_ROLL_SECONDS, Math.min(MAX_ROLL_SECONDS, seconds))
}

function clampHold(seconds: number): number {
  if (!Number.isFinite(seconds)) return DEFAULT_HOLD_SECONDS
  return Math.max(MIN_HOLD_SECONDS, Math.min(MAX_HOLD_SECONDS, seconds))
}

interface ClipPrefsState {
  /** Seconds of video kept before the playhead when marking a moment (clip.markMoment). */
  preRoll: number
  /** Seconds of video kept after the playhead when marking a moment. */
  postRoll: number
  /** Tags auto-applied to clips created via "Add clip" (Shift+C) or "Mark moment" (X). */
  stickyTags: string[]
  /** Length of a hold added with the freeze button or the hold key (H). */
  holdSeconds: number
  setHoldSeconds: (seconds: number) => void
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
      holdSeconds: DEFAULT_HOLD_SECONDS,

      setHoldSeconds: (seconds) => set({ holdSeconds: clampHold(seconds) }),

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
