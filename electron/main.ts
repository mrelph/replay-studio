import { app, BrowserWindow, ipcMain, dialog, Menu, protocol, screen, type WebContents } from 'electron'
import path from 'path'
import fs from 'fs'
import fsp from 'fs/promises'
import { Readable } from 'stream'
import { fileURLToPath, pathToFileURL } from 'url'
import { exportVideo, getFFmpegVersion, type ExportOptions, type ExportProgress } from './ffmpegExport'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Register the custom protocol as privileged (must be done before app ready)
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'local-video',
    privileges: {
      // `standard` is required for Chromium's media loader to issue follow-up
      // Range requests; without it large files fail with MEDIA_ERR code 4.
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true,
      corsEnabled: true
    }
  }
])

const LOCAL_VIDEO_PREFIX = 'local-video://'
// Standard schemes lowercase the host, so the path lives in the URL path
// under a fixed host: `local-video://video/<encodeURIComponent(absPath)>`.
const LOCAL_VIDEO_URL_BASE = `${LOCAL_VIDEO_PREFIX}video/`

const VIDEO_MIME_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.avi': 'video/x-msvideo',
  '.mov': 'video/quicktime',
  '.mkv': 'video/x-matroska',
}

const VIDEO_EXTENSIONS = new Set(Object.keys(VIDEO_MIME_TYPES))

/**
 * Capability sets. The renderer is untrusted: it may only reach a file on disk
 * through a path that the user themselves selected in this session (a dialog,
 * the File menu, or an explicit `video:register` of a real video file).
 * Entries are canonical (realpath'd) absolute paths.
 */
const registeredVideoPaths = new Set<string>()
const dialogApprovedWritePaths = new Set<string>()
const dialogApprovedReadPaths = new Set<string>()

/**
 * The single place local-video URLs are decoded. Accepts the current
 * `local-video://video/<encoded path>` form and the pre-standard-scheme
 * `local-video://<encoded path>` form that older saved projects may contain.
 */
function pathFromLocalVideoUrl(videoUrl: string): string | null {
  if (typeof videoUrl !== 'string' || !videoUrl.startsWith(LOCAL_VIDEO_PREFIX)) return null
  const encoded = videoUrl.startsWith(LOCAL_VIDEO_URL_BASE)
    ? videoUrl.slice(LOCAL_VIDEO_URL_BASE.length)
    : videoUrl.slice(LOCAL_VIDEO_PREFIX.length)
  try {
    return decodeURIComponent(encoded)
  } catch {
    return null
  }
}

/** Canonicalize for allowlist comparisons; null when the path does not exist. */
async function canonicalize(filePath: string): Promise<string | null> {
  if (typeof filePath !== 'string' || filePath.length === 0) return null
  if (!path.isAbsolute(filePath)) return null
  try {
    return await fsp.realpath(filePath)
  } catch {
    return null
  }
}

/**
 * Canonical form for a file that may not exist yet (a save target): resolve the
 * containing directory, keep the basename. Used so the path the renderer later
 * passes to `file:write` compares equal to the one the save dialog returned.
 */
async function canonicalizeTarget(filePath: string): Promise<string | null> {
  if (typeof filePath !== 'string' || filePath.length === 0) return null
  if (!path.isAbsolute(filePath)) return null
  const existing = await canonicalize(filePath)
  if (existing) return existing
  const dir = await canonicalize(path.dirname(filePath))
  if (!dir) return null
  return path.join(dir, path.basename(filePath))
}

/**
 * Gate for `local-video://`. A path is only servable after it has been
 * registered here, and registration requires an existing regular file with a
 * known video extension. Save-dialog paths are canonicalized the same way.
 */
async function registerVideoPath(filePath: string): Promise<{ success: boolean; error?: string }> {
  const real = await canonicalize(filePath)
  if (!real) return { success: false, error: 'Invalid or missing file path' }
  try {
    const stat = await fsp.stat(real)
    if (!stat.isFile()) return { success: false, error: 'Not a regular file' }
  } catch {
    return { success: false, error: 'File not found' }
  }
  if (!VIDEO_EXTENSIONS.has(path.extname(real).toLowerCase())) {
    return { success: false, error: 'Unsupported video file type' }
  }
  registeredVideoPaths.add(real)
  return { success: true }
}

type ByteRange = { start: number; end: number }

