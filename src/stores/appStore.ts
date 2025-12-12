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

  // Actions
  addRecentFile: (path: string) => void
  removeRecentFile: (path: string) => void
  clearRecentFiles: () => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      recentFiles: [],
      maxRecentFiles: 10,

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
    }),
    {
      name: 'replay-studio-storage',
      partialize: (state) => ({ recentFiles: state.recentFiles }),
    }
  )
)
