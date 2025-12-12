import { contextBridge, ipcRenderer } from 'electron'

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

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  openFile: async () => {
    try {
      return await ipcRenderer.invoke('dialog:openFile')
    } catch (err) {
      console.error('openFile error:', err)
      return null
    }
  },
  saveFile: async (defaultName: string) => {
    try {
      const result = await ipcRenderer.invoke('dialog:saveFile', defaultName)
      return result
    } catch (err) {
      console.error('saveFile error:', err)
      return null
    }
  },

  // FFmpeg export
  getFFmpegVersion: async () => {
    try {
      return await ipcRenderer.invoke('ffmpeg:getVersion')
    } catch (err) {
      console.error('getFFmpegVersion error:', err)
      return null
    }
  },
  exportVideo: async (options: ExportOptions) => {
    try {
      return await ipcRenderer.invoke('ffmpeg:export', options)
    } catch (err) {
      console.error('exportVideo error:', err)
      return { success: false, error: err instanceof Error ? err.message : 'Export failed' }
    }
  },
  resolveVideoPath: async (videoUrl: string) => {
    try {
      return await ipcRenderer.invoke('video:resolvePath', videoUrl)
    } catch (err) {
      console.error('resolveVideoPath error:', err)
      return videoUrl
    }
  },

  // Event listeners
  onFileOpened: (callback: (filePath: string) => void) => {
    ipcRenderer.on('file-opened', (_, filePath) => {
      callback(filePath)
    })
  },
  onExportClip: (callback: () => void) => {
    ipcRenderer.on('export-clip', () => callback())
  },
  onShowShortcuts: (callback: () => void) => {
    ipcRenderer.on('show-shortcuts', () => callback())
  },
  onExportProgress: (callback: (progress: ExportProgress) => void) => {
    ipcRenderer.on('export-progress', (_, progress) => callback(progress))
  },

  // Remove listeners
  removeFileOpenedListener: () => {
    ipcRenderer.removeAllListeners('file-opened')
  },
  removeExportClipListener: () => {
    ipcRenderer.removeAllListeners('export-clip')
  },
  removeShowShortcutsListener: () => {
    ipcRenderer.removeAllListeners('show-shortcuts')
  },
  removeExportProgressListener: () => {
    ipcRenderer.removeAllListeners('export-progress')
  },
})
