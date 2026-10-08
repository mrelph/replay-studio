// Pure planning for a highlight reel (docs/REEL_PLAN.md): which parts, in
// what order, how many frames each, and where the chapters fall.
import type { Clip, ClipExportQuality, OutputSegment, ReelChapter } from '@/types/clip'
import { buildOutputTimeline, type FreezeAnnotationLike } from './outputTimeline'
import { sanitizeFilenameComponent } from './clipFilename'

export const MIN_CARD_SECONDS = 1
export const MAX_CARD_SECONDS = 5
export const DEFAULT_CARD_SECONDS = 2

export interface ReelPlanOptions {
  titleCards: boolean
  /** Clamped to [MIN_CARD_SECONDS, MAX_CARD_SECONDS]. */
  cardSeconds: number
}

interface ReelPartBase {
  clip: Clip
  /** 1-based position of the clip in the reel. */
  number: number
  segments: OutputSegment[]
  frameCount: number
}

/** A title card freezes the clip's first frame under a full-frame overlay. */
export type ReelPart = (ReelPartBase & { kind: 'card' }) | (ReelPartBase & { kind: 'clip' })

export interface ReelPlan {
  parts: ReelPart[]
  chapters: ReelChapter[]
  /** Total clips in the reel (the N in "n / N"). */
  clipCount: number
  frameCount: number
  /** frameCount / fps. */
  duration: number
}

export function clampCardSeconds(seconds: number): number {
  if (!Number.isFinite(seconds)) return DEFAULT_CARD_SECONDS
  return Math.max(MIN_CARD_SECONDS, Math.min(MAX_CARD_SECONDS, seconds))
}

/**
 * Orders `clips` into reel parts (an optional card before each clip) using
 * the same output timeline as single-clip export, so a clip's holds play in
 * the reel exactly as in its own file. Chapter boundaries are cumulative
 * frame counts, matching the frames the parts actually contain.
 */
export function buildReelPlan(
  clips: Clip[],
  annotations: FreezeAnnotationLike[],
  fps: number,
  options: ReelPlanOptions
): ReelPlan {
  if (clips.length === 0) throw new Error('Choose at least one clip for the reel')
  if (!Number.isFinite(fps) || fps <= 0) throw new Error('Unknown frame rate')

  const cardSeconds = clampCardSeconds(options.cardSeconds)
  const parts: ReelPart[] = []
  const chapters: ReelChapter[] = []
  let frame = 0

  clips.forEach((clip, i) => {
    const number = i + 1
    const chapterStart = frame
    if (options.titleCards) {
      const segments: OutputSegment[] = [{ kind: 'hold', srcTime: clip.start, duration: cardSeconds }]
      const frameCount = Math.round(cardSeconds * fps)
      parts.push({ kind: 'card', clip, number, segments, frameCount })
      frame += frameCount
    }
    const { segments, frameCount } = buildOutputTimeline(clip, annotations, fps)
    parts.push({ kind: 'clip', clip, number, segments, frameCount })
    frame += frameCount
    chapters.push({ title: clip.name, startFrame: chapterStart, frameCount: frame - chapterStart })
  })

  return { parts, chapters, clipCount: clips.length, frameCount: frame, duration: frame / fps }
}

/**
 * Default reel name: the active tag filter ("PK, Breakout"), else the video's
 * file name without its extension, else "Highlights".
 */
export function defaultReelName(tagFilter: string[], videoFileName: string | null): string {
  if (tagFilter.length > 0) return tagFilter.join(', ')
  const stem = videoFileName?.replace(/\.[^.]+$/, '').trim()
  return stem || 'Highlights'
}

/** `Reel - <name>`, sanitized like clip file names; the caller appends `.mp4`. */
export function buildReelBaseName(name: string): string {
  const safe = sanitizeFilenameComponent(name).slice(0, 100).trim() || 'Highlights'
  return `Reel - ${safe}`
}

/** Approximate x264 bits per pixel per frame at each quality's CRF. */
const BITS_PER_PIXEL: Record<ClipExportQuality, number> = { high: 0.1, medium: 0.07, low: 0.05 }
/** Output height cap per quality (see videoScaleFilter in electron/clipExport.ts). */
const MAX_HEIGHT: Record<ClipExportQuality, number> = { high: Infinity, medium: 720, low: 480 }

/** Rough size of an encode, for a free-space warning only. */
export function estimateEncodeBytes(
  durationSeconds: number,
  width: number,
  height: number,
  fps: number,
  quality: ClipExportQuality
): number {
  const outHeight = Math.min(height, MAX_HEIGHT[quality])
  const outWidth = width * (outHeight / height)
  const videoBits = outWidth * outHeight * fps * BITS_PER_PIXEL[quality] * durationSeconds
  const audioBits = 128_000 * durationSeconds
  return Math.ceil((videoBits + audioBits) / 8)
}
