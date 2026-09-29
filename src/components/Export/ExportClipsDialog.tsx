import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { CheckCircle2, XCircle, Loader2, AlertTriangle, FolderOpen, Ban, Circle } from 'lucide-react'
import { useClipStore } from '@/stores/clipStore'
import { useDrawingStore } from '@/stores/drawingStore'
import { Modal, Button, Select } from '@/components/ui'
import { toast } from '@/components/ui/Toast'
import { buildOutputTimeline } from '@/export/outputTimeline'
import { renderClip } from '@/export/clipRenderer'
import { buildEditableProject } from '@/export/editableCopy'
import { exportProjectToJSON } from '@/utils/projectSerializer'
import type { Clip, ClipExportQuality, VideoProbe } from '@/types/clip'

export interface ExportClipsDialogProps {
  onClose: () => void
  /** The loaded video's local-video:// URL. */
  videoSrc: string
}

type ClipStatus =
  | { kind: 'pending' }
  | { kind: 'rendering'; percent: number }
  | { kind: 'saving-copy' }
  | { kind: 'done'; droppedFrames: number }
  | { kind: 'failed'; message: string }
  | { kind: 'cancelled' }

interface ExportSummary {
  exportedCount: number
  failedCount: number
  cancelledCount: number
  droppedFrames: number
  totalFrames: number
}

