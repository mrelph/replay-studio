import type { Annotation } from '@/stores/drawingStore'
import { useDrawingStore } from '@/stores/drawingStore'
import { toast } from '@/components/ui'
import fabricModule from 'fabric'

const fabric: any = (fabricModule as any).fabric || fabricModule

export interface AnnotationPackage {
  version: string
  exportedAt: string
  sourceDimensions: { width: number; height: number }
  annotations: SerializedExportAnnotation[]
}

interface SerializedExportAnnotation {
  id: string
  startTime: number
  endTime: number
  layer: number
  toolType: string
  fadeIn?: number
  fadeOut?: number
  fabricData: any
}

function serializeFabricObject(obj: any): any {
  const base: any = {
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

  if (obj.shadow) {
    base.shadow = {
      color: obj.shadow.color,
      blur: obj.shadow.blur,
      offsetX: obj.shadow.offsetX,
      offsetY: obj.shadow.offsetY,
    }
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
      return { ...base, path: obj.path, strokeLineCap: obj.strokeLineCap }
    case 'i-text':
    case 'text':
      return { ...base, text: obj.text, fontSize: obj.fontSize, fontFamily: obj.fontFamily, fontWeight: obj.fontWeight }
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

function deserializeFabricObj(data: any): any {
  const commonProps: any = {
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

  if (data.shadow) {
    commonProps.shadow = new fabric.Shadow(data.shadow)
  }

  switch (data.type) {
    case 'rect':
      return new fabric.Rect({ ...commonProps, width: data.width, height: data.height })
    case 'circle':
      return new fabric.Circle({ ...commonProps, radius: data.radius })
    case 'ellipse':
      return new fabric.Ellipse({ ...commonProps, rx: data.rx, ry: data.ry })
    case 'line':
      return new fabric.Line([data.x1, data.y1, data.x2, data.y2], commonProps)
    case 'path':
      return new fabric.Path(data.path, { ...commonProps, strokeLineCap: data.strokeLineCap })
    case 'i-text':
    case 'text':
      return new fabric.IText(data.text || '', { ...commonProps, fontSize: data.fontSize, fontFamily: data.fontFamily, fontWeight: data.fontWeight })
    case 'triangle':
      return new fabric.Triangle({ ...commonProps, width: data.width, height: data.height })
    case 'group': {
      const objects = data.objects?.map((o: any) => deserializeFabricObj(o)) || []
      return new fabric.Group(objects, commonProps)
    }
    default:
      return new fabric.Rect({ ...commonProps, width: 50, height: 50 })
  }
}

function scaleAnnotation(data: any, scaleX: number, scaleY: number): any {
  const scaled = { ...data }
  scaled.left = (scaled.left || 0) * scaleX
  scaled.top = (scaled.top || 0) * scaleY

  if (scaled.width) scaled.width *= scaleX
  if (scaled.height) scaled.height *= scaleY
  if (scaled.radius) scaled.radius *= Math.min(scaleX, scaleY)
  if (scaled.rx) scaled.rx *= scaleX
  if (scaled.ry) scaled.ry *= scaleY
  if (scaled.x1 !== undefined) { scaled.x1 *= scaleX; scaled.y1 *= scaleY; scaled.x2 *= scaleX; scaled.y2 *= scaleY }
  if (scaled.fontSize) scaled.fontSize *= Math.min(scaleX, scaleY)

  if (scaled.objects) {
    scaled.objects = scaled.objects.map((o: any) => scaleAnnotation(o, scaleX, scaleY))
  }

  return scaled
}

export async function exportAnnotations(annotations: Annotation[]) {
  if (!window.electronAPI) {
    toast('error', 'Export requires Electron')
    return
  }

  try {
    const filePath = await window.electronAPI.saveAnnotations('annotations.rsann')
    if (!filePath) return

    // Get canvas dimensions for coordinate scaling
    const canvas = useDrawingStore.getState().canvas
    const width = canvas?.getWidth() || 1920
    const height = canvas?.getHeight() || 1080

    const pkg: AnnotationPackage = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      sourceDimensions: { width, height },
      annotations: annotations.map((ann) => ({
        id: ann.id,
        startTime: ann.startTime,
        endTime: ann.endTime,
        layer: ann.layer,
        toolType: ann.toolType,
        fadeIn: ann.fadeIn,
        fadeOut: ann.fadeOut,
        fabricData: serializeFabricObject(ann.object),
      })),
    }

    const json = JSON.stringify(pkg, null, 2)
    const result = await window.electronAPI.writeFile(filePath, json)

    if (result.success) {
      toast('success', `Exported ${annotations.length} annotations`)
    } else {
      toast('error', `Export failed: ${result.error}`)
    }
  } catch {
    toast('error', 'Error exporting annotations')
  }
}

export async function importAnnotations() {
  if (!window.electronAPI) {
    toast('error', 'Import requires Electron')
    return
  }

  try {
    const filePath = await window.electronAPI.loadAnnotations()
    if (!filePath) return

    const result = await window.electronAPI.readFile(filePath)
    if (!result.success || !result.content) {
      toast('error', `Failed to read file: ${result.error}`)
      return
    }

    const pkg: AnnotationPackage = JSON.parse(result.content)
    if (!pkg.version || !pkg.annotations) {
      toast('error', 'Invalid annotation file format')
      return
    }

    const { canvas, addAnnotation } = useDrawingStore.getState()
    if (!canvas) {
      toast('error', 'Canvas not ready')
      return
    }

    // Calculate scale factors if dimensions differ
    const currentWidth = canvas.getWidth() || 1920
    const currentHeight = canvas.getHeight() || 1080
    const scaleX = currentWidth / (pkg.sourceDimensions?.width || currentWidth)
    const scaleY = currentHeight / (pkg.sourceDimensions?.height || currentHeight)
    const needsScaling = Math.abs(scaleX - 1) > 0.01 || Math.abs(scaleY - 1) > 0.01

    const prefix = `imp-${Date.now()}-`
    let count = 0

    for (const ann of pkg.annotations) {
      const fabricData = needsScaling ? scaleAnnotation(ann.fabricData, scaleX, scaleY) : ann.fabricData
      const fabricObj = deserializeFabricObj(fabricData)
      canvas.add(fabricObj)

      addAnnotation({
        id: prefix + ann.id,
        object: fabricObj,
        startTime: ann.startTime,
        endTime: ann.endTime,
        layer: ann.layer,
        toolType: ann.toolType,
        fadeIn: ann.fadeIn,
        fadeOut: ann.fadeOut,
      })
      count++
    }

    canvas.renderAll()
    toast('success', `Imported ${count} annotations`)
  } catch {
    toast('error', 'Error importing annotations')
  }
}
