import type { VideoProbe, ClipEncodeStartOptions, ClipEncodeStartResult } from './clip'

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

export interface RegisterVideoResult {
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
  /** Absolute path of a dropped File (replaces File.path, removed in Electron 32). */
  getPathForFile: (file: File) => string | null
  openFile: () => Promise<string | null>
  saveFile: (defaultName: string) => Promise<string | null>

  // FFmpeg export
  getFFmpegVersion: () => Promise<string | null>
  exportVideo: (options: ExportOptions) => Promise<ExportResult>
  resolveVideoPath: (videoUrl: string) => Promise<string>
  /**
   * Authorize a video file for the local-video:// protocol. Must succeed before
   * a `local-video://<encodeURIComponent(path)>` URL will load: required for
   * drag-and-drop, recent files, and a project's stored videoPath. Paths coming
   * from openFile()/the File menu are registered by the main process already.
   */
  registerVideo: (filePath: string) => Promise<RegisterVideoResult>

  // Multi-clip export (see docs/CLIPS_PLAN.md)
  /** Width/height/fps/duration/audio of a registered video path. */
  probeVideo: (filePath: string) => Promise<VideoProbe | { error: string }>
  /** Folder picker; the returned folder is authorized for export writes. */
  chooseExportFolder: () => Promise<string | null>
  clipEncodeStart: (options: ClipEncodeStartOptions) => Promise<ClipEncodeStartResult>
  /** Resolves once ffmpeg has accepted the frame (backpressure); false if the job is gone. */
  clipEncodeFrame: (jobId: string, jpeg: Uint8Array) => Promise<boolean>
  clipEncodeFinish: (jobId: string) => Promise<ExportResult>
  clipEncodeCancel: (jobId: string) => Promise<void>

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
