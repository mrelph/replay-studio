import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from '@/components/ui/Toast'
import type { ExportFolderInfo } from '@/types/electron'

/** Last path segment of a folder path, for display ("/a/b/Downloads" → "Downloads"). */
export function folderDisplayName(folder: string): string {
  const trimmed = folder.replace(/[\\/]+$/, '')
  if (!trimmed) return folder
  const parts = trimmed.split(/[\\/]/)
  return parts[parts.length - 1] || trimmed
}

/**
 * The export folder setting as the clips and reel dialogs see it: read from
 * main on open, kept current while open (the File menu can change it), and
 * changed only through main's folder picker.
 *
 * `folder` is null until loaded and while no folder is usable; `needsFolder`
 * is true when main could not authorize any folder, not even Downloads.
 */
export function useExportFolder() {
  const [info, setInfo] = useState<ExportFolderInfo | null>(null)
  const infoRef = useRef<ExportFolderInfo | null>(null)

  const apply = useCallback((next: ExportFolderInfo) => {
    infoRef.current = next
    setInfo(next)
  }, [])

  useEffect(() => {
    const api = typeof window !== 'undefined' ? window.electronAPI : undefined
    if (!api) return
    let stale = false
    const unsubscribe = api.onExportFolderChanged((next) => {
      // A change event is newer than the initial read, whichever resolves last.
      stale = true
      apply(next)
    })
    api.getExportFolder().then(
      (next) => {
        if (!stale) apply(next)
      },
      (err) => {
        console.error('getExportFolder failed:', err)
        toast('error', `Couldn't read the export folder: ${err instanceof Error ? err.message : String(err)}`)
      }
    )
    return () => {
      stale = true
      unsubscribe()
    }
  }, [apply])

  const changeFolder = useCallback(async () => {
    if (typeof window === 'undefined' || !window.electronAPI) return
    try {
      const next = await window.electronAPI.chooseExportFolder()
      if (next) apply(next)
    } catch (err) {
      console.error('chooseExportFolder failed:', err)
      toast('error', `Couldn't open the folder picker: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [apply])

  /**
   * Re-reads the folder just before an export, since it may have been deleted
   * since the dialog opened (main then falls back to Downloads). Resolves to
   * the folder to export into, or null when there is none.
   */
  const resolveFolderForExport = useCallback(async (): Promise<string | null> => {
    let next: ExportFolderInfo
    try {
      next = await window.electronAPI.getExportFolder()
    } catch (err) {
      toast('error', `Couldn't read the export folder: ${err instanceof Error ? err.message : String(err)}`)
      return null
    }
    const shown = infoRef.current
    apply(next)
    if (!next.usable) {
      toast('error', 'The export folder is missing. Choose an export folder.')
      return null
    }
    if (shown?.usable && shown.path !== next.path && next.isDefault) {
      toast('info', 'Export folder is missing. Saving to Downloads instead.')
    }
    return next.path
  }, [apply])

  return {
    folder: info?.usable ? info.path : null,
    needsFolder: info !== null && !info.usable,
    changeFolder,
    resolveFolderForExport,
  }
}
