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

export const useSpeedStore = create<SpeedState>((set) => ({
  regions: [],
  selectedId: null,

  place: (region) =>
    set((state) => {
      const { duration, fps } = useVideoStore.getState()
      return { regions: placeSpeedRegion(state.regions, region, duration, fps) }
    }),

  remove: (id) =>
    set((state) => ({
      regions: state.regions.filter((region) => region.id !== id),
      selectedId: state.selectedId === id ? null : state.selectedId,
    })),

  setSpeed: (id, speed) =>
    set((state) => ({
      regions: state.regions.map((region) => (region.id === id ? { ...region, speed: clampSpeed(speed) } : region)),
    })),

  select: (id) => set({ selectedId: id }),

  replaceAll: (regions) => {
    const { duration, fps } = useVideoStore.getState()
    set({ regions: sanitizeSpeedRegions(regions, duration, fps), selectedId: null })
  },
}))
