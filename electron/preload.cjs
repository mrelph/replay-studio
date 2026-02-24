const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
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
      const result = await ipcRenderer.invoke('dialog:saveFile', defaultName);
      return result;
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

  // Project save/load
  saveProject: async (defaultName) => {
    try {
      return await ipcRenderer.invoke('dialog:saveProject', defaultName);
    } catch (err) {
      console.error('saveProject error:', err);
      return null;
    }
  },
  loadProject: async () => {
    try {
      return await ipcRenderer.invoke('dialog:loadProject');
    } catch (err) {
      console.error('loadProject error:', err);
      return null;
    }
  },
  writeFile: async (filePath, content, encoding) => {
    try {
      return await ipcRenderer.invoke('file:write', filePath, content, encoding);
    } catch (err) {
      console.error('writeFile error:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Write failed' };
    }
  },
  readFile: async (filePath) => {
    try {
      return await ipcRenderer.invoke('file:read', filePath);
    } catch (err) {
      console.error('readFile error:', err);
      return { success: false, error: err instanceof Error ? err.message : 'Read failed' };
    }
  },

  // Audience view
  openAudienceView: async () => {
    try {
      return await ipcRenderer.invoke('audience:open');
    } catch (err) {
      console.error('openAudienceView error:', err);
    }
  },
  closeAudienceView: async () => {
    try {
      return await ipcRenderer.invoke('audience:close');
    } catch (err) {
      console.error('closeAudienceView error:', err);
    }
  },
  sendFrameToAudience: (frameData) => {
    ipcRenderer.send('audience:frame', frameData);
  },
  sendLaserPosition: (pos) => {
    ipcRenderer.send('audience:laser', pos);
  },
  onAudienceFrame: (callback) => {
    ipcRenderer.on('audience:frame', (_, frameData) => callback(frameData));
  },
  onAudienceLaser: (callback) => {
    ipcRenderer.on('audience:laser', (_, pos) => callback(pos));
  },
  onAudienceClosed: (callback) => {
    ipcRenderer.on('audience-closed', () => callback());
  },
  onAudienceReady: (callback) => {
    ipcRenderer.on('audience-ready', () => callback());
  },
  removeAudienceFrameListener: () => {
    ipcRenderer.removeAllListeners('audience:frame');
  },
  removeAudienceLaserListener: () => {
    ipcRenderer.removeAllListeners('audience:laser');
  },
  removeAudienceClosedListener: () => {
    ipcRenderer.removeAllListeners('audience-closed');
  },
  removeAudienceReadyListener: () => {
    ipcRenderer.removeAllListeners('audience-ready');
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
  onSaveProject: (callback) => {
    ipcRenderer.on('save-project', () => callback());
  },
  onLoadProject: (callback) => {
    ipcRenderer.on('load-project', () => callback());
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
  },
  removeSaveProjectListener: () => {
    ipcRenderer.removeAllListeners('save-project');
  },
  removeLoadProjectListener: () => {
    ipcRenderer.removeAllListeners('load-project');
  },
});
