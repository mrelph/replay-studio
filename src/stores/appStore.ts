import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface RecentFile {
  path: string
  name: string
  lastOpened: number
}

interface AppState {
  recentFiles: RecentFile[]
  maxRecentFiles: number
  /** True while any export dialog is encoding; not persisted. */
  exportRunning: boolean

  // Actions
  addRecentFile: (path: string) => void
  removeRecentFile: (path: string) => void
  clearRecentFiles: () => void
  setExportRunning: (running: boolean) => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      recentFiles: [],
      maxRecentFiles: 10,
      exportRunning: false,

      addRecentFile: (path) => {
        const name = path.split(/[/\\]/).pop() || path

        set((state) => {
          // Remove if already exists
          const filtered = state.recentFiles.filter((f) => f.path !== path)

          // Add to beginning
          const updated = [
            { path, name, lastOpened: Date.now() },
            ...filtered,
          ].slice(0, state.maxRecentFiles)

          return { recentFiles: updated }
        })
      },

      removeRecentFile: (path) => {
        set((state) => ({
          recentFiles: state.recentFiles.filter((f) => f.path !== path),
        }))
      },

      clearRecentFiles: () => {
        set({ recentFiles: [] })
      },

      setExportRunning: (running) => set({ exportRunning: running }),
    }),
    {
      name: 'replay-studio-storage',
      partialize: (state) => ({ recentFiles: state.recentFiles }),
    }
  )
)
