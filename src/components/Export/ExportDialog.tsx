import { useState, useCallback, useEffect } from 'react'
import { useVideoStore } from '@/stores/videoStore'
import { useDrawingStore } from '@/stores/drawingStore'
import type { ExportOptions, ExportProgress } from '@/types/electron'

interface ExportDialogProps {
  onClose: () => void
  videoSrc: string
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

export default function ExportDialog({ onClose, videoSrc }: ExportDialogProps) {
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
  const [ffmpegVersion, setFfmpegVersion] = useState<string | null>(null)
  const [ffmpegChecked, setFfmpegChecked] = useState(false)

  const startTime = settings.useInOutPoints && inPoint !== null ? inPoint : 0
  const endTime = settings.useInOutPoints && outPoint !== null ? outPoint : duration
  const clipDuration = endTime - startTime

  // Check FFmpeg availability on mount
  useEffect(() => {
    if (window.electronAPI?.getFFmpegVersion) {
      window.electronAPI.getFFmpegVersion().then((version) => {
        setFfmpegVersion(version)
        setFfmpegChecked(true)
      })
    } else {
      setFfmpegChecked(true)
    }
  }, [])

  // Listen for export progress updates
  useEffect(() => {
    if (!window.electronAPI?.onExportProgress) return

    window.electronAPI.onExportProgress((progressData: ExportProgress) => {
      setProgress(progressData.percent)
    })

    return () => {
      window.electronAPI?.removeExportProgressListener?.()
    }
  }, [])

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
      // Resolve the video path from the local-video:// protocol
      const inputPath = await window.electronAPI.resolveVideoPath(videoSrc)

      const exportOptions: ExportOptions = {
        inputPath,
        outputPath: savePath,
        startTime: settings.useInOutPoints ? startTime : undefined,
        endTime: settings.useInOutPoints ? endTime : undefined,
        quality: settings.quality,
        fps: settings.fps,
        format: settings.format,
      }

      const result = await window.electronAPI.exportVideo(exportOptions)

      if (result.success) {
        setProgress(100)
        // Show success and close dialog
        setTimeout(() => {
          onClose()
        }, 500)
      } else {
        setError(result.error || 'Export failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setIsExporting(false)
    }
  }, [settings, startTime, endTime, videoSrc, onClose])

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
          {/* FFmpeg status */}
          {ffmpegChecked && (
            <div className={`flex items-center gap-2 px-3 py-2 rounded text-sm ${
              ffmpegVersion ? 'bg-green-900/30 border border-green-600/30' : 'bg-yellow-900/30 border border-yellow-600/30'
            }`}>
              {ffmpegVersion ? (
                <>
                  <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-green-400">FFmpeg {ffmpegVersion} ready</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <span className="text-yellow-400">FFmpeg not found - export may not work</span>
                </>
              )}
            </div>
          )}

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
              <option value="high">High (1080p)</option>
              <option value="medium">Medium (720p)</option>
              <option value="low">Low (480p)</option>
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
            {settings.format === 'gif' && settings.fps > 15 && (
              <p className="text-xs text-yellow-400 mt-1">GIFs are capped at 15 fps for file size</p>
            )}
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

          {/* Include annotations info */}
          {annotations.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              <span>Note: Annotations overlay export coming soon</span>
            </div>
          )}

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
                {estimateFileSize(settings.useInOutPoints ? clipDuration : duration, qualityInfo.bitrate, settings.format)}
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
            disabled={isExporting || !ffmpegVersion}
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

function estimateFileSize(duration: number, bitrate: string, format: 'mp4' | 'gif'): string {
  if (format === 'gif') {
    // GIF estimation (much larger than video)
    const bytes = duration * 500000 // Rough estimate: 500KB/s
    if (bytes > 1000000000) {
      return `~${(bytes / 1000000000).toFixed(1)} GB`
    } else if (bytes > 1000000) {
      return `~${(bytes / 1000000).toFixed(0)} MB`
    }
    return `~${(bytes / 1000).toFixed(0)} KB`
  }

  const bps = parseFloat(bitrate) * 1000000 // Convert Mbps to bps
  const bytes = (bps * duration) / 8

  if (bytes > 1000000000) {
    return `~${(bytes / 1000000000).toFixed(1)} GB`
  } else if (bytes > 1000000) {
    return `~${(bytes / 1000000).toFixed(0)} MB`
  }
  return `~${(bytes / 1000).toFixed(0)} KB`
}