/** RFC 7233 single-range parsing. Multi-range requests fall back to a 200. */
function parseRangeHeader(header: string, size: number): ByteRange | 'unsatisfiable' | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!match) return null
  const [, rawStart, rawEnd] = match
  if (rawStart === '' && rawEnd === '') return null

  let start: number
  let end: number
  if (rawStart === '') {
    // Suffix range: the last N bytes.
    const suffix = Number(rawEnd)
    if (!Number.isFinite(suffix) || suffix <= 0) return 'unsatisfiable'
    start = Math.max(0, size - suffix)
    end = size - 1
  } else {
    start = Number(rawStart)
    end = rawEnd === '' ? size - 1 : Number(rawEnd)
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null
    if (start >= size) return 'unsatisfiable'
    if (end >= size) end = size - 1
    if (end < start) return 'unsatisfiable'
  }
  if (size === 0) return 'unsatisfiable'
  return { start, end }
}

function textResponse(status: number, message: string, extraHeaders: Record<string, string> = {}) {
  return new Response(message, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8', ...extraHeaders },
  })
}

/**
 * Serves a registered video file with Range support so `<video>` can seek.
 * `protocol.handle` (Electron >= 25) replaces the deprecated
 * `protocol.registerFileProtocol`; the body is a Node read stream adapted to a
 * web stream, and ranges are honoured explicitly rather than relying on
 * `net.fetch(file://)` range behaviour.
 */
async function handleLocalVideoRequest(request: GlobalRequest): Promise<GlobalResponse> {
  const requestedPath = pathFromLocalVideoUrl(request.url)
  if (!requestedPath) return textResponse(400, 'Bad local-video request')

  const real = await canonicalize(requestedPath)
  if (!real) return textResponse(404, 'Not found')
  if (!registeredVideoPaths.has(real)) return textResponse(403, 'Forbidden')

  let size: number
  try {
    const stat = await fsp.stat(real)
    if (!stat.isFile()) return textResponse(403, 'Forbidden')
    size = stat.size
  } catch {
    return textResponse(404, 'Not found')
  }

  const baseHeaders: Record<string, string> = {
    'content-type': VIDEO_MIME_TYPES[path.extname(real).toLowerCase()] || 'video/mp4',
    'accept-ranges': 'bytes',
    'access-control-allow-origin': '*',
    'cache-control': 'no-store',
  }

  if (request.method === 'HEAD') {
    return new Response(null, { status: 200, headers: { ...baseHeaders, 'content-length': String(size) } })
  }
  if (request.method !== 'GET') {
    return textResponse(405, 'Method not allowed', { allow: 'GET, HEAD' })
  }

  const rangeHeader = request.headers.get('range')
  if (rangeHeader) {
    const range = parseRangeHeader(rangeHeader, size)
    if (range === 'unsatisfiable') {
      return new Response(null, {
        status: 416,
        headers: { ...baseHeaders, 'content-range': `bytes */${size}` },
      })
    }
    if (range) {
      const stream = fs.createReadStream(real, { start: range.start, end: range.end })
      return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
        status: 206,
        headers: {
          ...baseHeaders,
          'content-range': `bytes ${range.start}-${range.end}/${size}`,
          'content-length': String(range.end - range.start + 1),
        },
      })
    }
  }

  const stream = fs.createReadStream(real)
  return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
    status: 200,
    headers: { ...baseHeaders, 'content-length': String(size) },
  })
}

const rendererFileUrlPrefix = pathToFileURL(path.join(__dirname, '../dist/')).toString()

/** True only for the app's own renderer entry (dev server URL or bundled dist). */
function isAppUrl(url: string): boolean {
  const devServerUrl = process.env.VITE_DEV_SERVER_URL
  if (devServerUrl && url.startsWith(devServerUrl)) return true
  return url.startsWith(rendererFileUrlPrefix)
}

/** Deny in-app navigation away from the app and any new-window/popup request. */
function hardenWebContents(contents: WebContents) {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
  contents.on('will-navigate', (event, url) => {
    if (!isAppUrl(url)) {
      event.preventDefault()
    }
  })
  contents.on('will-attach-webview', (event) => {
    event.preventDefault()
  })
}

let mainWindow: BrowserWindow | null = null
let audienceWindow: BrowserWindow | null = null

