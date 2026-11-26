import { fabric } from '@/lib/fabric'
import { SURFACE_TOOL_TYPES, surfaceParts } from './surfaceShape'
import { calloutParts } from './calloutGeometry'

export type AnnotationStyle = 'outline' | 'glow' | 'clean'

export const STYLED_TOOL_TYPES: ReadonlySet<string> = new Set([
  'pen', 'path', 'line', 'arrow', 'arc-arrow', 'rectangle', 'circle', 'text', 'ring', 'zone', 'callout',
])

export function arrowHeadSize(strokeWidth: number): { length: number; width: number } {
  return { length: Math.max(25, strokeWidth * 4), width: Math.max(12, strokeWidth * 2) }
}

export function shadowForStyle(style: AnnotationStyle, color: string, glowBlur?: number): fabric.Shadow | undefined {
  if (style === 'outline') {
    return new fabric.Shadow({ color: 'rgba(0,0,0,0.85)', blur: 3, offsetX: 0, offsetY: 0 })
  }
  if (style === 'glow') {
    return new fabric.Shadow({ color, blur: glowBlur ?? 10, offsetX: 0, offsetY: 0 })
  }
  return undefined
}

const GLOW_BLUR: Record<string, number> = { arrow: 15, 'arc-arrow': 15, rectangle: 12, circle: 12, ring: 12, zone: 12 }

function styleOne(object: fabric.Object, toolType: string, style: AnnotationStyle): void {
  const own = toolType === 'text' ? object.fill : object.stroke
  const color = typeof own === 'string' && own ? own : typeof object.fill === 'string' ? object.fill : '#ffffff'
  object.set({ shadow: shadowForStyle(style, color, GLOW_BLUR[toolType]) })
  object.dirty = true
}

export function restyleObject(object: fabric.Object, toolType: string, style: AnnotationStyle): void {
  if (!STYLED_TOOL_TYPES.has(toolType)) return
  const surface = SURFACE_TOOL_TYPES.has(toolType) ? surfaceParts(object) : null
  const callout = toolType === 'callout' ? calloutParts(object) : null
  if (callout) {
    // The label stands on its plate; a shadow would blur the text.
    styleOne(callout.dot, toolType, style)
    styleOne(callout.leader, toolType, style)
    callout.label.set({ shadow: undefined })
    callout.label.dirty = true
  } else if (surface) {
    surface.fill.set({ shadow: undefined })
    surface.fill.dirty = true
    styleOne(surface.outline, toolType, style)
  } else if (object instanceof fabric.Group) {
    object.getObjects().forEach((child) => styleOne(child, toolType, style))
  } else {
    styleOne(object, toolType, style)
  }
  object.dirty = true
}
