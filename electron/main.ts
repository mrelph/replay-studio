import { app, BrowserWindow, ipcMain, dialog, Menu, protocol } from 'electron'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { exportVideo, getFFmpegVersion, type ExportOptions, type ExportProgress } from './ffmpegExport'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Register the custom protocol as privileged (must be done before app ready)
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'local-video',
    privileges: {
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true
    }
  }
])

let mainWindow: BrowserWindow | null = null

function createWindow() {
  const preloadPath = path.join(__dirname, 'preload.cjs')

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false, // Required for preload scripts in newer Electron
      webSecurity: false, // Allow loading local video files
    },
    backgroundColor: '#111827',
    titleBarStyle: 'default',
    show: false,
  })

  // Build the menu
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Video...',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow!, {
              properties: ['openFile'],
              filters: [
                { name: 'Video Files', extensions: ['mp4', 'avi', 'mov', 'mkv', 'webm'] },
                { name: 'All Files', extensions: ['*'] },
              ],
            })
            if (!result.canceled && result.filePaths.length > 0) {
              mainWindow?.webContents.send('file-opened', result.filePaths[0])
            }
          },
        },
        { type: 'separator' },
        {
          label: 'Export Clip...',
          accelerator: 'CmdOrCtrl+E',
          click: () => {
            mainWindow?.webContents.send('export-clip')
          },
        },
        { type: 'separator' },
        {
          label: 'Save Project...',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            mainWindow?.webContents.send('save-project')
          },
        },
        {
          label: 'Load Project...',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => {
            mainWindow?.webContents.send('load-project')
          },
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Keyboard Shortcuts',
          accelerator: 'CmdOrCtrl+/',
          click: () => {
            mainWindow?.webContents.send('show-shortcuts')
          },
        },
        {
          label: 'About Replay Studio',
          click: () => {
            dialog.showMessageBox(mainWindow!, {
              type: 'info',
              title: 'About Replay Studio',
              message: 'Replay Studio',
              detail: 'Version 1.0.0\n\nA video markup application with telestrator-style drawing tools.',
            })
          },
        },
      ],
    },
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)

  // Load the app
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// IPC Handlers
ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    filters: [
      { name: 'Video Files', extensions: ['mp4', 'avi', 'mov', 'mkv', 'webm'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  })
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0]
  }
  return null
})

ipcMain.handle('dialog:saveFile', async (_, defaultName: string) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    defaultPath: defaultName,
    filters: [
      { name: 'MP4 Video', extensions: ['mp4'] },
      { name: 'GIF Animation', extensions: ['gif'] },
    ],
  })
  if (!result.canceled && result.filePath) {
    return result.filePath
  }
  return null
})

// Project file handlers
ipcMain.handle('dialog:saveProject', async (_, defaultName: string) => {
  const result = await dialog.showSaveDialog(mainWindow!, {
    defaultPath: defaultName || 'project.rsproj',
    filters: [
      { name: 'Replay Studio Project', extensions: ['rsproj'] },
      { name: 'JSON', extensions: ['json'] },
    ],
  })
  if (!result.canceled && result.filePath) {
    return result.filePath
  }
  return null
})

ipcMain.handle('dialog:loadProject', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    filters: [
      { name: 'Replay Studio Project', extensions: ['rsproj', 'json'] },
    ],
  })
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0]
  }
  return null
})

// File read/write for projects
ipcMain.handle('file:write', async (_, filePath: string, content: string) => {
  try {
    fs.writeFileSync(filePath, content, 'utf-8')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Write failed' }
  }
})

ipcMain.handle('file:read', async (_, filePath: string) => {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    return { success: true, content }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Read failed' }
  }
})

// FFmpeg export handlers
ipcMain.handle('ffmpeg:getVersion', async () => {
  try {
    return await getFFmpegVersion()
  } catch {
    return null
  }
})

ipcMain.handle('ffmpeg:export', async (event, options: ExportOptions) => {
  try {
    await exportVideo(options, (progress: ExportProgress) => {
      // Send progress to renderer
      mainWindow?.webContents.send('export-progress', progress)
    })
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Export failed' }
  }
})

// Resolve local-video:// protocol to actual file path
ipcMain.handle('video:resolvePath', async (_, videoUrl: string) => {
  if (videoUrl.startsWith('local-video://')) {
    return decodeURIComponent(videoUrl.replace('local-video://', ''))
  }
  return videoUrl
})

app.whenReady().then(() => {
  // Register custom protocol for serving local video files
  protocol.registerFileProtocol('local-video', (request, callback) => {
    // Remove the protocol prefix and decode the URL
    const filePath = decodeURIComponent(request.url.replace('local-video://', ''))

    // Determine MIME type based on extension
    const ext = path.extname(filePath).toLowerCase()
    const mimeTypes: Record<string, string> = {
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.avi': 'video/x-msvideo',
      '.mov': 'video/quicktime',
      '.mkv': 'video/x-matroska',
    }

    callback({
      path: filePath,
      mimeType: mimeTypes[ext] || 'video/mp4'
    })
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
