import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, FolderOpen, GripVertical, Loader2, XCircle, Ban,
} from 'lucide-react'
import { useClipStore } from '@/stores/clipStore'
import { useDrawingStore } from '@/stores/drawingStore'
import { useClipPrefsStore } from '@/stores/clipPrefsStore'
import { Modal, Button, Select } from '@/components/ui'
import { toast } from '@/components/ui/Toast'
import { buildOutputTimeline } from '@/export/outputTimeline'
import { buildReelBaseName, buildReelPlan, defaultReelName, MAX_CARD_SECONDS, MIN_CARD_SECONDS } from '@/export/reelPlan'
import { renderReel, type ReelClipOutcome, type ReelProgress } from '@/export/reelRenderer'
import { inclusionForTags, individualBaseNames, moveInOrder, reelClips, reelProgressLabel, syncOrder } from '@/export/reelSelection'
import { saveEditableCopy as saveEditableCopyFiles } from '@/export/saveEditableCopy'
import { buildClipsCsv, type ClipCsvRow } from '@/export/clipsCsv'
import { hashTagColorClass } from '@/utils/clipTags'
import type { ClipExportQuality } from '@/types/clip'
import { useVideoProbe } from './useVideoProbe'

export interface ReelDialogProps {
  onClose: () => void
  /** The loaded video's local-video:// URL. */
  videoSrc: string
  /** The Clips panel's active tag filter, used as the starting selection. */
  initialTags: string[]
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'exporting'; progress: ReelProgress | null }
  | { kind: 'done'; outputPath: string }
  | { kind: 'failed'; message: string }
  | { kind: 'cancelled' }

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`
}

function baseName(filePath: string | null): string | null {
  return filePath ? filePath.split(/[\\/]/).pop() ?? null : null
}

function KeptIcon({ outcome }: { outcome: ReelClipOutcome | 'saving-copy' | undefined }) {
  switch (outcome) {
    case 'saving-copy':
      return <Loader2 className="w-4 h-4 text-accent animate-spin" aria-label="Saving editable copy" />
    case 'exported':
      return <CheckCircle2 className="w-4 h-4 text-success" aria-label="Saved" />
    case 'failed':
      return <XCircle className="w-4 h-4 text-error" aria-label="Failed" />
    case 'cancelled':
      return <Ban className="w-4 h-4 text-text-tertiary" aria-label="Cancelled" />
    default:
      return null
  }
}

export default function ReelDialog({ onClose, videoSrc, initialTags }: ReelDialogProps) {
  const clips = useClipStore((s) => s.clips)
  const annotations = useDrawingStore((s) => s.annotations)
  const { sourcePath, probe, error: probeError, loading: loadingProbe } = useVideoProbe(videoSrc)

  const titleCards = useClipPrefsStore((s) => s.reelTitleCards)
  const cardSeconds = useClipPrefsStore((s) => s.reelCardSeconds)
  const saveIndividual = useClipPrefsStore((s) => s.reelSaveIndividual)
  const setTitleCards = useClipPrefsStore((s) => s.setReelTitleCards)
  const setCardSeconds = useClipPrefsStore((s) => s.setReelCardSeconds)
  const setSaveIndividual = useClipPrefsStore((s) => s.setReelSaveIndividual)

  const [tagKeys, setTagKeys] = useState<Set<string>>(() => new Set(initialTags.map((t) => t.toLowerCase())))
  const [order, setOrder] = useState<string[]>(() => clips.map((c) => c.id))
  const [included, setIncluded] = useState<Record<string, boolean>>(() => inclusionForTags(clips, tagKeys))
  const [name, setName] = useState('')
  const [nameTouched, setNameTouched] = useState(false)
  const [quality, setQuality] = useState<ClipExportQuality>('high')
  const [saveEditable, setSaveEditable] = useState(true)
  const [folder, setFolder] = useState<string | null>(null)
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [kept, setKept] = useState<Record<string, ReelClipOutcome | 'saving-copy'>>({})
  const [lowSpace, setLowSpace] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const hasElectron = typeof window !== 'undefined' && !!window.electronAPI
  const exporting = phase.kind === 'exporting'

  // Follow clip additions/removals without losing the reel's own order or checkboxes.
  useEffect(() => {
    setOrder((prev) => syncOrder(prev, clips))
    setIncluded((prev) => {
      const fresh = inclusionForTags(clips, tagKeys)
      return Object.fromEntries(clips.map((c) => [c.id, c.id in prev ? prev[c.id] : fresh[c.id]]))
    })
    // tagKeys is read for newly added clips only; a filter change is handled in toggleTag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clips])

  useEffect(() => () => abortRef.current?.abort(), [])

  const allTags = useMemo(() => {
    const byKey = new Map<string, string>()
    for (const clip of clips) for (const tag of clip.tags) if (!byKey.has(tag.toLowerCase())) byKey.set(tag.toLowerCase(), tag)
    return Array.from(byKey.values())
  }, [clips])

  const activeTagLabels = useMemo(() => allTags.filter((t) => tagKeys.has(t.toLowerCase())), [allTags, tagKeys])
  const defaultName = defaultReelName(activeTagLabels, baseName(sourcePath))
  const effectiveName = nameTouched ? name : defaultName

  const inReel = useMemo(() => reelClips(clips, order, included), [clips, order, included])
  const plan = useMemo(() => {
    if (!probe || inReel.length === 0) return null
    return buildReelPlan(inReel, annotations, probe.fps, { titleCards, cardSeconds })
  }, [probe, inReel, annotations, titleCards, cardSeconds])

  const clipById = useMemo(() => new Map(clips.map((c) => [c.id, c])), [clips])

  const toggleTag = useCallback(
    (tag: string) => {
      const next = new Set(tagKeys)
      const key = tag.toLowerCase()
      if (next.has(key)) next.delete(key)
      else next.add(key)
      setTagKeys(next)
      setIncluded(inclusionForTags(clips, next))
    },
    [clips, tagKeys]
  )

  const move = useCallback((id: string, toIndex: number) => setOrder((prev) => moveInOrder(prev, id, toIndex)), [])

  const handleChooseFolder = useCallback(async () => {
    try {
      const chosen = await window.electronAPI.chooseExportFolder()
      if (chosen) setFolder(chosen)
    } catch (err) {
      toast('error', `Couldn't open the folder picker: ${err instanceof Error ? err.message : String(err)}`)
    }
  }, [])

  const canExport = hasElectron && !!probe && !!sourcePath && !!folder && !!plan && !exporting

  const handleExport = useCallback(async () => {
    if (!probe || !sourcePath || !folder || !plan) return
    const controller = new AbortController()
    abortRef.current = controller
    setLowSpace(null)
    setKept({})
    setPhase({ kind: 'exporting', progress: null })

    const outputPath = `${folder}/${buildReelBaseName(effectiveName)}.mp4`
    const baseNames = saveIndividual ? individualBaseNames(inReel) : null
    const keptClipPaths = baseNames
      ? Object.fromEntries(Object.entries(baseNames).map(([id, base]) => [id, `${folder}/${base}.mp4`]))
      : null

    const result = await renderReel({
      plan,
      probe,
      annotations,
      quality,
      sourcePath,
      outputPath,
      keptClipPaths,
      onProgress: (progress) => setPhase({ kind: 'exporting', progress }),
      onLowSpace: (free, needed) =>
        setLowSpace(
          `Temporary space may run short: about ${Math.round(free / 1e9)} GB free, roughly ${Math.ceil(needed / 1e9)} GB wanted.`
        ),
      signal: controller.signal,
    })
    abortRef.current = null

    // Individually saved clips: editable copies, then clips.csv, as in Export Clips.
    const outcomes: Record<string, ReelClipOutcome> = { ...result.keptClips }
    setKept(outcomes)
    if (baseNames) {
      if (saveEditable) {
        for (const clip of inReel) {
          if (outcomes[clip.id] !== 'exported') continue
          setKept((k) => ({ ...k, [clip.id]: 'saving-copy' }))
          const copy = await saveEditableCopyFiles({
            clip, annotations, sourcePath, folder, baseName: baseNames[clip.id], quality, fps: probe.fps,
          })
          outcomes[clip.id] = copy.success ? 'exported' : 'failed'
          setKept((k) => ({ ...k, [clip.id]: outcomes[clip.id] }))
        }
      }
      const rows: ClipCsvRow[] = inReel.map((clip, i) => ({
        number: i + 1,
        name: clip.name,
        start: clip.start,
        end: clip.end,
        tags: clip.tags,
        notes: clip.notes,
        file: `${baseNames[clip.id]}.mp4`,
        status: outcomes[clip.id] ?? 'cancelled',
      }))
      const csv = await window.electronAPI.writeFile(`${folder}/clips.csv`, buildClipsCsv(rows))
      if (!csv.success) toast('error', `Couldn't write clips.csv: ${csv.error || 'unknown error'}`)
    }

    if (result.success) {
      setPhase({ kind: 'done', outputPath })
      toast('success', `Reel saved: ${baseName(outputPath)}`)
    } else if (result.error === 'Cancelled') {
      setPhase({ kind: 'cancelled' })
      toast('info', 'Reel export cancelled')
    } else {
      setPhase({ kind: 'failed', message: result.error || 'Reel export failed' })
      toast('error', 'Reel export failed')
    }
  }, [probe, sourcePath, folder, plan, effectiveName, saveIndividual, inReel, annotations, quality, saveEditable])

  const percent = phase.kind === 'exporting' ? phase.progress?.percent ?? 0 : 0

  return (
    <Modal
      open
      onClose={onClose}
      title="Export Highlight Reel"
      disableClose={exporting}
      maxWidth="max-w-2xl"
      footer={
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs text-text-tertiary" aria-live="polite">
            {inReel.length} clip{inReel.length === 1 ? '' : 's'}
            {plan ? ` · ${formatDuration(plan.duration)}` : ''}
            {plan && titleCards ? ' with title cards' : ''}
          </div>
          <div className="flex gap-3">
            {exporting ? (
              <Button variant="danger" onClick={() => abortRef.current?.abort()}>
                Cancel
              </Button>
            ) : (
              <>
                <Button variant="ghost" onClick={onClose}>
                  Close
                </Button>
                <Button onClick={handleExport} disabled={!canExport}>
                  Export reel
                </Button>
              </>
            )}
          </div>
        </div>
      }
    >
      <div className="p-6 space-y-4">
        {probeError && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-error-subtle border border-error/20">
            <AlertTriangle className="w-4 h-4 text-error" />
            <span className="text-error">Could not read video info: {probeError}</span>
          </div>
        )}
        {loadingProbe && !probeError && (
          <div className="flex items-center gap-2 text-sm text-text-tertiary">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Reading video info…</span>
          </div>
        )}

        {/* Name */}
        <div>
          <label htmlFor="reel-name" className="block text-sm font-medium text-text-secondary mb-2">
            Reel name
          </label>
          <div className="flex items-center gap-2">
            <input
              id="reel-name"
              type="text"
              value={effectiveName}
              onChange={(e) => {
                setNameTouched(true)
                setName(e.target.value)
              }}
              disabled={exporting}
              placeholder={defaultName}
              className="flex-1 h-9 px-3 rounded-lg bg-surface-sunken border border-border-subtle text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <p className="text-xs text-text-tertiary mt-1">Saved as “{buildReelBaseName(effectiveName)}.mp4”</p>
        </div>

        {/* Clips */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="block text-sm font-medium text-text-secondary">Clips, in reel order</span>
            <span className="text-xs text-text-tertiary">Drag to reorder</span>
          </div>

          {allTags.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap mb-2">
              <span className="text-xs text-text-tertiary mr-0.5">Filter by tag:</span>
              {allTags.map((tag) => {
                const active = tagKeys.has(tag.toLowerCase())
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
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
            <ul className="space-y-1 max-h-64 overflow-y-auto" aria-label="Clips in the reel">
              {order.map((id, index) => {
                const clip = clipById.get(id)
                if (!clip) return null
                const on = !!included[id]
                const seconds = probe ? buildOutputTimeline(clip, annotations, probe.fps).duration : clip.end - clip.start
                const reelNumber = on ? inReel.indexOf(clip) + 1 : null
                return (
                  <li
                    key={id}
                    draggable={!exporting}
                    onDragStart={(e) => {
                      setDragId(id)
                      e.dataTransfer.effectAllowed = 'move'
                    }}
                    onDragOver={(e) => {
                      if (!dragId) return
                      e.preventDefault()
                      setDropIndex(index)
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      if (dragId) move(dragId, index)
                      setDragId(null)
                      setDropIndex(null)
                    }}
                    onDragEnd={() => {
                      setDragId(null)
                      setDropIndex(null)
                    }}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-lg bg-surface-sunken text-sm ${
                      dropIndex === index && dragId !== id ? 'ring-1 ring-accent' : ''
                    } ${dragId === id ? 'opacity-50' : ''} ${on ? '' : 'opacity-60'}`}
                  >
                    <GripVertical className="w-4 h-4 text-text-tertiary cursor-grab flex-shrink-0" aria-hidden="true" />
                    <input
                      type="checkbox"
                      id={`reel-clip-${id}`}
                      checked={on}
                      onChange={() => setIncluded((s) => ({ ...s, [id]: !s[id] }))}
                      disabled={exporting}
                      className="w-4 h-4 rounded border-border bg-surface-elevated text-accent focus:ring-accent"
                      aria-label={`Include ${clip.name} in the reel`}
                    />
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: clip.color }} aria-hidden="true" />
                    <label htmlFor={`reel-clip-${id}`} className="flex-1 min-w-0 truncate cursor-pointer">
                      <span className="text-text-tertiary mr-1 tabular-nums">{reelNumber ? String(reelNumber).padStart(2, '0') : '––'}</span>
                      <span className="text-text-primary">{clip.name}</span>
                      <span className="text-text-tertiary ml-2 tabular-nums">{formatDuration(seconds)}</span>
                      {clip.tags.length > 0 && <span className="text-text-tertiary ml-2 text-xs">{clip.tags.join(', ')}</span>}
                    </label>
                    <KeptIcon outcome={kept[id]} />
                    <div className="flex flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => move(id, index - 1)}
                        disabled={exporting || index === 0}
                        className="p-0.5 text-text-tertiary hover:text-text-primary disabled:opacity-25"
                        aria-label={`Move ${clip.name} up`}
                      >
                        <ChevronUp className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => move(id, index + 1)}
                        disabled={exporting || index === order.length - 1}
                        className="p-0.5 text-text-tertiary hover:text-text-primary disabled:opacity-25"
                        aria-label={`Move ${clip.name} down`}
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Options */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="reel-title-cards"
                checked={titleCards}
                onChange={(e) => setTitleCards(e.target.checked)}
                disabled={exporting}
                className="w-4 h-4 rounded border-border bg-surface-sunken text-accent focus:ring-accent"
              />
              <label htmlFor="reel-title-cards" className="text-sm text-text-secondary">
                Title card before each clip
              </label>
            </div>
            {titleCards && (
              <div className="flex items-center gap-2 pl-7">
                <input
                  type="number"
                  min={MIN_CARD_SECONDS}
                  max={MAX_CARD_SECONDS}
                  step={0.5}
                  value={cardSeconds}
                  onChange={(e) => setCardSeconds(Number(e.target.value))}
                  disabled={exporting}
                  aria-label="Title card seconds"
                  className="w-16 h-8 px-2 rounded-md bg-surface-sunken border border-border-subtle text-sm text-text-primary tabular-nums"
                />
                <span className="text-xs text-text-tertiary">seconds · shows “n / N”, the clip name and its tags</span>
              </div>
            )}
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="reel-save-individual"
                checked={saveIndividual}
                onChange={(e) => setSaveIndividual(e.target.checked)}
                disabled={exporting}
                className="w-4 h-4 rounded border-border bg-surface-sunken text-accent focus:ring-accent"
              />
              <label htmlFor="reel-save-individual" className="text-sm text-text-secondary">
                Also save individual clips
              </label>
            </div>
            {saveIndividual && (
              <div className="flex items-center gap-3 pl-7">
                <input
                  type="checkbox"
                  id="reel-editable-copy"
                  checked={saveEditable}
                  onChange={(e) => setSaveEditable(e.target.checked)}
                  disabled={exporting}
                  className="w-4 h-4 rounded border-border bg-surface-sunken text-accent focus:ring-accent"
                />
                <label htmlFor="reel-editable-copy" className="text-sm text-text-secondary">
                  With editable copies
                </label>
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-2" htmlFor="reel-quality">
              Quality
            </label>
            <Select
              id="reel-quality"
              fullWidth
              value={quality}
              onChange={(e) => setQuality(e.target.value as ClipExportQuality)}
              disabled={exporting}
            >
              <option value="high">High (1080p)</option>
              <option value="medium">Medium (720p)</option>
              <option value="low">Low (480p)</option>
            </Select>
            <p className="text-xs text-text-tertiary mt-2">Drawings, zoom lenses and freezes are always included.</p>
          </div>
        </div>

        {/* Folder */}
        <div>
          <span className="block text-sm font-medium text-text-secondary mb-2">Destination folder</span>
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

        {lowSpace && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm bg-warning-subtle border border-warning/20" role="status">
            <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0" />
            <span className="text-warning">{lowSpace}</span>
          </div>
        )}

        {exporting && (
          <div aria-live="polite">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-text-tertiary">{phase.progress ? reelProgressLabel(phase.progress) : 'Starting…'}</span>
              <span className="text-text-primary tabular-nums">{percent}%</span>
            </div>
            <div className="h-2 bg-surface-sunken rounded-full overflow-hidden">
              <div className="h-full bg-accent transition-all duration-200 rounded-full" style={{ width: `${percent}%` }} />
            </div>
          </div>
        )}

        {phase.kind === 'done' && (
          <div className="flex items-center justify-between gap-3 rounded-lg p-3 text-sm border bg-success-subtle border-success/20" role="status">
            <span className="text-success truncate">Saved {baseName(phase.outputPath)}</span>
            <Button size="sm" variant="secondary" onClick={() => void window.electronAPI.showExportedFile(phase.outputPath)}>
              <FolderOpen className="w-3.5 h-3.5" />
              Show in folder
            </Button>
          </div>
        )}
        {phase.kind === 'failed' && (
          <div className="rounded-lg p-3 text-sm border bg-error-subtle border-error/20" role="status">
            <p className="text-error break-words">{phase.message}</p>
          </div>
        )}
        {phase.kind === 'cancelled' && (
          <div className="rounded-lg p-3 text-sm border bg-surface-sunken border-border-subtle text-text-secondary" role="status">
            Cancelled. Nothing was kept except individual clips that had already finished.
          </div>
        )}
      </div>
    </Modal>
  )
}
