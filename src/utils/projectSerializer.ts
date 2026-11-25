import type { Annotation } from '@/stores/drawingStore'
import type { Clip } from '@/types/clip'
import { CLIP_COLORS } from '@/stores/clipStore'
import { stripReveal } from '@/export/reveal'
import { normalizeTags, clampNotes } from './clipTags'
import type { SpeedRegion } from './speedRegions'

export interface SerializedAnnotation {
  id: string
  type: string
  startTime: number
  endTime: number
  layer: number
  toolType: string
  fadeIn?: number
  fadeOut?: number
  drawIn?: number
  revealDelay?: number
  name?: string
  freezeDuration?: number
  freezeAuto?: boolean
  // Fabric.js object properties
  fabricData: {
    type: string
    left: number
    top: number
    width?: number
    height?: number
    radius?: number
    rx?: number
    ry?: number
    fill?: string
    stroke?: string
    strokeWidth?: number
    angle?: number
    scaleX?: number
    scaleY?: number
    opacity?: number
    /** Absent in files saved before styles existed; null means no shadow. */
    shadow?: { color: string; blur: number; offsetX: number; offsetY: number } | null
    // For lines
    x1?: number
    y1?: number
    x2?: number
    y2?: number
    // For paths (pen tool)
    path?: unknown[]
    // For text
    text?: string
    fontSize?: number
    fontFamily?: string
    /** Absent in files saved before text formatting existed. */
    fontWeight?: string | number
    fontStyle?: string
    underline?: boolean
    textPlate?: boolean
    // For groups
    objects?: SerializedFabricData[]
  }
}

/** Plain-JSON shape of a single serialized Fabric object. */
export type SerializedFabricData = SerializedAnnotation['fabricData']

export interface ProjectData {
  version: string
  name: string
  createdAt: string
  modifiedAt: string
  videoPath?: string
  inPoint: number | null
  outPoint: number | null
  annotations: SerializedAnnotation[]
  /** Added in project version 1.1; absent in older files. */
  clips?: Clip[]
  /** Added in project version 1.3; absent in older files. */
  speedRegions?: SpeedRegion[]
}

/** Whether a project has anything worth saving: annotations, speed regions or clips (counts). */
export function hasProjectContent(counts: { annotations: number; speedRegions: number; clips: number }): boolean {
  return counts.annotations > 0 || counts.speedRegions > 0 || counts.clips > 0
}

/**
 * A Fabric object viewed through every subclass field this module reads.
 * Fabric's own types put these on separate subclasses, but serialization
 * dispatches on `type` at runtime, so widen once here instead of casting
 * at each access.
 */
type SerializableFabricObject = fabric.Object & {
  radius?: number
  rx?: number
  ry?: number
  x1?: number
  y1?: number
  x2?: number
  y2?: number
  path?: unknown[]
  text?: string
  fontSize?: number
  fontFamily?: string
  fontWeight?: string | number
  fontStyle?: string
  underline?: boolean
  textPlate?: boolean
  _objects?: SerializableFabricObject[]
}

function serializeShadow(shadow: unknown): { color: string; blur: number; offsetX: number; offsetY: number } | null {
  if (!shadow || typeof shadow !== 'object') return null
  const sh = shadow as { color?: string; blur?: number; offsetX?: number; offsetY?: number }
  return { color: sh.color ?? 'rgb(0,0,0)', blur: sh.blur ?? 0, offsetX: sh.offsetX ?? 0, offsetY: sh.offsetY ?? 0 }
}

