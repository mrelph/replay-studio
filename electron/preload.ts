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

  // Project save/load
  saveProject: async (defaultName: string) => {
    try {
      return await ipcRenderer.invoke('dialog:saveProject', defaultName)
    } catch (err) {
      console.error('saveProject error:', err)
      return null
    }
  },
  loadProject: async () => {
    try {
      return await ipcRenderer.invoke('dialog:loadProject')
    } catch (err) {
      console.error('loadProject error:', err)
      return null
    }
  },
  writeFile: async (filePath: string, content: string) => {
    try {
      return await ipcRenderer.invoke('file:write', filePath, content)
    } catch (err) {
      console.error('writeFile error:', err)
      return { success: false, error: err instanceof Error ? err.message : 'Write failed' }
    }
  },
  readFile: async (filePath: string) => {
    try {
      return await ipcRenderer.invoke('file:read', filePath)
    } catch (err) {
      console.error('readFile error:', err)
      return { success: false, error: err instanceof Error ? err.message : 'Read failed' }
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
  onSaveProject: (callback: () => void) => {
    ipcRenderer.on('save-project', () => callback())
  },
  onLoadProject: (callback: () => void) => {
    ipcRenderer.on('load-project', () => callback())
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
  removeSaveProjectListener: () => {
    ipcRenderer.removeAllListeners('save-project')
  },
  removeLoadProjectListener: () => {
    ipcRenderer.removeAllListeners('load-project')
  },
})
