const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // File dialogs
  openFile: async () => {
    try {
      return await ipcRenderer.invoke('dialog:openFile');
    } catch (err) {
      console.error('openFile error:', err);
      return null;
    }
  },
  saveFile: async (defaultName) => {
    try {
      return await ipcRenderer.invoke('dialog:saveFile', defaultName);
    } catch (err) {
      console.error('saveFile error:', err);
      return null;
    }
  },

  // FFmpeg export
  getFFmpegVersion: async () => {
    try {
      return await ipcRenderer.invoke('ffmpeg:getVersion');
    } catch (err) {
      console.error('getFFmpegVersion error:', err);
      return null;
    }
  },
  exportVideo: async (options) => {
    try {
      return await ipcRenderer.invoke('ffmpeg:export', options);
    } catch (err) {
      console.error('exportVideo error:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Export failed' };
    }
  },
  resolveVideoPath: async (videoUrl) => {
    try {
      return await ipcRenderer.invoke('video:resolvePath', videoUrl);
    } catch (err) {
      console.error('resolveVideoPath error:', err);
      return videoUrl;
    }
  },

  // Event listeners
  onFileOpened: (callback) => {
    ipcRenderer.on('file-opened', (_, filePath) => {
      callback(filePath);
    });
  },
  onExportClip: (callback) => {
    ipcRenderer.on('export-clip', () => callback());
  },
  onShowShortcuts: (callback) => {
    ipcRenderer.on('show-shortcuts', () => callback());
  },
  onExportProgress: (callback) => {
    ipcRenderer.on('export-progress', (_, progress) => callback(progress));
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
  },
  removeExportProgressListener: () => {
    ipcRenderer.removeAllListeners('export-progress');
  }
});
