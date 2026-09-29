import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { CheckCircle2, XCircle, Loader2, AlertTriangle, FolderOpen, Ban, Circle } from 'lucide-react'
import { useClipStore } from '@/stores/clipStore'
import { useDrawingStore } from '@/stores/drawingStore'
import { Modal, Button, Select } from '@/components/ui'
import { toast } from '@/components/ui/Toast'
import { buildOutputTimeline } from '@/export/outputTimeline'
import { renderClip } from '@/export/clipRenderer'
import { buildEditableProject } from '@/export/editableCopy'
import { buildClipBaseName, orderLabel } from '@/export/clipFilename'
import { buildClipsCsv, type ClipCsvRow, type ClipCsvStatus } from '@/export/clipsCsv'
import { hashTagColorClass } from '@/utils/clipTags'
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
  | { kind: 'done' }
  | { kind: 'failed'; message: string }
  | { kind: 'cancelled' }

interface ExportSummary {
  exportedCount: number
  failedCount: number
  cancelledCount: number
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
      return 'Done'
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
  /** Lowercased tags currently active in the "Select by tag" row (empty = not filtering). */
  const [tagFilters, setTagFilters] = useState<Set<string>>(new Set())
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
    setTagFilters(new Set())
    setSelected(Object.fromEntries(clips.map((c) => [c.id, true])))
  }, [clips])

  const selectNone = useCallback(() => {
    setTagFilters(new Set())
    setSelected(Object.fromEntries(clips.map((c) => [c.id, false])))
  }, [clips])

  // All tags in use across the project's clips, deduped case-insensitively
  // (keeping the first casing seen), for the "Select by tag" row.
  const allTags = useMemo(() => {
    const byKey = new Map<string, string>()
    for (const clip of clips) {
      for (const tag of clip.tags) {
        const key = tag.toLowerCase()
        if (!byKey.has(key)) byKey.set(key, tag)
      }
    }
    return Array.from(byKey.values())
  }, [clips])

  // Selects exactly the clips having any of the currently-active tag
  // filters; toggling back to zero active filters leaves the selection as-is
  // rather than fighting the individual checkboxes below.
  const toggleTagFilter = useCallback((tag: string) => {
    setTagFilters((prev) => {
      const key = tag.toLowerCase()
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      if (next.size > 0) {
        setSelected(
          Object.fromEntries(clips.map((c) => [c.id, c.tags.some((t) => next.has(t.toLowerCase()))]))
        )
      }
      return next
    })
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

    // Mirrors `statuses` synchronously (React state updates aren't readable
    // until the next render) so clips.csv can be built from the true final
    // status of every clip once the loop below finishes.
    const statusMap: Record<string, ClipStatus> = {}
    const baseNameByClipId: Record<string, string> = {}
    const setStatus = (id: string, status: ClipStatus) => {
      statusMap[id] = status
      setStatuses((s) => ({ ...s, [id]: status }))
    }

    let exportedCount = 0
    let failedCount = 0

    for (const { clip, nn } of selectedClips) {
      if (controller.signal.aborted) break

      const baseName = buildClipBaseName(nn, clip.name, clip.tags)
      baseNameByClipId[clip.id] = baseName
      const outputPath = `${folder}/${baseName}.mp4`

      setStatus(clip.id, { kind: 'rendering', percent: 0 })

      try {
        const result = await renderClip({
          clip,
          probe,
          annotations,
          includeDrawings: burnIn,
          quality,
          outputPath,
          sourcePath,
          onProgress: (percent) => {
            setStatus(clip.id, { kind: 'rendering', percent })
          },
          signal: controller.signal,
        })

        if (!result.success) {
          if (result.error === 'Cancelled') {
            setStatus(clip.id, { kind: 'cancelled' })
            break
          }
          failedCount += 1
          setStatus(clip.id, { kind: 'failed', message: result.error || 'Export failed' })
          continue
        }

        if (saveEditableCopy) {
          setStatus(clip.id, { kind: 'saving-copy' })
          const cleanPath = `${folder}/${baseName}.clean.mp4`
          const projectPath = `${folder}/${baseName}.rsproj`

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
            setStatus(clip.id, { kind: 'failed', message: cleanResult.error || 'Editable copy export failed' })
            continue
          }

          const project = buildEditableProject(clip, annotations, cleanPath, baseName)
          const writeResult = await window.electronAPI.writeFile(projectPath, exportProjectToJSON(project))

          if (!writeResult.success) {
            failedCount += 1
            setStatus(clip.id, { kind: 'failed', message: writeResult.error || 'Could not save project file' })
            continue
          }
        }

        exportedCount += 1
        setStatus(clip.id, { kind: 'done' })
      } catch (err) {
        failedCount += 1
        setStatus(clip.id, { kind: 'failed', message: err instanceof Error ? err.message : 'Export failed' })
      }
    }

    // Any clip that never got a chance to start (export was cancelled
    // before we reached it) is left as 'pending'/unset; mark those as
    // cancelled too so the status list (and clips.csv below) doesn't lie.
    for (const { clip } of selectedClips) {
      if (!statusMap[clip.id] || statusMap[clip.id].kind === 'pending') {
        statusMap[clip.id] = { kind: 'cancelled' }
      }
    }
    setStatuses((s) => {
      const next = { ...s }
      for (const { clip } of selectedClips) next[clip.id] = statusMap[clip.id]
      return next
    })

    const cancelledCount = selectedCount - exportedCount - failedCount
    const finalSummary: ExportSummary = { exportedCount, failedCount, cancelledCount }
    setSummary(finalSummary)
    setExporting(false)
    abortControllerRef.current = null

    // Write clips.csv for this run (even a partial one) so the coach has a
    // manifest of what was produced, its tags/notes, and what didn't make it.
    const csvStatusFor = (status: ClipStatus): ClipCsvStatus =>
      status.kind === 'done' ? 'exported' : status.kind === 'failed' ? 'failed' : 'cancelled'
    const csvRows: ClipCsvRow[] = selectedClips.map(({ clip, nn }) => ({
      number: nn,
      name: clip.name,
      start: clip.start,
      end: clip.end,
      tags: clip.tags,
      notes: clip.notes,
      file: `${baseNameByClipId[clip.id] ?? buildClipBaseName(nn, clip.name, clip.tags)}.mp4`,
      status: csvStatusFor(statusMap[clip.id] ?? { kind: 'cancelled' }),
    }))
    try {
      const csvResult = await window.electronAPI.writeFile(`${folder}/clips.csv`, buildClipsCsv(csvRows))
      if (!csvResult.success) {
        toast('error', `Couldn't write clips.csv: ${csvResult.error || 'unknown error'}`)
      }
    } catch (err) {
      toast('error', `Couldn't write clips.csv: ${err instanceof Error ? err.message : 'unknown error'}`)
    }

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
  ])

  const overallPercent = useMemo(() => {
    if (selectedCount === 0) return 0
    const sum = selectedClips.reduce((acc, { clip }) => acc + statusPercent(statuses[clip.id]), 0)
    return Math.round(sum / selectedCount)
  }, [selectedClips, statuses, selectedCount])

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

          {allTags.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap mb-2">
              <span className="text-xs text-text-tertiary mr-0.5">Select by tag:</span>
              {allTags.map((tag) => {
                const active = tagFilters.has(tag.toLowerCase())
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTagFilter(tag)}
                    disabled={exporting}
                    aria-pressed={active}
                    className={`px-1.5 py-0.5 rounded-full text-[11px] font-medium transition-colors disabled:opacity-40 disabled:pointer-events-none ${
                      active ? 'ring-1 ring-accent ' : ''
                    }${hashTagColorClass(tag)}`}
                  >
                    {tag}
                  </button>
                )
              })}
            </div>
          )}

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
          </div>
        )}
      </div>
    </Modal>
  )
}
