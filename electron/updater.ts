import { app, type WebContents } from 'electron'

/**
 * Auto-update, backed by electron-updater against GitHub Releases
 * (mrelph/replay-studio). Only Linux AppImage and Windows NSIS installs can
 * self-update: a `.deb`/pacman install has no update mechanism to run
 * (there's no writable install to replace in place), so we skip silently
 * rather than surface an error for something the user cannot act on.
 *
 * Design:
 * - Checks on launch and every 4 hours while running.
 * - Downloads quietly in the background (autoDownload).
 * - Once downloaded, tells the renderer over IPC so it can show a
 *   non-blocking "Update ready" banner; the user chooses when to restart.
 * - `autoInstallOnAppQuit` means even if they never click "Restart now", the
 *   update installs the next time they quit on their own.
 *
 * The platform/environment gating is a pure function (`updatesAreSupported`)
 * so it can be unit tested without touching electron-updater or the
 * filesystem — see electron/updater.test.ts.
 */

const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000 // 4 hours

export interface UpdateEnv {
  platform: NodeJS.Platform
  isPackaged: boolean
  /** process.env.APPIMAGE, when running as an AppImage. */
  appImagePath: string | undefined
}

/**
 * Whether this running instance is capable of self-updating.
 *
 * - Never in dev (unpackaged): there is nothing installed to replace.
 * - Windows: NSIS installs can always self-update.
 * - Linux: only when running from an AppImage (electron-updater's
 *   AppImageUpdater re-execs the AppImage in place). A `.deb`/pacman install
 *   isn't a single relocatable file, so electron-updater can't update it.
 * - Any other platform (e.g. macOS): unsupported — this app ships no macOS
 *   target.
 */
export function updatesAreSupported(env: UpdateEnv): boolean {
  if (!env.isPackaged) return false
  if (env.platform === 'win32') return true
  if (env.platform === 'linux') return Boolean(env.appImagePath)
  return false
}

export function currentUpdateEnv(): UpdateEnv {
  return {
    platform: process.platform,
    isPackaged: app.isPackaged,
    appImagePath: process.env.APPIMAGE,
  }
}

export type UpdateCheckStatus = 'up-to-date' | 'available' | 'unsupported' | 'error'

export interface UpdateCheckResultForRenderer {
  status: UpdateCheckStatus
  version?: string
  message?: string
}

/** Renderer-facing IPC channel names, kept here so main.ts and this module agree. */
export const UPDATE_CHANNELS = {
  available: 'update:available',
  downloaded: 'update:downloaded',
  error: 'update:error',
} as const

interface UpdateAvailablePayload {
  version: string
}

interface UpdateDownloadedPayload {
  version: string
  releaseNotes?: string
}

interface UpdateErrorPayload {
  message: string
}

/** Narrow surface of electron-updater's autoUpdater this module depends on, so it's mockable in tests. */
export interface AutoUpdaterLike {
  autoDownload: boolean
  autoInstallOnAppQuit: boolean
  allowPrerelease: boolean
  currentVersion: { version: string }
  checkForUpdates(): Promise<{ updateInfo?: { version: string } } | null>
  quitAndInstall(isSilent?: boolean, isForceRunAfter?: boolean): void
  on(event: 'update-available', listener: (info: { version: string }) => void): unknown
  on(event: 'update-downloaded', listener: (info: { version: string; releaseNotes?: string | { note?: string | null }[] | null }) => void): unknown
  on(event: 'error', listener: (error: Error) => void): unknown
}

function extractReleaseNotes(
  releaseNotes: string | { note?: string | null }[] | null | undefined
): string | undefined {
  if (typeof releaseNotes === 'string') return releaseNotes
  if (Array.isArray(releaseNotes)) {
    return releaseNotes
      .map((entry) => entry.note)
      .filter((note): note is string => Boolean(note))
      .join('\n\n') || undefined
  }
  return undefined
}

export class UpdaterController {
  private intervalHandle: ReturnType<typeof setInterval> | null = null
  private getMainWindow: (() => BrowserWindowLike | null) | null = null

  constructor(
    private readonly autoUpdater: AutoUpdaterLike,
    private readonly env: UpdateEnv
  ) {}

  get supported(): boolean {
    return updatesAreSupported(this.env)
  }

  /** Wire listeners, do the launch check, and start the 4-hour interval. Only when supported. */
  start(getMainWindow: () => BrowserWindowLike | null): void {
    if (!this.supported) return

    this.getMainWindow = getMainWindow
    this.autoUpdater.autoDownload = true
    this.autoUpdater.autoInstallOnAppQuit = true
    this.autoUpdater.allowPrerelease = false

    this.autoUpdater.on('update-available', (info) => {
      this.send(getMainWindow(), UPDATE_CHANNELS.available, { version: info.version } satisfies UpdateAvailablePayload)
    })

    this.autoUpdater.on('update-downloaded', (info) => {
      this.send(getMainWindow(), UPDATE_CHANNELS.downloaded, {
        version: info.version,
        releaseNotes: extractReleaseNotes(info.releaseNotes),
      } satisfies UpdateDownloadedPayload)
    })

    this.autoUpdater.on('error', (error) => {
      // Background checks fail silently (log only) per spec; user-initiated
      // checks report their own error through checkForUpdatesNow()'s return
      // value instead of this event, so this handler never needs to
      // distinguish the two — it just logs.
      console.error('[updater] background update error:', error)
    })

    void this.checkQuietly()
    this.intervalHandle = setInterval(() => void this.checkQuietly(), CHECK_INTERVAL_MS)
  }

  /** Clean up the interval; call on app quit. */
  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle)
      this.intervalHandle = null
    }
  }

  private async checkQuietly(): Promise<void> {
    try {
      await this.autoUpdater.checkForUpdates()
    } catch (error) {
      console.error('[updater] background check failed:', error)
    }
  }

  /**
   * User-initiated check, driven by the "Check for Updates…" menu item (and,
   * if the renderer ever calls window.electronAPI.checkForUpdates(), by it
   * too). On failure this both returns an 'error' result *and* forwards
   * `update:error` to the renderer — unlike the silent background check,
   * which only logs.
   */
  async checkForUpdatesNow(): Promise<UpdateCheckResultForRenderer> {
    if (!this.supported) {
      return { status: 'unsupported' }
    }
    try {
      const result = await this.autoUpdater.checkForUpdates()
      const latestVersion = result?.updateInfo?.version
      const current = this.autoUpdater.currentVersion.version
      if (latestVersion && latestVersion !== current) {
        return { status: 'available', version: latestVersion }
      }
      return { status: 'up-to-date', version: current }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Update check failed'
      this.send(this.getMainWindow?.() ?? null, UPDATE_CHANNELS.error, { message } satisfies UpdateErrorPayload)
      return { status: 'error', message }
    }
  }

  installNow(): void {
    this.autoUpdater.quitAndInstall()
  }

  private send<T>(win: BrowserWindowLike | null, channel: string, payload: T): void {
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, payload)
    }
  }
}

/** Minimal BrowserWindow surface this module needs, so it doesn't import 'electron' types just for that. */
export interface BrowserWindowLike {
  isDestroyed(): boolean
  webContents: WebContents
}
