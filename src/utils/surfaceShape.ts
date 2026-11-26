import { fabric } from '@/lib/fabric'

/** Tools drawn as a surface shape: a group of a translucent fill and an outline that carries the style's shadow. */
export const SURFACE_TOOL_TYPES: ReadonlySet<string> = new Set(['ring', 'zone'])

export function withAlpha(color: string, alpha: number): string {
  const parsed = new fabric.Color(color)
  parsed.setAlpha(alpha)
  return parsed.toRgba()
}

/** The new colour at the fill's own alpha when the fill is translucent; otherwise the new colour as given. */
export function recolorKeepingAlpha(fill: string, color: string): string {
  if (!/^rgba\(/i.test(fill.trim())) return color
  const alpha = new fabric.Color(fill).getAlpha()
  return alpha < 1 ? withAlpha(color, alpha) : color
}

export function buildSurfaceShape(fill: fabric.Object, outline: fabric.Object): fabric.Group {
  return new fabric.Group([fill, outline])
}

export function surfaceParts(object: fabric.Object): { fill: fabric.Object; outline: fabric.Object } | null {
  if (!(object instanceof fabric.Group)) return null
  const items = object.getObjects()
  return items.length === 2 ? { fill: items[0], outline: items[1] } : null
}