/** Removes filesystem-hostile characters, trims, and caps length for a safe output filename component. */
function sanitizeName(name: string): string {
  const cleaned = name
    // eslint-disable-next-line no-control-regex
    .replace(/[/\\:*?"<>|\x00-\x1f\x7f]/g, '')
    .trim()
  const base = cleaned.length > 0 ? cleaned : 'Clip'
  return base.slice(0, 80).trim() || 'Clip'
}

/** `nn` is 1-based order in the clip list. */
function orderLabel(nn: number): string {
  return String(nn).padStart(2, '0')
}

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const mins = Math.floor(total / 60)
  const secs = total % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function statusPercent(status: ClipStatus | undefined): number {
  switch (status?.kind) {
    case 'rendering':
      return status.percent
    case 'saving-copy':
      return 99
    case 'done':
    case 'failed':
    case 'cancelled':
      return 100
    default:
      return 0
  }
}

function StatusIcon({ status }: { status: ClipStatus | undefined }) {
  switch (status?.kind) {
    case 'rendering':
    case 'saving-copy':
      return <Loader2 className="w-4 h-4 text-accent animate-spin" aria-hidden="true" />
    case 'done':
      return <CheckCircle2 className="w-4 h-4 text-success" aria-hidden="true" />
    case 'failed':
      return <XCircle className="w-4 h-4 text-error" aria-hidden="true" />
    case 'cancelled':
      return <Ban className="w-4 h-4 text-text-tertiary" aria-hidden="true" />
    default:
      return <Circle className="w-4 h-4 text-text-tertiary" aria-hidden="true" />
  }
}

function statusLabel(status: ClipStatus | undefined): string {
  switch (status?.kind) {
    case 'rendering':
      return `Rendering ${status.percent}%`
    case 'saving-copy':
      return 'Saving editable copy…'
    case 'done':
      return status.droppedFrames > 0 ? `Done (${status.droppedFrames} dropped frame${status.droppedFrames === 1 ? '' : 's'})` : 'Done'
    case 'failed':
      return status.message
    case 'cancelled':
      return 'Cancelled'
    default:
      return 'Pending'
  }
}

export default function ExportClipsDialog({ onClose, videoSrc }: ExportClipsDialogProps) {
  const clips = useClipStore((s) => s.clips)
  const annotations = useDrawingStore((s) => s.annotations)

  const [sourcePath, setSourcePath] = useState<string | null>(null)
  const [probe, setProbe] = useState<VideoProbe | null>(null)
  const [probeError, setProbeError] = useState<string | null>(null)
  const [loadingProbe, setLoadingProbe] = useState(true)

  const [selected, setSelected] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(clips.map((c) => [c.id, true]))
  )
  const [quality, setQuality] = useState<ClipExportQuality>('high')
  const [burnIn, setBurnIn] = useState(true)
  const [saveEditableCopy, setSaveEditableCopy] = useState(true)
  const [folder, setFolder] = useState<string | null>(null)

  const [exporting, setExporting] = useState(false)
  const [statuses, setStatuses] = useState<Record<string, ClipStatus>>({})
  const [summary, setSummary] = useState<ExportSummary | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const hasElectron = typeof window !== 'undefined' && !!window.electronAPI

  // Probe the source video once, up front, so per-clip duration estimates
  // and the encoder job (width/height/fps) are known before export starts.
  useEffect(() => {
    let cancelled = false

    async function load() {
      if (!hasElectron) {
        setLoadingProbe(false)
        setProbeError('Export requires the desktop application')
        return
      }
      setLoadingProbe(true)
      setProbeError(null)
      try {
        const path = await window.electronAPI.resolveVideoPath(videoSrc)
        if (cancelled) return
        setSourcePath(path)
        const result = await window.electronAPI.probeVideo(path)
        if (cancelled) return
        if ('error' in result) {
          setProbeError(result.error)
        } else {
          setProbe(result)
        }
      } catch (err) {
        if (!cancelled) setProbeError(err instanceof Error ? err.message : 'Failed to read video info')
      } finally {
        if (!cancelled) setLoadingProbe(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoSrc])

  // Keep selection in sync if the clip list changes (e.g. a clip removed
  // while this dialog is open) without clobbering the user's choices.
  useEffect(() => {
    setSelected((prev) => {
      const next: Record<string, boolean> = {}
      for (const clip of clips) {
        next[clip.id] = clip.id in prev ? prev[clip.id] : true
      }
      return next
    })
  }, [clips])

  const selectedClips = useMemo(
    () => clips.map((clip, index) => ({ clip, nn: index + 1 })).filter(({ clip }) => selected[clip.id]),
    [clips, selected]
  )
  const selectedCount = selectedClips.length

  const totalDuration = useMemo(() => {
    if (!probe) return 0
    return selectedClips.reduce((sum, { clip }) => sum + buildOutputTimeline(clip, annotations, probe.fps).duration, 0)
  }, [selectedClips, annotations, probe])

  const toggleClip = useCallback((id: string) => {
    setSelected((s) => ({ ...s, [id]: !s[id] }))
  }, [])

  const selectAll = useCallback(() => {
    setSelected(Object.fromEntries(clips.map((c) => [c.id, true])))
  }, [clips])

  const selectNone = useCallback(() => {
    setSelected(Object.fromEntries(clips.map((c) => [c.id, false])))
  }, [clips])

  const handleChooseFolder = useCallback(async () => {
    if (!hasElectron) return
    try {
      const chosen = await window.electronAPI.chooseExportFolder()
      if (chosen) setFolder(chosen)
    } catch (err) {
      console.error('chooseExportFolder failed:', err)
      toast('error', `Couldn't open the folder picker: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [hasElectron])

  const canExport = hasElectron && !!probe && !probeError && !!folder && selectedCount > 0 && !exporting

  // If the dialog unmounts mid-export (e.g. a different video is opened),
  // stop the render so the hidden video and ffmpeg job don't keep running.
  useEffect(() => () => abortControllerRef.current?.abort(), [])

  const handleCancel = useCallback(() => {
    abortControllerRef.current?.abort()
  }, [])

  const handleExport = useCallback(async () => {
    if (!hasElectron || !probe || !sourcePath || !folder) return

    const controller = new AbortController()
    abortControllerRef.current = controller

    setExporting(true)
    setSummary(null)
    setStatuses(Object.fromEntries(selectedClips.map(({ clip }) => [clip.id, { kind: 'pending' } as ClipStatus])))

    let exportedCount = 0
    let failedCount = 0
    let droppedFrames = 0
    let totalFrames = 0

    for (const { clip, nn } of selectedClips) {
      if (controller.signal.aborted) break

      const nnLabel = orderLabel(nn)
      const sanitized = sanitizeName(clip.name)
      const outputPath = `${folder}/${nnLabel} - ${sanitized}.mp4`

      setStatuses((s) => ({ ...s, [clip.id]: { kind: 'rendering', percent: 0 } }))

      const { frameCount } = buildOutputTimeline(clip, annotations, probe.fps)

      try {
        const result = await renderClip({
          clip,
          videoUrl: videoSrc,
          probe,
          annotations,
          includeDrawings: burnIn,
          quality,
          outputPath,
          sourcePath,
          onProgress: (done, total) => {
            const percent = total > 0 ? Math.round((done / total) * 100) : 0
            setStatuses((s) => ({ ...s, [clip.id]: { kind: 'rendering', percent } }))
          },
          signal: controller.signal,
        })

        if (!result.success) {
          if (result.error === 'Cancelled') {
            setStatuses((s) => ({ ...s, [clip.id]: { kind: 'cancelled' } }))
            break
          }
          failedCount += 1
          setStatuses((s) => ({ ...s, [clip.id]: { kind: 'failed', message: result.error || 'Export failed' } }))
          continue
        }

        totalFrames += frameCount
        droppedFrames += result.droppedFrames

        if (saveEditableCopy) {
          setStatuses((s) => ({ ...s, [clip.id]: { kind: 'saving-copy' } }))
          const cleanPath = `${folder}/${nnLabel} - ${sanitized}.clean.mp4`
          const projectPath = `${folder}/${nnLabel} - ${sanitized}.rsproj`

          const cleanResult = await window.electronAPI.exportVideo({
            inputPath: sourcePath,
            outputPath: cleanPath,
            startTime: clip.start,
            endTime: clip.end,
            quality,
            fps: probe.fps,
            format: 'mp4',
          })

          if (!cleanResult.success) {
            failedCount += 1
            setStatuses((s) => ({
              ...s,
              [clip.id]: { kind: 'failed', message: cleanResult.error || 'Editable copy export failed' },
            }))
            continue
          }

          const project = buildEditableProject(clip, annotations, cleanPath, sanitized)
          const writeResult = await window.electronAPI.writeFile(projectPath, exportProjectToJSON(project))

          if (!writeResult.success) {
            failedCount += 1
            setStatuses((s) => ({
              ...s,
              [clip.id]: { kind: 'failed', message: writeResult.error || 'Could not save project file' },
            }))
            continue
          }
        }

        exportedCount += 1
        setStatuses((s) => ({ ...s, [clip.id]: { kind: 'done', droppedFrames: result.droppedFrames } }))
      } catch (err) {
        failedCount += 1
        setStatuses((s) => ({
          ...s,
          [clip.id]: { kind: 'failed', message: err instanceof Error ? err.message : 'Export failed' },
        }))
      }
    }

    // Any clip that never got a chance to start (export was cancelled
    // before we reached it) is left as 'pending' by the loop above; mark
    // those as cancelled too so the status list doesn't lie.
    setStatuses((s) => {
      const next = { ...s }
      for (const { clip } of selectedClips) {
        if (next[clip.id]?.kind === 'pending') next[clip.id] = { kind: 'cancelled' }
      }
      return next
    })

    const cancelledCount = selectedCount - exportedCount - failedCount
    const finalSummary: ExportSummary = { exportedCount, failedCount, cancelledCount, droppedFrames, totalFrames }
    setSummary(finalSummary)
    setExporting(false)
    abortControllerRef.current = null

    if (finalSummary.failedCount > 0) {
      toast('error', `Exported ${finalSummary.exportedCount} clip(s), ${finalSummary.failedCount} failed`)
    } else if (finalSummary.cancelledCount > 0) {
      toast('info', `Exported ${finalSummary.exportedCount} clip(s) before cancelling`)
    } else {
      toast('success', `Exported ${finalSummary.exportedCount} clip(s)`)
    }
  }, [
    hasElectron,
    probe,
    sourcePath,
    folder,
    selectedClips,
    selectedCount,
    annotations,
    burnIn,
    saveEditableCopy,
    quality,
    videoSrc,
  ])

  const overallPercent = useMemo(() => {
    if (selectedCount === 0) return 0
    const sum = selectedClips.reduce((acc, { clip }) => acc + statusPercent(statuses[clip.id]), 0)
    return Math.round(sum / selectedCount)
  }, [selectedClips, statuses, selectedCount])

  const droppedFrameWarning =
    summary && summary.totalFrames > 0 && summary.droppedFrames / summary.totalFrames > 0.01

  return (
    <Modal
      open
      onClose={onClose}
      title="Export Clips"
      disableClose={exporting}
      maxWidth="max-w-2xl"
      footer={
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-text-tertiary" aria-live="polite">
            {selectedCount} clip{selectedCount === 1 ? '' : 's'} selected
            {probe ? ` · ~${formatDuration(totalDuration)} total` : ''}
            {exporting ? ` · Exporting ${overallPercent}%` : ''}
          </div>
          <div className="flex gap-3">
            {exporting ? (
              <Button variant="danger" onClick={handleCancel}>
                Cancel
              </Button>
            ) : (
              <>
                <Button variant="ghost" onClick={onClose}>
                  Close
                </Button>
                <Button onClick={handleExport} disabled={!canExport}>
                  Export {selectedCount > 0 ? selectedCount : ''} clip{selectedCount === 1 ? '' : 's'}
                </Button>
              </>
            )}
          </div>
        </div>
      }
    >
      <div className="p-6 space-y-4">
        {!hasElectron && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-warning-subtle border border-warning/20">
            <AlertTriangle className="w-4 h-4 text-warning" />
            <span className="text-warning">Export requires the desktop application</span>
          </div>
        )}

        {probeError && hasElectron && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-error-subtle border border-error/20">
            <AlertTriangle className="w-4 h-4 text-error" />
            <span className="text-error">Could not read video info: {probeError}</span>
          </div>
        )}

        {loadingProbe && hasElectron && !probeError && (
          <div className="flex items-center gap-2 text-sm text-text-tertiary">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Reading video info…</span>
          </div>
        )}

        {/* Clip selection */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-text-secondary">Clips</label>
            <div className="flex gap-2 text-xs">
              <button
                type="button"
                onClick={selectAll}
                disabled={exporting}
                className="text-accent hover:underline disabled:opacity-40 disabled:pointer-events-none"
              >
                Select all
              </button>
              <span className="text-text-tertiary">·</span>
              <button
                type="button"
                onClick={selectNone}
                disabled={exporting}
                className="text-accent hover:underline disabled:opacity-40 disabled:pointer-events-none"
              >
                Select none
              </button>
            </div>
          </div>

          {clips.length === 0 ? (
            <p className="text-sm text-text-tertiary bg-surface-sunken rounded-lg p-3">
              No clips yet. Mark in/out points and press Shift+C to add one.
            </p>
          ) : (
            <ul className="space-y-1 max-h-60 overflow-y-auto" aria-label="Clips to export">
              {clips.map((clip: Clip, index) => {
                const status = statuses[clip.id]
                const percent = statusPercent(status)
                return (
                  <li
                    key={clip.id}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface-sunken text-sm"
                  >
                    <input
                      type="checkbox"
                      id={`export-clip-${clip.id}`}
                      checked={!!selected[clip.id]}
                      onChange={() => toggleClip(clip.id)}
                      disabled={exporting}
                      className="w-4 h-4 rounded border-border bg-surface-elevated text-accent focus:ring-accent"
                      aria-label={`Include ${clip.name} in export`}
                    />
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: clip.color }}
                      aria-hidden="true"
                    />
                    <label htmlFor={`export-clip-${clip.id}`} className="flex-1 truncate cursor-pointer">
                      <span className="text-text-tertiary mr-1">{orderLabel(index + 1)}</span>
                      <span className="text-text-primary">{clip.name}</span>
                      <span className="text-text-tertiary ml-2">{formatDuration(clip.end - clip.start)}</span>
                    </label>
                    {(exporting || status) && selected[clip.id] && (
                      <div className="flex items-center gap-2 flex-shrink-0" aria-live="polite">
                        <StatusIcon status={status} />
                        <span className="text-xs text-text-tertiary w-32 text-right truncate">
                          {statusLabel(status)}
                        </span>
                        {status?.kind === 'rendering' && (
                          <div className="w-16 h-1.5 bg-surface-elevated rounded-full overflow-hidden">
                            <div
                              className="h-full bg-accent rounded-full transition-all duration-150"
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Options */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2" htmlFor="export-clips-quality">
              Quality
            </label>
            <Select
              id="export-clips-quality"
              fullWidth
              value={quality}
              onChange={(e) => setQuality(e.target.value as ClipExportQuality)}
              disabled={exporting}
            >
              <option value="high">High (1080p)</option>
              <option value="medium">Medium (720p)</option>
              <option value="low">Low (480p)</option>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="export-clips-burn-in"
                checked={burnIn}
                onChange={(e) => setBurnIn(e.target.checked)}
                disabled={exporting}
                className="w-4 h-4 rounded border-border bg-surface-sunken text-accent focus:ring-accent"
              />
              <label htmlFor="export-clips-burn-in" className="text-sm text-text-secondary">
                Burn in drawings
              </label>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="export-clips-editable-copy"
                checked={saveEditableCopy}
                onChange={(e) => setSaveEditableCopy(e.target.checked)}
                disabled={exporting}
                className="w-4 h-4 rounded border-border bg-surface-sunken text-accent focus:ring-accent"
              />
              <label htmlFor="export-clips-editable-copy" className="text-sm text-text-secondary">
                Also save editable copy
              </label>
            </div>
            <p className="text-xs text-text-tertiary pl-7">
              Saves a clean video (no drawings) plus a Replay Studio project file, so this clip can be reopened and
              re-annotated later.
            </p>
          </div>
        </div>

        {/* Folder */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-2">Destination folder</label>
          <div className="flex items-center gap-3">
            <Button variant="secondary" onClick={handleChooseFolder} disabled={exporting || !hasElectron}>
              <FolderOpen className="w-4 h-4" />
              Choose folder…
            </Button>
            <span className="text-sm text-text-tertiary truncate flex-1" title={folder ?? undefined}>
              {folder ?? 'No folder chosen'}
            </span>
          </div>
        </div>

        {/* Overall progress */}
        {exporting && (
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-text-tertiary">Exporting…</span>
              <span className="text-text-primary">{overallPercent}%</span>
            </div>
            <div className="h-2 bg-surface-sunken rounded-full overflow-hidden">
              <div
                className="h-full bg-accent transition-all duration-200 rounded-full"
                style={{ width: `${overallPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Summary */}
        {summary && (
          <div
            className={`rounded-lg p-3 text-sm border ${
              summary.failedCount > 0 ? 'bg-error-subtle border-error/20' : 'bg-success-subtle border-success/20'
            }`}
            role="status"
          >
            <p className={summary.failedCount > 0 ? 'text-error' : 'text-success'}>
              Exported {summary.exportedCount} of {selectedCount} clip{selectedCount === 1 ? '' : 's'}
              {summary.cancelledCount > 0 ? ` · ${summary.cancelledCount} cancelled` : ''}
              {summary.failedCount > 0 ? ` · ${summary.failedCount} failed` : ''}
            </p>
            {droppedFrameWarning && (
              <p className="flex items-center gap-1.5 text-warning mt-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                {summary.droppedFrames} of {summary.totalFrames} frames were dropped (
                {((summary.droppedFrames / summary.totalFrames) * 100).toFixed(1)}%) — playback may have been too
                slow to keep up during capture.
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
