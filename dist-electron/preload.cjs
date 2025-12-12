const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: async () => {
    try {
      const result = await ipcRenderer.invoke('dialog:openFile');
      console.log('openFile result:', result);
      return result;
    } catch (err) {
      console.error('openFile error:', err);
      return null;
    }
  },
  saveFile: async (defaultName) => {
    try {
      const result = await ipcRenderer.invoke('dialog:saveFile', defaultName);
      return result;
    } catch (err) {
      console.error('saveFile error:', err);
      return null;
    }
  },
  // Event listeners
  onFileOpened: (callback) => {
    ipcRenderer.on('file-opened', (_, filePath) => {
      console.log('file-opened event:', filePath);
      callback(filePath);
    });
  },
  onExportClip: (callback) => {
    ipcRenderer.on('export-clip', () => callback());
  },
  onShowShortcuts: (callback) => {
    ipcRenderer.on('show-shortcuts', () => callback());
  },
  // Remove listeners
  removeFileOpenedListener: () => {
    ipcRenderer.removeAllListeners('file-opened');
  },
  removeExportClipListener: () => {
    ipcRenderer.removeAllListeners('export-clip');
  },
  removeShowShortcutsListener: () => {
    ipcRenderer.removeAllListeners('show-shortcuts');
  }
});

console.log('Preload script loaded, electronAPI exposed');
