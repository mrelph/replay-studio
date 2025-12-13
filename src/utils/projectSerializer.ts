import type { Annotation } from '@/stores/drawingStore'

export interface SerializedAnnotation {
  id: string
  type: string
  startTime: number
  endTime: number
  layer: number
  toolType: string
  fadeIn?: number
  fadeOut?: number
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
    // For lines
    x1?: number
    y1?: number
    x2?: number
    y2?: number
    // For paths (pen tool)
    path?: any[]
    // For text
    text?: string
    fontSize?: number
    fontFamily?: string
    // For groups
    objects?: any[]
  }
}

export interface ProjectData {
  version: string
  name: string
  createdAt: string
  modifiedAt: string
  videoPath?: string
  inPoint: number | null
  outPoint: number | null
  annotations: SerializedAnnotation[]
}

// Serialize a Fabric.js object to plain JSON
function serializeFabricObject(obj: any): SerializedAnnotation['fabricData'] {
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
      return { ...base, text: obj.text, fontSize: obj.fontSize, fontFamily: obj.fontFamily }
    case 'triangle':
      return { ...base, width: obj.width, height: obj.height }
    case 'group':
      return {
        ...base,
        objects: obj._objects?.map((o: any) => serializeFabricObject(o)) || []
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
  projectName?: string
): ProjectData {
  const now = new Date().toISOString()

  return {
    version: '1.0.0',
    name: projectName || 'Untitled Project',
    createdAt: now,
    modifiedAt: now,
    videoPath,
    inPoint: inPoint ?? null,
    outPoint: outPoint ?? null,
    annotations: annotations.map(ann => ({
      id: ann.id,
      type: ann.object?.type || 'unknown',
      startTime: ann.startTime,
      endTime: ann.endTime,
      layer: ann.layer,
      toolType: ann.toolType,
      fadeIn: ann.fadeIn,
      fadeOut: ann.fadeOut,
      fabricData: serializeFabricObject(ann.object)
    }))
  }
}

// Export project to JSON string
export function exportProjectToJSON(project: ProjectData): string {
  return JSON.stringify(project, null, 2)
}

// Import project from JSON string
export function importProjectFromJSON(json: string): ProjectData {
  try {
    const data = JSON.parse(json)

    // Validate required fields
    if (!data.version || !data.annotations) {
      throw new Error('Invalid project file format')
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

  // Add shadow for broadcast style
  const shadow = data.stroke ? new fabric.Shadow({
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
      })

    case 'triangle':
      return new fabric.Triangle({
        ...commonProps,
        width: data.width,
        height: data.height,
        shadow,
      })

    case 'group':
      const objects = data.objects?.map((o: any) => deserializeFabricObject(fabric, o)) || []
      return new fabric.Group(objects, commonProps)

    default:
      // Return a basic rect as fallback
      return new fabric.Rect({
        ...commonProps,
        width: 50,
        height: 50,
      })
  }
}
