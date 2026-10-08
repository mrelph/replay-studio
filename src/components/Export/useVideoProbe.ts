import { useEffect, useState } from 'react'
import type { VideoProbe } from '@/types/clip'

export interface VideoProbeState {
  sourcePath: string | null
  probe: VideoProbe | null
  error: string | null
  loading: boolean
}

/**
 * Resolves the loaded video's file path and probes it (size, fps, audio) in
 * the main process. Export dialogs need both before anything can encode.
 */
export function useVideoProbe(videoSrc: string): VideoProbeState {
  const hasElectron = typeof window !== 'undefined' && !!window.electronAPI
  const [state, setState] = useState<VideoProbeState>({ sourcePath: null, probe: null, error: null, loading: true })

  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!hasElectron) {
        setState({ sourcePath: null, probe: null, error: 'Export requires the desktop application', loading: false })
        return
      }
      setState((s) => ({ ...s, error: null, loading: true }))
      try {
        const path = await window.electronAPI.resolveVideoPath(videoSrc)
        if (cancelled) return
        const result = await window.electronAPI.probeVideo(path)
        if (cancelled) return
        setState(
          'error' in result
            ? { sourcePath: path, probe: null, error: result.error, loading: false }
            : { sourcePath: path, probe: result, error: null, loading: false }
        )
      } catch (err) {
        if (!cancelled) {
          setState({ sourcePath: null, probe: null, error: err instanceof Error ? err.message : 'Failed to read video info', loading: false })
        }
      }
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [videoSrc, hasElectron])

  return state
}
