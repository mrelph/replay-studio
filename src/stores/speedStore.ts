import { create } from 'zustand'
import { useDrawingStore, registerUndoExtra } from './drawingStore'
import { useVideoStore, setSlowRegionSink } from './videoStore'
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

function sameRegions(a: SpeedRegion[], b: SpeedRegion[]): boolean {
  return a.length === b.length && a.every((x, i) => x.id === b[i].id && x.start === b[i].start && x.end === b[i].end && x.speed === b[i].speed)
}

export const useSpeedStore = create<SpeedState>((set, get) => ({
  regions: [],
  selectedId: null,

  place: (region) => {
    const state = get()
    const { duration, fps } = useVideoStore.getState()
    const regions = placeSpeedRegion(state.regions, region, duration, fps)
    if (sameRegions(regions, state.regions)) return
    useDrawingStore.getState().saveState()
    loaded = null
    const selectedId = regions.some((r) => r.id === state.selectedId) ? state.selectedId : null
    set({ regions, selectedId })
  },

  remove: (id) => {
    const state = get()
    if (!state.regions.some((region) => region.id === id)) return
    useDrawingStore.getState().saveState()
    loaded = null
    set({
      regions: state.regions.filter((region) => region.id !== id),
      selectedId: state.selectedId === id ? null : state.selectedId,
    })
  },

  setSpeed: (id, speed) => {
    const state = get()
    const next = clampSpeed(speed)
    const target = state.regions.find((region) => region.id === id)
    if (!target || target.speed === next) return
    useDrawingStore.getState().saveState()
    loaded = null
    set({ regions: state.regions.map((region) => (region.id === id ? { ...region, speed: next } : region)) })
  },

  select: (id) => set({ selectedId: id }),

  replaceAll: (regions) => {
    loaded = regions.length > 0 ? regions : null
    const { duration, fps } = useVideoStore.getState()
    set({ regions: duration > 0 ? sanitizeSpeedRegions(regions, duration, fps) : regions, selectedId: null })
  },
}))

registerUndoExtra('speed', {
  capture: () => useSpeedStore.getState().regions,
  restore: (value) => {
    const regions = value as SpeedRegion[]
    if (sameRegions(regions, useSpeedStore.getState().regions)) return
    loaded = null
    useSpeedStore.setState((state) => ({
      regions,
      selectedId: regions.some((r) => r.id === state.selectedId) ? state.selectedId : null,
    }))
  },
})

setSlowRegionSink((region) => useSpeedStore.getState().place(region))

useVideoStore.subscribe((state, prev) => {
  if (!loaded || state.duration <= 0) return
  if (state.fps === prev.fps && state.duration === prev.duration) return
  useSpeedStore.setState({ regions: sanitizeSpeedRegions(loaded, state.duration, state.fps) })
})
