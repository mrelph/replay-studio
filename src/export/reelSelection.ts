// Pure helpers behind the highlight reel dialog: which clips are in the reel,
// in what order, and the names their files get.
import type { Clip } from '@/types/clip'
import { buildClipBaseName } from './clipFilename'
import type { ReelProgress } from './reelRenderer'

/** True if the clip has any of the given lowercased tags (ANY match, like the Clips panel filter). */
export function clipMatchesTags(clip: Clip, tagKeys: Set<string>): boolean {
  return clip.tags.some((tag) => tagKeys.has(tag.toLowerCase()))
}

/** With no tag filter every clip is included; with one, exactly the matching clips. */
export function inclusionForTags(clips: Clip[], tagKeys: Set<string>): Record<string, boolean> {
  return Object.fromEntries(clips.map((clip) => [clip.id, tagKeys.size === 0 || clipMatchesTags(clip, tagKeys)]))
}

/**
 * Keeps the reel's own order for clips that still exist, drops removed ones,
 * and appends clips added since (in clip-list order).
 */
export function syncOrder(order: string[], clips: Clip[]): string[] {
  const present = new Set(clips.map((clip) => clip.id))
  const kept = order.filter((id) => present.has(id))
  const known = new Set(kept)
  return [...kept, ...clips.filter((clip) => !known.has(clip.id)).map((clip) => clip.id)]
}

/** Moves `id` to `toIndex` (clamped). */
export function moveInOrder(order: string[], id: string, toIndex: number): string[] {
  const from = order.indexOf(id)
  if (from === -1) return order
  const next = [...order]
  next.splice(from, 1)
  next.splice(Math.max(0, Math.min(toIndex, next.length)), 0, id)
  return next
}

/** The included clips, in reel order. */
export function reelClips(clips: Clip[], order: string[], included: Record<string, boolean>): Clip[] {
  const byId = new Map(clips.map((clip) => [clip.id, clip]))
  return order.flatMap((id) => {
    const clip = byId.get(id)
    return clip && included[id] ? [clip] : []
  })
}

/** Base file names for clips saved individually, numbered by their place in the reel. */
export function individualBaseNames(clipsInReel: Clip[]): Record<string, string> {
  return Object.fromEntries(clipsInReel.map((clip, i) => [clip.id, buildClipBaseName(i + 1, clip.name, clip.tags)]))
}

export function reelProgressLabel(progress: ReelProgress): string {
  switch (progress.step) {
    case 'card':
      return `Title card ${progress.number} of ${progress.total}…`
    case 'clip':
      return `Clip ${progress.number} of ${progress.total}…`
    case 'join':
      return 'Joining reel…'
  }
}
