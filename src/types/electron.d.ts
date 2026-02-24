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

export interface FileResult {
  success: boolean
  content?: string
  error?: string
}

export interface LaserPosition {
  x: number
  y: number
  visible: boolean
}

export interface ElectronAPI {
  // File dialogs
  openFile: () => Promise<string | null>
  saveFile: (defaultName: string) => Promise<string | null>

  // FFmpeg export
  getFFmpegVersion: () => Promise<string | null>
  exportVideo: (options: ExportOptions) => Promise<ExportResult>
  resolveVideoPath: (videoUrl: string) => Promise<string>

  // Project save/load
  saveProject: (defaultName: string) => Promise<string | null>
  loadProject: () => Promise<string | null>
  writeFile: (filePath: string, content: string) => Promise<ExportResult>
  readFile: (filePath: string) => Promise<FileResult>

  // Audience view
  openAudienceView: () => Promise<void>
  closeAudienceView: () => Promise<void>
  sendFrameToAudience: (frameData: string) => void
  sendLaserPosition: (pos: LaserPosition) => void
  onAudienceFrame: (callback: (frameData: string) => void) => void
  onAudienceLaser: (callback: (pos: LaserPosition) => void) => void
  onAudienceClosed: (callback: () => void) => void
  onAudienceReady: (callback: () => void) => void
  removeAudienceFrameListener: () => void
  removeAudienceLaserListener: () => void
  removeAudienceClosedListener: () => void
  removeAudienceReadyListener: () => void

  // Event listeners
  onFileOpened: (callback: (filePath: string) => void) => void
  onExportClip: (callback: () => void) => void
  onShowShortcuts: (callback: () => void) => void
  onExportProgress: (callback: (progress: ExportProgress) => void) => void
  onSaveProject: (callback: () => void) => void
  onLoadProject: (callback: () => void) => void

  // Remove listeners
  removeFileOpenedListener: () => void
  removeExportClipListener: () => void
  removeShowShortcutsListener: () => void
  removeExportProgressListener: () => void
  removeSaveProjectListener: () => void
  removeLoadProjectListener: () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