// Serialize a Fabric.js object to plain JSON
export function serializeFabricObject(input: fabric.Object): SerializedAnnotation['fabricData'] {
  const obj = input as SerializableFabricObject
  const base = {
    type: obj.type || 'object',
    left: obj.left || 0,
    top: obj.top || 0,
    angle: obj.angle || 0,
    scaleX: obj.scaleX || 1,
    scaleY: obj.scaleY || 1,
    opacity: obj.opacity ?? 1,
    fill: typeof obj.fill === 'string' ? obj.fill : undefined,
    stroke: obj.stroke,
    strokeWidth: obj.strokeWidth,
    shadow: serializeShadow(obj.shadow),
  }

  switch (obj.type) {
    case 'rect':
      return { ...base, width: obj.width, height: obj.height }
    case 'circle':
      return { ...base, radius: obj.radius }
    case 'ellipse':
      return { ...base, rx: obj.rx, ry: obj.ry }
    case 'line':
      return { ...base, x1: obj.x1, y1: obj.y1, x2: obj.x2, y2: obj.y2 }
    case 'path':
      return { ...base, path: obj.path }
    case 'i-text':
    case 'text':
      return {
        ...base,
        text: obj.text,
        fontSize: obj.fontSize,
        fontFamily: obj.fontFamily,
        fontWeight: obj.fontWeight,
        fontStyle: obj.fontStyle,
        underline: !!obj.underline,
        textPlate: !!obj.textPlate,
      }
    case 'triangle':
      return { ...base, width: obj.width, height: obj.height }
    case 'group':
      return {
        ...base,
        objects: obj._objects?.map((o) => serializeFabricObject(o)) || []
      }
    default:
      return base
  }
}

// Serialize annotations to project data
export function serializeProject(
  annotations: Annotation[],
  videoPath?: string,
  inPoint?: number | null,
  outPoint?: number | null,
  projectName?: string,
  clips?: Clip[],
  speedRegions?: SpeedRegion[]
): ProjectData {
  const now = new Date().toISOString()

  return {
    version: '1.3',
    name: projectName || 'Untitled Project',
    createdAt: now,
    modifiedAt: now,
    videoPath,
    inPoint: inPoint ?? null,
    outPoint: outPoint ?? null,
    annotations: annotations.map(ann => {
      if (ann.object) stripReveal(ann.object)
      return {
        id: ann.id,
        type: ann.object?.type || 'unknown',
        startTime: ann.startTime,
        endTime: ann.endTime,
        layer: ann.layer,
        toolType: ann.toolType,
        fadeIn: ann.fadeIn,
        fadeOut: ann.fadeOut,
        drawIn: ann.drawIn,
        revealDelay: ann.revealDelay,
        name: ann.name,
        freezeDuration: ann.freezeDuration,
        freezeAuto: ann.freezeAuto,
        fabricData: serializeFabricObject(ann.object)
      }
    }),
    // Deep-copied so mutating the store afterwards can't reach back into a
    // project that has already been serialized (e.g. while a save is pending).
    clips: (clips ?? []).map((clip) => ({ ...clip })),
    speedRegions: (speedRegions ?? []).map((region) => ({ ...region })),
  }
}

// Export project to JSON string
export function exportProjectToJSON(project: ProjectData): string {
  return JSON.stringify(project, null, 2)
}

let importedClipIdCounter = 0
function generateImportedClipId(): string {
  importedClipIdCounter += 1
  return `clip-imported-${Date.now().toString(36)}-${importedClipIdCounter}`
}

/**
 * Filters and repairs a project file's `clips` array. Older files (version
 * < 1.1) have no `clips` field at all, which is treated as an empty list.
 * Entries with a non-finite or inverted/empty range are dropped outright;
 * entries missing `id`, `name` or `color` are repaired in place so a project
 * hand-edited or produced by another tool still loads. `tags`/`notes` were
 * added in version 1.2; a project saved before that (or a hand-edited entry)
 * gets `tags: []`/`notes: ''` defaults. Non-string tag entries are dropped
 * and the remainder run through the same normalization live edits use.
 */
function sanitizeClips(raw: unknown): Clip[] {
  if (!Array.isArray(raw)) return []

  const result: Clip[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const candidate = entry as Partial<Clip>
    const start = candidate.start
    const end = candidate.end
    if (typeof start !== 'number' || !Number.isFinite(start)) continue
    if (typeof end !== 'number' || !Number.isFinite(end)) continue
    if (end <= start) continue

    const id = typeof candidate.id === 'string' && candidate.id.length > 0
      ? candidate.id
      : generateImportedClipId()
    const name = typeof candidate.name === 'string' && candidate.name.length > 0
      ? candidate.name
      : `Clip ${result.length + 1}`
    const color = typeof candidate.color === 'string' && candidate.color.length > 0
      ? candidate.color
      : CLIP_COLORS[result.length % CLIP_COLORS.length]
    const tags = Array.isArray(candidate.tags)
      ? normalizeTags(candidate.tags.filter((tag): tag is string => typeof tag === 'string'))
      : []
    const notes = typeof candidate.notes === 'string' ? clampNotes(candidate.notes) : ''

    result.push({ id, name, start, end, color, tags, notes })
  }
  return result
}