function createAudienceWindow() {
  if (audienceWindow) {
    audienceWindow.focus()
    return
  }

  const preloadPath = path.join(__dirname, 'preload.cjs')
  const displays = screen.getAllDisplays()
  const primaryDisplay = screen.getPrimaryDisplay()

  // Use secondary display if available, otherwise primary
  const targetDisplay = displays.length > 1
    ? displays.find(d => d.id !== primaryDisplay.id) || primaryDisplay
    : primaryDisplay

  const { x, y, width, height } = targetDisplay.bounds

  audienceWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    fullscreen: true,
    frame: false,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    backgroundColor: '#000000',
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      // preload.cjs only requires 'electron' (contextBridge/ipcRenderer), which
      // is available to sandboxed preloads.
      sandbox: true,
      webviewTag: false,
    },
  })

  hardenWebContents(audienceWindow.webContents)

  // Load the same app with ?audience=true query parameter
  if (process.env.VITE_DEV_SERVER_URL) {
    audienceWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}?audience=true`)
  } else {
    audienceWindow.loadFile(path.join(__dirname, '../dist/index.html'), {
      query: { audience: 'true' }
    })
  }

  audienceWindow.webContents.on('did-finish-load', () => {
    mainWindow?.webContents.send('audience-ready')
  })

  audienceWindow.on('closed', () => {
    audienceWindow = null
    mainWindow?.webContents.send('audience-closed')
  })
}

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
      // preload.cjs only requires 'electron' (contextBridge/ipcRenderer), which
      // is available to sandboxed preloads.
      sandbox: true,
      webviewTag: false,
    },
    backgroundColor: '#111827',
    titleBarStyle: 'default',
    show: false,
  })

  hardenWebContents(mainWindow.webContents)

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
              // The user picked it, so it is allowed to be served over local-video://
              await registerVideoPath(result.filePaths[0])
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
        { type: 'separator' },
        {
          label: 'Audience View',
          accelerator: 'CmdOrCtrl+Shift+A',
          click: () => {
            if (audienceWindow) {
              audienceWindow.close()
            } else {
              createAudienceWindow()
            }
          },
        },
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
    if (audienceWindow && !audienceWindow.isDestroyed()) {
      audienceWindow.close()
    }
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
    await registerVideoPath(result.filePaths[0])
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
    const approved = await canonicalizeTarget(result.filePath)
    if (approved) dialogApprovedWritePaths.add(approved)
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
    const approved = await canonicalizeTarget(result.filePath)
    if (approved) dialogApprovedWritePaths.add(approved)
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
    const approved = await canonicalize(result.filePaths[0])
    if (approved) dialogApprovedReadPaths.add(approved)
    return result.filePaths[0]
  }
  return null
})

// File read/write for projects. Both are capability-gated: the renderer can
// only touch paths the user picked in a dialog during this session.
ipcMain.handle('file:write', async (_, filePath: string, content: string) => {
  const target = await canonicalizeTarget(filePath)
  if (!target || !dialogApprovedWritePaths.has(target)) {
    return { success: false, error: 'Write denied: path was not chosen in a save dialog' }
  }
  if (typeof content !== 'string') {
    return { success: false, error: 'Write denied: content must be a string' }
  }
  try {
    await fsp.writeFile(target, content, 'utf-8')
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Write failed' }
  }
})

ipcMain.handle('file:read', async (_, filePath: string) => {
  const target = await canonicalize(filePath)
  if (!target || !dialogApprovedReadPaths.has(target)) {
    return { success: false, error: 'Read denied: path was not chosen in an open dialog' }
  }
  try {
    const content = await fsp.readFile(target, 'utf-8')
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

ipcMain.handle('ffmpeg:export', async (_event, options: ExportOptions) => {
  // Same capability gate as file:*: read a registered video, write only where a
  // save dialog pointed.
  const input = await canonicalize(options?.inputPath)
  if (!input || !registeredVideoPaths.has(input)) {
    return { success: false, error: 'Export denied: source video is not a registered file' }
  }
  const output = await canonicalizeTarget(options?.outputPath)
  if (!output || !dialogApprovedWritePaths.has(output)) {
    return { success: false, error: 'Export denied: destination was not chosen in a save dialog' }
  }
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

// Audience view IPC handlers
ipcMain.handle('audience:open', () => {
  createAudienceWindow()
})

ipcMain.handle('audience:close', () => {
  if (audienceWindow) {
    audienceWindow.close()
  }
})

ipcMain.on('audience:frame', (_, frameData: string) => {
  if (audienceWindow && !audienceWindow.isDestroyed()) {
    audienceWindow.webContents.send('audience:frame', frameData)
  }
})

ipcMain.on('audience:laser', (_, pos: { x: number; y: number; visible: boolean }) => {
  if (audienceWindow && !audienceWindow.isDestroyed()) {
    audienceWindow.webContents.send('audience:laser', pos)
  }
})

// Resolve local-video:// protocol to actual file path
ipcMain.handle('video:resolvePath', async (_, videoUrl: string) => {
  return pathFromLocalVideoUrl(videoUrl) ?? videoUrl
})

// The single gate for local-video://. The renderer must call this (and get
// success) before a path can be served — drag-and-drop, recent files and a
// project's stored videoPath all go through here.
ipcMain.handle('video:register', async (_, filePath: string) => {
  return registerVideoPath(filePath)
})

app.whenReady().then(() => {
  // Serve local video files (modern replacement for registerFileProtocol),
  // allowlist-checked and with Range support so <video> can seek.
  protocol.handle('local-video', handleLocalVideoRequest)

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
