import { create } from 'zustand'

interface AudienceState {
  isAudienceOpen: boolean
  laserColor: string
  laserSize: number

  openAudienceView: () => void
  closeAudienceView: () => void
  setLaserColor: (color: string) => void
  setLaserSize: (size: number) => void
  setAudienceOpen: (open: boolean) => void
}

export const useAudienceStore = create<AudienceState>((set) => ({
  isAudienceOpen: false,
  laserColor: '#ff0000',
  laserSize: 20,

  openAudienceView: () => {
    // Don't set isAudienceOpen yet - wait for 'audience-ready' IPC signal
    window.electronAPI?.openAudienceView()
  },
  closeAudienceView: () => {
    window.electronAPI?.closeAudienceView()
    set({ isAudienceOpen: false })
  },
  setAudienceOpen: (open) => set({ isAudienceOpen: open }),
  setLaserColor: (color) => set({ laserColor: color }),
  setLaserSize: (size) => set({ laserSize: size }),
}))
