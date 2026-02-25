import { useState, useCallback, useEffect } from 'react'
import { CheckCircle, AlertTriangle, Info } from 'lucide-react'
import { useVideoStore } from '@/stores/videoStore'
import { useDrawingStore } from '@/stores/drawingStore'
import { Modal, Button, Select } from '@/components/ui'
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
    <Modal
      open={true}
      onClose={onClose}
      title="Export Video"
      disableClose={isExporting}
      maxWidth="max-w-md"
      footer={
        <div className="flex justify-end gap-3">
          <Button
            onClick={onClose}
            disabled={isExporting}
            variant="ghost"
          >
            Cancel
          </Button>
          <Button
            onClick={handleExport}
            disabled={isExporting || !ffmpegVersion}
          >
            {isExporting ? 'Exporting...' : 'Export'}
          </Button>
        </div>
      }
    >
      <div className="p-6 space-y-4">
        {/* FFmpeg status */}
        {ffmpegChecked && (
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
            ffmpegVersion ? 'bg-success-subtle border border-success/20' : 'bg-warning-subtle border border-warning/20'
          }`}>
            {ffmpegVersion ? (
              <>
                <CheckCircle className="w-4 h-4 text-success" />
                <span className="text-success">FFmpeg {ffmpegVersion} ready</span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-4 h-4 text-warning" />
                <span className="text-warning">FFmpeg not found - export may not work</span>
              </>
            )}
          </div>
        )}

        {/* Format selection */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">Format</label>
          <div className="flex gap-2">
            <button
              onClick={() => setSettings({ ...settings, format: 'mp4' })}
              disabled={isExporting}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                settings.format === 'mp4'
                  ? 'bg-accent text-accent-text'
                  : 'bg-surface-sunken text-text-secondary hover:bg-surface-base'
              }`}
            >
              MP4 Video
            </button>
            <button
              onClick={() => setSettings({ ...settings, format: 'gif' })}
              disabled={isExporting}
              className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                settings.format === 'gif'
                  ? 'bg-accent text-accent-text'
                  : 'bg-surface-sunken text-text-secondary hover:bg-surface-base'
              }`}
            >
              GIF Animation
            </button>
          </div>
        </div>

        {/* Quality selection */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">Quality</label>
          <Select
            fullWidth
            value={settings.quality}
            onChange={(e) => setSettings({ ...settings, quality: e.target.value as ExportQuality })}
            disabled={isExporting}
          >
            <option value="high">High (1080p)</option>
            <option value="medium">Medium (720p)</option>
            <option value="low">Low (480p)</option>
          </Select>
        </div>

        {/* FPS selection */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">Frame Rate</label>
          <Select
            fullWidth
            value={settings.fps}
            onChange={(e) => setSettings({ ...settings, fps: parseInt(e.target.value) })}
            disabled={isExporting}
          >
            <option value={24}>24 fps (Film)</option>
            <option value={30}>30 fps (Standard)</option>
            <option value={60}>60 fps (Smooth)</option>
          </Select>
          {settings.format === 'gif' && settings.fps > 15 && (
            <p className="text-xs text-warning mt-1">GIFs are capped at 15 fps for file size</p>
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
              className="w-4 h-4 rounded border-border bg-surface-sunken text-accent focus:ring-accent"
            />
            <label htmlFor="useInOut" className="text-sm text-text-secondary">
              Export only In/Out range ({formatDuration(clipDuration)})
            </label>
          </div>
        )}

        {/* Include annotations info */}
        {annotations.length > 0 && (
          <div className="flex items-center gap-2 text-sm text-text-tertiary">
            <Info className="w-4 h-4" />
            <span>Note: Annotations overlay export coming soon</span>
          </div>
        )}

        {/* Export info */}
        <div className="bg-surface-sunken rounded-lg p-3 text-sm">
          <div className="flex justify-between text-text-tertiary">
            <span>Duration:</span>
            <span className="text-text-primary">{formatDuration(settings.useInOutPoints ? clipDuration : duration)}</span>
          </div>
          <div className="flex justify-between text-text-tertiary mt-1">
            <span>Resolution:</span>
            <span className="text-text-primary">{qualityInfo.resolution}</span>
          </div>
          <div className="flex justify-between text-text-tertiary mt-1">
            <span>Est. size:</span>
            <span className="text-text-primary">
              {estimateFileSize(settings.useInOutPoints ? clipDuration : duration, qualityInfo.bitrate, settings.format)}
            </span>
          </div>
        </div>

        {/* Progress bar */}
        {isExporting && (
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-text-tertiary">Exporting...</span>
              <span className="text-text-primary">{Math.round(progress)}%</span>
            </div>
            <div className="h-2 bg-surface-sunken rounded-full overflow-hidden">
              <div
                className="h-full bg-accent transition-all duration-200 rounded-full"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="bg-error-subtle border border-error/20 rounded-lg p-3 text-sm text-error">
            {error}
          </div>
        )}
      </div>
    </Modal>
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
