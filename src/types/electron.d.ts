export interface ExportOptions {
  inputPath: string
  outputPath: string
  startTime?: number
  endTime?: number
  quality: 'high' | 'medium' | 'low'
  fps: number
  format: 'mp4' | 'gif'
}

export interface ExportProgress {
  percent: number
  frame?: number
  fps?: number
  time?: string
}

export interface ExportResult {
  success: boolean
  error?: string
}

export interface ElectronAPI {
  // File dialogs
  openFile: () => Promise<string | null>
  saveFile: (defaultName: string) => Promise<string | null>

  // FFmpeg export
  getFFmpegVersion: () => Promise<string | null>
  exportVideo: (options: ExportOptions) => Promise<ExportResult>
  resolveVideoPath: (videoUrl: string) => Promise<string>

  // Event listeners
  onFileOpened: (callback: (filePath: string) => void) => void
  onExportClip: (callback: () => void) => void
  onShowShortcuts: (callback: () => void) => void
  onExportProgress: (callback: (progress: ExportProgress) => void) => void

  // Remove listeners
  removeFileOpenedListener: () => void
  removeExportClipListener: () => void
  removeShowShortcutsListener: () => void
  removeExportProgressListener: () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