// Import project from JSON string
export function importProjectFromJSON(json: string): ProjectData {
  try {
    const data = JSON.parse(json)

    // Validate required fields
    if (!data.version || !Array.isArray(data.annotations)) {
      throw new Error('Invalid project file format')
    }

    // Older files (version < 1.1) have no `clips` field; leave it undefined
    // so callers' `project.clips ?? []` keeps working unchanged. When present,
    // sanitize so a hand-edited or malformed entry can't reach the app.
    if (data.clips !== undefined) {
      data.clips = sanitizeClips(data.clips)
    }

    // Duration and fps aren't known here; the store does the full cleanup
    // (sanitizeSpeedRegions) when the regions are put in it.
    if (data.speedRegions !== undefined) {
      data.speedRegions = Array.isArray(data.speedRegions)
        ? data.speedRegions.filter((entry: unknown) => entry && typeof entry === 'object')
        : []
    }

    return data as ProjectData
  } catch (e) {
    throw new Error(`Failed to parse project file: ${e instanceof Error ? e.message : 'Unknown error'}`)
  }
}

// Recreate Fabric.js object from serialized data
export function deserializeFabricObject(fabric: any, data: SerializedAnnotation['fabricData']): any {
  const commonProps = {
    left: data.left,
    top: data.top,
    angle: data.angle,
    scaleX: data.scaleX,
    scaleY: data.scaleY,
    opacity: data.opacity,
    fill: data.fill,
    stroke: data.stroke,
    strokeWidth: data.strokeWidth,
    selectable: true,
    evented: true,
  }

  // Files saved with a stored shadow rebuild exactly that; older files keep the legacy glow.
  const hasStoredShadow = data.shadow !== undefined
  const storedShadow = data.shadow ? new fabric.Shadow(data.shadow) : undefined
  const shadow = hasStoredShadow ? storedShadow : data.stroke ? new fabric.Shadow({
    color: data.stroke,
    blur: 12,
    offsetX: 0,
    offsetY: 0,
  }) : undefined

  switch (data.type) {
    case 'rect':
      return new fabric.Rect({
        ...commonProps,
        width: data.width,
        height: data.height,
        shadow,
      })

    case 'circle':
      return new fabric.Circle({
        ...commonProps,
        radius: data.radius,
        shadow,
      })

    case 'ellipse':
      return new fabric.Ellipse({
        ...commonProps,
        rx: data.rx,
        ry: data.ry,
        shadow,
      })

    case 'line':
      return new fabric.Line([data.x1, data.y1, data.x2, data.y2], {
        ...commonProps,
        shadow,
      })

    case 'path':
      return new fabric.Path(data.path, {
        ...commonProps,
        shadow,
      })

    case 'i-text':
    case 'text':
      return new fabric.IText(data.text || '', {
        ...commonProps,
        fontSize: data.fontSize,
        fontFamily: data.fontFamily,
        fontWeight: data.fontWeight ?? 'normal',
        fontStyle: data.fontStyle ?? 'normal',
        underline: data.underline ?? false,
        textPlate: data.textPlate ?? false,
        ...(hasStoredShadow ? { shadow } : {}),
      })

    case 'triangle':
      return new fabric.Triangle({
        ...commonProps,
        width: data.width,
        height: data.height,
        shadow,
      })

    case 'group': {
      const objects = data.objects?.map((o: SerializedAnnotation['fabricData']) => deserializeFabricObject(fabric, o)) || []
      return new fabric.Group(objects, commonProps)
    }

    default:
      // Return a basic rect as fallback
      return new fabric.Rect({
        ...commonProps,
        width: 50,
        height: 50,
      })
  }
}
