import { create } from 'zustand'
import { useDrawingStore, registerUndoExtra } from './drawingStore'
import { useVideoStore } from './videoStore'
import type { VoiceClip, VoiceDuck } from '@/types/voice'
import { frozenVoiceAt } from '@/utils/voiceClips'
import { setVoiceAudio } from '@/voice/voiceAudio'

const DUCK_KEY = 'replay-studio-voice-duck'

function readDuck(): VoiceDuck {
  try {
    const stored = localStorage.getItem(DUCK_KEY)
    return stored === 'off' || stored === 'full' || stored === 'low' ? stored : 'low'
  } catch {
    return 'low'
  }
}

/** Runs `apply` now, or once an undo/redo restore has finished: the restore overwrites clips, and saveState skips while it runs. */
function afterRestore(apply: () => void) {
  if (!useDrawingStore.getState().isRestoring) {
    apply()
    return
  }
  const unsubscribe = useDrawingStore.subscribe((state) => {
    if (state.isRestoring) return
    unsubscribe()
    // The restore puts back its clips right after clearing isRestoring.
    queueMicrotask(() => afterRestore(apply))
  })
}

interface VoiceState {
  clips: VoiceClip[]
  selectedId: string | null
  duck: VoiceDuck
  add: (clip: VoiceClip, audio: Blob) => void
  remove: (id: string) => void
  select: (id: string | null) => void
  setDuck: (duck: VoiceDuck) => void
  replaceAll: (clips: VoiceClip[]) => void
}

export const useVoiceStore = create<VoiceState>((set, get) => ({
  clips: [],
  selectedId: null,
  duck: readDuck(),

  add: (clip, audio) =>
    afterRestore(() => {
      const state = get()
      const { fps } = useVideoStore.getState()
      const replaced = clip.frozen ? frozenVoiceAt(state.clips, clip.startTime, fps) : undefined
      useDrawingStore.getState().saveState()
      setVoiceAudio(clip.id, audio)
      const clips = [...state.clips.filter((c) => c !== replaced), clip].sort((a, b) => a.startTime - b.startTime)
      set({ clips, selectedId: replaced && state.selectedId === replaced.id ? null : state.selectedId })
    }),

  remove: (id) =>
    afterRestore(() => {
      const state = get()
      if (!state.clips.some((c) => c.id === id)) return
      useDrawingStore.getState().saveState()
      set({
        clips: state.clips.filter((c) => c.id !== id),
        selectedId: state.selectedId === id ? null : state.selectedId,
      })
    }),

  select: (id) => set({ selectedId: id }),

  setDuck: (duck) => {
    try {
      localStorage.setItem(DUCK_KEY, duck)
    } catch {
      /* storage unavailable */
    }
    set({ duck })
  },

  replaceAll: (clips) => set({ clips: [...clips].sort((a, b) => a.startTime - b.startTime), selectedId: null }),
}))

registerUndoExtra('voice', {
  capture: () => useVoiceStore.getState().clips,
  restore: (value) => {
    const clips = value as VoiceClip[]
    useVoiceStore.setState((state) => ({
      clips,
      selectedId: clips.some((c) => c.id === state.selectedId) ? state.selectedId : null,
    }))
  },
})
