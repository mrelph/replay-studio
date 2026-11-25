import type { fabric } from 'fabric'
import type { PlatedText } from '@/lib/textPlate'

export interface TextFormat {
  fontSize: number
  bold: boolean
  italic: boolean
  underline: boolean
  fontFamily: string
  /** Rounded backing plate behind the text. */
  plate: boolean
}

/** Fonts offered for text. Arial is the system face; the rest ship with the app so every machine renders them alike. */
export const FONT_FAMILIES: { label: string; value: string }[] = [
  { label: 'Arial', value: 'Arial' },
  { label: 'Inter', value: 'Inter Variable' },
  { label: 'Oswald', value: 'Oswald Variable' },
  { label: 'Roboto Slab', value: 'Roboto Slab Variable' },
  { label: 'Marker', value: 'Permanent Marker' },
]

export const FONT_SIZES = [12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128]

export const DEFAULT_TEXT_FORMAT: TextFormat = {
  fontSize: 24, bold: false, italic: false, underline: false, fontFamily: 'Arial', plate: false,
}

const TEXT_TYPES = new Set(['i-text', 'text', 'textbox'])

export function isTextObject(object: fabric.Object | null | undefined): object is fabric.IText {
  return !!object && TEXT_TYPES.has(object.type ?? '')
}

/** Next preset above (dir 1) or below (dir -1) the current size; clamps at the ends. */
export function stepFontSize(current: number, dir: 1 | -1): number {
  if (dir === 1) {
    return FONT_SIZES.find((s) => s > current) ?? FONT_SIZES[FONT_SIZES.length - 1]
  }
  return [...FONT_SIZES].reverse().find((s) => s < current) ?? FONT_SIZES[0]
}

/** Fabric text options for a format. */
export function textFormatProps(format: TextFormat): fabric.ITextOptions & { textPlate: boolean } {
  return {
    fontSize: format.fontSize,
    fontWeight: format.bold ? 'bold' : 'normal',
    fontStyle: format.italic ? 'italic' : 'normal',
    underline: format.underline,
    fontFamily: format.fontFamily,
    textPlate: format.plate,
  }
}

/**
 * The format a text object shows on screen. Dragging a corner handle scales
 * the object instead of changing fontSize, so the size folds the scale in.
 */
export function readTextFormat(object: fabric.IText): TextFormat {
  const weight = object.fontWeight
  return {
    fontSize: Math.round((object.fontSize ?? DEFAULT_TEXT_FORMAT.fontSize) * (object.scaleY ?? 1)),
    bold: weight === 'bold' || Number(weight) >= 600,
    italic: object.fontStyle === 'italic' || object.fontStyle === 'oblique',
    underline: !!object.underline,
    fontFamily: object.fontFamily ?? DEFAULT_TEXT_FORMAT.fontFamily,
    plate: !!(object as PlatedText).textPlate,
  }
}

/** Apply part of a format. Setting a size also resets handle scaling so the size is exact. */
export function applyTextFormat(object: fabric.IText, changes: Partial<TextFormat>): void {
  if (changes.fontSize !== undefined) {
    object.set({ fontSize: changes.fontSize, scaleX: 1, scaleY: 1 })
  }
  if (changes.bold !== undefined) object.set({ fontWeight: changes.bold ? 'bold' : 'normal' })
  if (changes.italic !== undefined) object.set({ fontStyle: changes.italic ? 'italic' : 'normal' })
  if (changes.underline !== undefined) object.set({ underline: changes.underline })
  if (changes.fontFamily !== undefined) object.set({ fontFamily: changes.fontFamily })
  if (changes.plate !== undefined) (object as PlatedText).textPlate = changes.plate
  object.dirty = true
  object.setCoords()
}

/**
 * Make sure a bundled font is loaded before Fabric measures text with it;
 * otherwise widths are measured against the fallback face and cached.
 */
export async function ensureFontLoaded(fontFamily: string): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return
  try {
    await Promise.all(['normal', 'bold'].map((weight) => document.fonts.load(`${weight} 24px "${fontFamily}"`)))
  } catch {
    // A font that fails to load falls back to the default face.
  }
}
