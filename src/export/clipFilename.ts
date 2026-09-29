// Pure filename-building helpers shared between ExportClipsDialog.tsx (the
// actual exported files) and clipsCsv.ts (the `file` column referencing them),
// so the two can never drift apart.

const MAX_COMPONENT_LENGTH = 80
const MAX_BASENAME_LENGTH = 120

/** Removes filesystem-hostile characters and trims, for a safe filename component. */
export function sanitizeFilenameComponent(raw: string): string {
  return raw
    // eslint-disable-next-line no-control-regex
    .replace(/[/\\:*?"<>|\x00-\x1f\x7f]/g, '')
    .trim()
}

/** `nn` is 1-based order in the clip list, e.g. 1 -> "01". */
export function orderLabel(nn: number): string {
  return String(nn).padStart(2, '0')
}

/**
 * Builds the shared base filename for one clip's exported files:
 * `"NN - Name"`, or `"NN - Name [tag1, tag2]"` when the clip has tags.
 * Sanitized for the filesystem and capped at ~120 chars total so a long name
 * plus several tags can't produce an unwieldy or invalid filename. The
 * caller appends its own extension (`.mp4`, `.clean.mp4`, `.rsproj`).
 */
export function buildClipBaseName(nn: number, name: string, tags: string[]): string {
  const sanitizedName = sanitizeFilenameComponent(name).slice(0, MAX_COMPONENT_LENGTH) || 'Clip'
  const sanitizedTags = tags
    .map((tag) => sanitizeFilenameComponent(tag).slice(0, MAX_COMPONENT_LENGTH))
    .filter((tag) => tag.length > 0)

  let base = `${orderLabel(nn)} - ${sanitizedName}`
  if (sanitizedTags.length > 0) {
    base += ` [${sanitizedTags.join(', ')}]`
  }
  if (base.length > MAX_BASENAME_LENGTH) {
    base = base.slice(0, MAX_BASENAME_LENGTH).trim()
  }
  return base
}
