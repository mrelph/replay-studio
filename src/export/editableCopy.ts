import type { Annotation } from '@/stores/drawingStore'
import type { Clip } from '@/types/clip'
import { serializeProject, type ProjectData } from '@/utils/projectSerializer'
import { CLIP_COLORS } from '@/stores/clipStore'

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * Builds the `ProjectData` for a clip's "editable copy": the clean
 * (drawings-free) exported video plus a `.rsproj` that reopens it with that
 * clip's own annotations, rebased so the clip plays from t=0.
 *
 * - Keeps annotations that overlap `[clip.start, clip.end)` (an annotation
 *   ending exactly at `clip.start` is included, since the live visibility
 *   rule in `annotationStateAt` treats `endTime` as inclusive).
 * - Rebases `startTime`/`endTime` by `-clip.start`, then clamps both into
 *   `[0, clip.end - clip.start]` so an annotation that started before the
 *   clip or runs past its end doesn't produce negative or out-of-range
 *   times in the copy.
 * - Keeps `freezeDuration` untouched (it's a duration, not a timestamp, so
 *   it needs no rebasing) so the reopened project still honors the freeze.
 * - `clips` carries the original clip's own name/tags/notes forward as a
 *   single clip spanning the whole copy (`[0, clipDuration]`), so reopening
 *   the editable copy still shows them instead of starting from `clips: []`.
 * - `inPoint`/`outPoint` are `null` and `videoPath` is `cleanVideoPath` (the
 *   absolute path of the clean video written alongside this project file).
 */
export function buildEditableProject(
  clip: Pick<Clip, 'start' | 'end' | 'name' | 'tags' | 'notes'>,
  annotations: Annotation[],
  cleanVideoPath: string,
  nameBase: string
): ProjectData {
  const clipDuration = clip.end - clip.start

  const rebased: Annotation[] = annotations
    .filter((a) => a.startTime < clip.end && a.endTime >= clip.start)
    .map((a) => ({
      ...a,
      startTime: clamp(a.startTime - clip.start, 0, clipDuration),
      endTime: clamp(a.endTime - clip.start, 0, clipDuration),
    }))

  const project = serializeProject(rebased, cleanVideoPath, null, null, nameBase)

  const copiedClip: Clip = {
    id: 'clip-editable-copy',
    name: clip.name,
    start: 0,
    end: clipDuration,
    color: CLIP_COLORS[0],
    tags: clip.tags,
    notes: clip.notes,
  }

  return { ...project, clips: [copiedClip] }
}
