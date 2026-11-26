import { useCallback, useEffect, useState } from 'react'
import { toast } from '@/components/ui/Toast'

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
 */
export function useExportFolder() {
  const [folder, setFolder] = useState<string | null>(null)

  useEffect(() => {
    const api = typeof window !== 'undefined' ? window.electronAPI : undefined
    if (!api) return
    let stale = false
    const unsubscribe = api.onExportFolderChanged((info) => {
      // A change event is newer than the initial read, whichever resolves last.
      stale = true
      setFolder(info.path)
    })
    api.getExportFolder().then(
      (info) => {
        if (!stale) setFolder(info.path)
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
  }, [])

  const changeFolder = useCallback(async () => {
    if (typeof window === 'undefined' || !window.electronAPI) return
    try {
      const info = await window.electronAPI.chooseExportFolder()
      if (info) setFolder(info.path)
    } catch (err) {
      console.error('chooseExportFolder failed:', err)
      toast('error', `Couldn't open the folder picker: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [])

  return { folder, changeFolder }
}
