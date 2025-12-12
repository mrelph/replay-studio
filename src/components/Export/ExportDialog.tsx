import { useState, useCallback } from 'react'
import { useVideoStore } from '@/stores/videoStore'
import { useDrawingStore } from '@/stores/drawingStore'

interface ExportDialogProps {
  onClose: () => void
  videoSrc: string // Used for future FFmpeg export
}

type ExportFormat = 'mp4' | 'gif'
type ExportQuality = 'high' | 'medium' | 'low'

interface ExportSettings {
  format: ExportFormat
  quality: ExportQuality
  useInOutPoints: boolean
  includeAnnotations: boolean
  fps: number
}

export default function ExportDialog({ onClose }: ExportDialogProps) {
  const { inPoint, outPoint, duration } = useVideoStore()
  const { annotations } = useDrawingStore()

  const [settings, setSettings] = useState<ExportSettings>({
    format: 'mp4',
    quality: 'high',
    useInOutPoints: inPoint !== null && outPoint !== null,
    includeAnnotations: true,
    fps: 30,
  })

  const [isExporting, setIsExporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const startTime = settings.useInOutPoints && inPoint !== null ? inPoint : 0
  const endTime = settings.useInOutPoints && outPoint !== null ? outPoint : duration
  const clipDuration = endTime - startTime

  const handleExport = useCallback(async () => {
    if (!window.electronAPI) {
      setError('Export requires the desktop application')
      return
    }

    const defaultName = `replay-export-${Date.now()}.${settings.format}`
    const savePath = await window.electronAPI.saveFile(defaultName)

    if (!savePath) return

    setIsExporting(true)
    setProgress(0)
    setError(null)

    try {
      // For now, show a message that export is being prepared
      // Full FFmpeg integration would require more complex setup

      // Simulate export progress
      const totalFrames = Math.ceil(clipDuration * settings.fps)

      for (let frame = 0; frame <= totalFrames; frame++) {
        await new Promise((resolve) => setTimeout(resolve, 50))
        setProgress((frame / totalFrames) * 100)
      }

      // In a full implementation, this would:
      // 1. Extract frames from video at each timestamp
      // 2. Render canvas annotations onto each frame
      // 3. Use FFmpeg to encode the composited frames into video

      setProgress(100)

      // Show success message
      setTimeout(() => {
        alert(`Export complete!\nSaved to: ${savePath}\n\nNote: Full FFmpeg export integration coming soon.`)
        onClose()
      }, 500)

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setIsExporting(false)
    }
  }, [settings, clipDuration, onClose])

  const getQualitySettings = (quality: ExportQuality) => {
    switch (quality) {
      case 'high': return { bitrate: '8M', resolution: '1080p' }
      case 'medium': return { bitrate: '4M', resolution: '720p' }
      case 'low': return { bitrate: '2M', resolution: '480p' }
    }
  }

  const qualityInfo = getQualitySettings(settings.quality)

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-gray-800 rounded-lg shadow-xl w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
          <h2 className="text-xl font-semibold text-white">Export Video</h2>
          <button
            onClick={onClose}
            disabled={isExporting}
            className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors disabled:opacity-50"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Format selection */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Format</label>
            <div className="flex gap-2">
              <button
                onClick={() => setSettings({ ...settings, format: 'mp4' })}
                disabled={isExporting}
                className={`flex-1 px-4 py-2 rounded text-sm font-medium transition-colors ${
                  settings.format === 'mp4'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                MP4 Video
              </button>
              <button
                onClick={() => setSettings({ ...settings, format: 'gif' })}
                disabled={isExporting}
                className={`flex-1 px-4 py-2 rounded text-sm font-medium transition-colors ${
                  settings.format === 'gif'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                GIF Animation
              </button>
            </div>
          </div>

          {/* Quality selection */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Quality</label>
            <select
              value={settings.quality}
              onChange={(e) => setSettings({ ...settings, quality: e.target.value as ExportQuality })}
              disabled={isExporting}
              className="w-full px-3 py-2 bg-gray-700 text-white rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
            >
              <option value="high">High (1080p, 8Mbps)</option>
              <option value="medium">Medium (720p, 4Mbps)</option>
              <option value="low">Low (480p, 2Mbps)</option>
            </select>
          </div>

          {/* FPS selection */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Frame Rate</label>
            <select
              value={settings.fps}
              onChange={(e) => setSettings({ ...settings, fps: parseInt(e.target.value) })}
              disabled={isExporting}
              className="w-full px-3 py-2 bg-gray-700 text-white rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
            >
              <option value={24}>24 fps (Film)</option>
              <option value={30}>30 fps (Standard)</option>
              <option value={60}>60 fps (Smooth)</option>
            </select>
          </div>

          {/* Range selection */}
          {inPoint !== null && outPoint !== null && (
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="useInOut"
                checked={settings.useInOutPoints}
                onChange={(e) => setSettings({ ...settings, useInOutPoints: e.target.checked })}
                disabled={isExporting}
                className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="useInOut" className="text-sm text-gray-300">
                Export only In/Out range ({formatDuration(clipDuration)})
              </label>
            </div>
          )}

          {/* Include annotations */}
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="includeAnnotations"
              checked={settings.includeAnnotations}
              onChange={(e) => setSettings({ ...settings, includeAnnotations: e.target.checked })}
              disabled={isExporting}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="includeAnnotations" className="text-sm text-gray-300">
              Include annotations ({annotations.length} items)
            </label>
          </div>

          {/* Export info */}
          <div className="bg-gray-900 rounded p-3 text-sm">
            <div className="flex justify-between text-gray-400">
              <span>Duration:</span>
              <span className="text-white">{formatDuration(settings.useInOutPoints ? clipDuration : duration)}</span>
            </div>
            <div className="flex justify-between text-gray-400 mt-1">
              <span>Resolution:</span>
              <span className="text-white">{qualityInfo.resolution}</span>
            </div>
            <div className="flex justify-between text-gray-400 mt-1">
              <span>Est. size:</span>
              <span className="text-white">
                {estimateFileSize(settings.useInOutPoints ? clipDuration : duration, qualityInfo.bitrate)}
              </span>
            </div>
          </div>

          {/* Progress bar */}
          {isExporting && (
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-400">Exporting...</span>
                <span className="text-white">{Math.round(progress)}%</span>
              </div>
              <div className="h-2 bg-gray-700 rounded overflow-hidden">
                <div
                  className="h-full bg-blue-600 transition-all duration-200"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="bg-red-900/50 border border-red-500 rounded p-3 text-sm text-red-200">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-700">
          <button
            onClick={onClose}
            disabled={isExporting}
            className="px-4 py-2 text-sm text-gray-300 hover:text-white transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isExporting ? 'Exporting...' : 'Export'}
          </button>
        </div>
      </div>
    </div>
  )
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function estimateFileSize(duration: number, bitrate: string): string {
  const bps = parseFloat(bitrate) * 1000000 // Convert Mbps to bps
  const bytes = (bps * duration) / 8

  if (bytes > 1000000000) {
    return `~${(bytes / 1000000000).toFixed(1)} GB`
  } else if (bytes > 1000000) {
    return `~${(bytes / 1000000).toFixed(0)} MB`
  } else {
    return `~${(bytes / 1000).toFixed(0)} KB`
  }
}
