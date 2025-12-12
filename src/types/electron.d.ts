export interface ElectronAPI {
  openFile: () => Promise<string | null>
  saveFile: (defaultName: string) => Promise<string | null>
  onFileOpened: (callback: (filePath: string) => void) => void
  onExportClip: (callback: () => void) => void
  onShowShortcuts: (callback: () => void) => void
  removeFileOpenedListener: () => void
  removeExportClipListener: () => void
  removeShowShortcutsListener: () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
