// Shared normalization rules for clip tags/notes, used by clipStore (live
// edits), projectSerializer (loading project files) and clipPrefsStore
// (sticky tags) so all three agree on the same contract.

export const MAX_TAG_LENGTH = 24
export const MAX_TAGS_PER_CLIP = 12
export const MAX_NOTES_LENGTH = 2000

/** Trims, collapses internal whitespace, and caps length. `''` means "not a usable tag". */
export function normalizeTag(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, MAX_TAG_LENGTH)
}

/**
 * Normalizes a list of tags: trims/collapses whitespace, drops entries that
 * normalize to nothing, case-insensitively dedupes (keeping the casing of
 * the first occurrence), and caps the result at `MAX_TAGS_PER_CLIP`.
 */
export function normalizeTags(rawTags: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of rawTags) {
    if (result.length >= MAX_TAGS_PER_CLIP) break
    const tag = normalizeTag(raw)
    if (!tag) continue
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(tag)
  }
  return result
}

/** Caps notes length; used on both live edits and project-file loads. */
export function clampNotes(raw: string): string {
  return raw.slice(0, MAX_NOTES_LENGTH)
}

// Subtle, fixed-hue chip backgrounds (Tailwind's literal palette, like the
// annotation-type colors in AnnotationTimeline.tsx's getColor()) so the same
// tag always renders the same color without needing a theme-token per tag.
// The app switches themes via a `data-theme` attribute, not OS preference, so
// (like that precedent) these are plain literal classes, not `dark:` variants.
const TAG_COLOR_CLASSES = [
  'bg-red-500/15 text-red-400',
  'bg-orange-500/15 text-orange-400',
  'bg-amber-500/15 text-amber-400',
  'bg-lime-500/15 text-lime-400',
  'bg-green-500/15 text-green-400',
  'bg-teal-500/15 text-teal-400',
  'bg-cyan-500/15 text-cyan-400',
  'bg-blue-500/15 text-blue-400',
  'bg-indigo-500/15 text-indigo-400',
  'bg-purple-500/15 text-purple-400',
  'bg-pink-500/15 text-pink-400',
]

/** Stable (same tag -> same classes) subtle chip coloring via a simple string hash. */
export function hashTagColorClass(tag: string): string {
  const key = tag.toLowerCase()
  let hash = 0
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) | 0
  }
  const index = Math.abs(hash) % TAG_COLOR_CLASSES.length
  return TAG_COLOR_CLASSES[index]
}
