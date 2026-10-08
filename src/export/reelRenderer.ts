// Drives a highlight reel export (docs/REEL_PLAN.md): encodes every part of a
// `ReelPlan` through the clip job API with `reel` set, then asks the main
// process to join them with chapters.
import type { Annotation } from '@/stores/drawingStore'
import type { ClipExportQuality, ClipExportResult, VideoProbe } from '@/types/clip'
import { renderClip as defaultRenderClip, type RenderClipOptions } from './clipRenderer'
import { estimateEncodeBytes, type ReelPart, type ReelPlan } from './reelPlan'
import { renderTitleCardRgba, type TitleCardInput } from './titleCard'

/** Share of the progress bar given to the final join (it copies video, so it's quick). */
const JOIN_SHARE = 0.05
/** The main process ignores the output path of a temp reel part; validation still wants one. */
const TEMP_PART_PLACEHOLDER = 'reel-part.mp4'

export interface ReelProgress {
  step: 'card' | 'clip' | 'join'
  /** 1-based clip number the step belongs to; 0 for the join. */
  number: number
  total: number
  /** 0-100 across the whole reel. */
  percent: number
}

export type ReelClipOutcome = 'exported' | 'failed' | 'cancelled'

export interface RenderReelOptions {
  plan: ReelPlan
  probe: VideoProbe
  /** Live annotations; drawings are always burned in. */
  annotations: Annotation[]
  quality: ClipExportQuality
  sourcePath: string
  /** The reel MP4, inside an authorized export folder. */
  outputPath: string
  /**
   * Also keep each clip as its own burned-in export, at these paths (by clip
   * id). The reel then reuses those files instead of encoding them twice.
   * Null: clip parts are temporary.
   */
  keptClipPaths: Record<string, string> | null
  onProgress: (progress: ReelProgress) => void
  /** Called when the temp volume looks too small for the parts (a rough estimate); the reel still runs. */
  onLowSpace?: (freeBytes: number, neededBytes: number) => void
  signal: AbortSignal
}

export interface RenderReelResult extends ClipExportResult {
  /** For each kept clip (by id): whether its individual export finished. */
  keptClips: Record<string, ReelClipOutcome>
}

/** Injectable for tests. */
export interface ReelRenderDeps {
  renderClip: (opts: RenderClipOptions) => Promise<ClipExportResult>
  renderCardRgba: (input: TitleCardInput) => Promise<Uint8Array>
}

const defaultDeps: ReelRenderDeps = { renderClip: defaultRenderClip, renderCardRgba: renderTitleCardRgba }

/** Encodes one title card: a freeze of the clip's first frame under the card overlay. */
async function renderCardPart(
  part: ReelPart,
  reelId: string,
  opts: RenderReelOptions,
  deps: ReelRenderDeps,
  onPercent: (percent: number) => void
): Promise<ClipExportResult> {
  const { probe, plan, quality, sourcePath, signal } = opts
  const rgba = await deps.renderCardRgba({
    width: probe.width,
    height: probe.height,
    number: part.number,
    total: plan.clipCount,
    name: part.clip.name,
    tags: part.clip.tags,
  })
  if (signal.aborted) return { success: false, error: 'Cancelled' }

  const api = window.electronAPI
  const started = await api.clipEncodeStart({
    outputPath: TEMP_PART_PLACEHOLDER,
    sourcePath,
    width: probe.width,
    height: probe.height,
    fps: probe.fps,
    frameCount: part.frameCount,
    quality,
    segments: part.segments,
    reel: { reelId, keep: false },
  })
  if (!started.ok) return { success: false, error: started.error }
  const { jobId } = started

  const onAbort = () => {
    void api.clipEncodeCancel(jobId)
  }
  signal.addEventListener('abort', onAbort)
  api.onClipEncodeProgress((evt) => {
    if (evt.jobId === jobId) onPercent(evt.percent)
  })
  try {
    const added = await api.clipEncodeAddOverlay(jobId, rgba)
    if (!added.ok) {
      await api.clipEncodeCancel(jobId)
      return { success: false, error: added.error }
    }
    if (signal.aborted) return { success: false, error: 'Cancelled' }
    return await api.clipEncodeRun(jobId, {
      spans: [{ overlayIndex: added.index, frameStart: 0, frameCount: part.frameCount }],
      magnifiers: [],
    })
  } finally {
    signal.removeEventListener('abort', onAbort)
    api.removeClipEncodeProgressListener()
  }
}

