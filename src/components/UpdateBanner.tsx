import { useEffect, useState } from 'react'
import { RefreshCw, X } from 'lucide-react'
import { Button } from './ui'

/**
 * Non-modal "update ready" toast, pinned bottom-right. Never blocks the app:
 * an export or a presentation (audience view) must be free to keep running
 * while this sits quietly in the corner. "Later" just hides it for this
 * session — the update still installs automatically on the next quit
 * (electron/updater.ts sets autoInstallOnAppQuit).
 */
export default function UpdateBanner() {
  const [version, setVersion] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!window.electronAPI) return

    window.electronAPI.onUpdateDownloaded((info) => {
      setVersion(info.version)
      setDismissed(false)
    })

    return () => {
      window.electronAPI.removeUpdateDownloadedListener()
    }
  }, [])

  if (!version || dismissed) return null

  return (
    <div className="fixed bottom-4 right-4 z-[90] w-80 rounded-lg border border-border-subtle bg-surface-elevated shadow-lg p-4">
      <div className="flex items-start gap-3">
        <div className="p-1.5 rounded-md bg-accent/10 text-accent flex-shrink-0">
          <RefreshCw className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-text-primary">
            Update ready — v{version}
          </div>
          <p className="text-xs text-text-tertiary mt-0.5">
            Restart Replay Studio to finish updating. It'll install automatically next time you quit either way.
          </p>
          <div className="flex items-center gap-2 mt-3">
            <Button size="sm" onClick={() => window.electronAPI.installUpdate()}>
              Restart now
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
              Later
            </Button>
          </div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="p-0.5 text-text-tertiary hover:text-text-primary rounded transition-colors flex-shrink-0"
          title="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
