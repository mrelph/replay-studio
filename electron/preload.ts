import { contextBridge, ipcRenderer } from 'electron'

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  openFile: async () => {
    try {
      const result = await ipcRenderer.invoke('dialog:openFile')
      console.log('openFile result:', result)
      return result
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

  // Event listeners
  onFileOpened: (callback: (filePath: string) => void) => {
    ipcRenderer.on('file-opened', (_, filePath) => {
      console.log('file-opened event:', filePath)
      callback(filePath)
    })
  },
  onExportClip: (callback: () => void) => {
    ipcRenderer.on('export-clip', () => callback())
  },
  onShowShortcuts: (callback: () => void) => {
    ipcRenderer.on('show-shortcuts', () => callback())
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
})

console.log('Preload script loaded, electronAPI exposed')