export async function renderReel(opts: RenderReelOptions, deps: ReelRenderDeps = defaultDeps): Promise<RenderReelResult> {
  const { plan, probe, annotations, quality, sourcePath, outputPath, keptClipPaths, onProgress, onLowSpace, signal } = opts
  const api = window.electronAPI
  const keptClips: Record<string, ReelClipOutcome> = {}
  const markRemainingKept = (outcome: ReelClipOutcome) => {
    if (!keptClipPaths) return
    for (const part of plan.parts) {
      if (part.kind === 'clip' && keptClips[part.clip.id] === undefined) keptClips[part.clip.id] = outcome
    }
  }

  if (plan.parts.length === 0) return { success: false, error: 'The reel has no clips', keptClips }
  if (signal.aborted) return { success: false, error: 'Cancelled', keptClips }

  const started = await api.reelStart({ outputPath })
  if (!started.ok) return { success: false, error: started.error, keptClips }
  const { reelId } = started

  // Temp space: every part not kept in the export folder lives in temp until the join.
  const tempFrames = plan.parts
    .filter((part) => !(part.kind === 'clip' && keptClipPaths?.[part.clip.id]))
    .reduce((sum, part) => sum + part.frameCount, 0)
  const neededBytes = 2 * estimateEncodeBytes(tempFrames / probe.fps, probe.width, probe.height, probe.fps, quality)
  if (started.freeBytes !== null && started.freeBytes < neededBytes) onLowSpace?.(started.freeBytes, neededBytes)

  const onAbort = () => {
    void api.reelCancel(reelId)
  }
  signal.addEventListener('abort', onAbort)

  const encodeShare = 1 - JOIN_SHARE
  let framesDone = 0
  const report = (step: ReelProgress['step'], number: number, fraction: number) => {
    onProgress({ step, number, total: plan.clipCount, percent: Math.min(100, Math.round(fraction * 100)) })
  }

  try {
    for (const part of plan.parts) {
      if (signal.aborted) throw new Error('Cancelled')
      const partProgress = (percent: number) =>
        report(part.kind, part.number, ((framesDone + (part.frameCount * percent) / 100) / plan.frameCount) * encodeShare)
      partProgress(0)

      let result: ClipExportResult
      if (part.kind === 'card') {
        result = await renderCardPart(part, reelId, opts, deps, partProgress)
      } else {
        const keptPath = keptClipPaths?.[part.clip.id]
        result = await deps.renderClip({
          clip: part.clip,
          probe,
          annotations,
          includeDrawings: true,
          quality,
          outputPath: keptPath ?? TEMP_PART_PLACEHOLDER,
          sourcePath,
          onProgress: partProgress,
          signal,
          reel: { reelId, keep: keptPath !== undefined },
        })
        if (keptPath !== undefined) keptClips[part.clip.id] = result.success ? 'exported' : result.error === 'Cancelled' ? 'cancelled' : 'failed'
      }

      if (!result.success) {
        if (result.error === 'Cancelled' || signal.aborted) throw new Error('Cancelled')
        const what = part.kind === 'card' ? `Title card ${part.number}` : `Clip ${part.number} (${part.clip.name})`
        throw new Error(`${what}: ${result.error || 'export failed'}`)
      }
      framesDone += part.frameCount
    }

    report('join', 0, encodeShare)
    api.onReelProgress((evt) => {
      if (evt.reelId === reelId) report('join', 0, encodeShare + (evt.percent / 100) * JOIN_SHARE)
    })
    const joined = await api.reelAssemble(reelId, { chapters: plan.chapters })
    if (!joined.success) {
      if (joined.error === 'Cancelled' || signal.aborted) throw new Error('Cancelled')
      throw new Error(`Joining the reel: ${joined.error || 'failed'}`)
    }
    report('join', 0, 1)
    return { success: true, keptClips }
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Reel export failed'
    markRemainingKept('cancelled')
    await api.reelCancel(reelId)
    return { success: false, error, keptClips }
  } finally {
    signal.removeEventListener('abort', onAbort)
    api.removeReelProgressListener()
  }
}
