import { create } from 'zustand'
import { useVideoStore } from './videoStore'
import {
  clampSpeed,
  placeSpeedRegion,
  sanitizeSpeedRegions,
  type SpeedRegion,
} from '@/utils/speedRegions'

interface SpeedState {
  regions: SpeedRegion[]
  selectedId: string | null
  place: (region: SpeedRegion) => void
  remove: (id: string) => void
  setSpeed: (id: string, speed: number) => void
  select: (id: string | null) => void
  replaceAll: (regions: SpeedRegion[]) => void
}

// Regions as loaded from a project file, kept until the user edits them so they
// can be re-snapped when the probed fps or the duration arrives after the load.
let loaded: SpeedRegion[] | null = null

export const useSpeedStore = create<SpeedState>((set) => ({
  regions: [],
  selectedId: null,

  place: (region) =>
    set((state) => {
      loaded = null
      const { duration, fps } = useVideoStore.getState()
      const regions = placeSpeedRegion(state.regions, region, duration, fps)
      const selectedId = regions.some((r) => r.id === state.selectedId) ? state.selectedId : null
      return { regions, selectedId }
    }),

  remove: (id) => {
    loaded = null
    set((state) => ({
      regions: state.regions.filter((region) => region.id !== id),
      selectedId: state.selectedId === id ? null : state.selectedId,
    }))
  },

  setSpeed: (id, speed) => {
    loaded = null
    set((state) => ({
      regions: state.regions.map((region) => (region.id === id ? { ...region, speed: clampSpeed(speed) } : region)),
    }))
  },

  select: (id) => set({ selectedId: id }),

  replaceAll: (regions) => {
    loaded = regions.length > 0 ? regions : null
    const { duration, fps } = useVideoStore.getState()
    set({ regions: duration > 0 ? sanitizeSpeedRegions(regions, duration, fps) : regions, selectedId: null })
  },
}))

useVideoStore.subscribe((state, prev) => {
  if (!loaded || state.duration <= 0) return
  if (state.fps === prev.fps && state.duration === prev.duration) return
  useSpeedStore.setState({ regions: sanitizeSpeedRegions(loaded, state.duration, state.fps) })
})
