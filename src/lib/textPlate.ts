import type { fabric } from 'fabric'

/** Custom IText property: draw a rounded backing plate behind the text. */
export const TEXT_PLATE_PROPERTY = 'textPlate'

export type PlatedText = fabric.IText & { textPlate?: boolean }

const DARK_PLATE = 'rgba(0,0,0,0.72)'
const LIGHT_PLATE = 'rgba(255,255,255,0.88)'

/** Relative luminance (0–1) of a #rgb / #rrggbb colour; null for anything else. */
function luminance(color: unknown): number | null {
  if (typeof color !== 'string') return null
  const hex = color.trim().replace('#', '')
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex
  if (!/^[0-9a-f]{6}$/i.test(full)) return null
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Dark plate under light text, light plate under dark text, so the caption always reads. */
export function plateColorFor(textColor: unknown): string {
  const lum = luminance(textColor)
  return lum !== null && lum < 0.3 ? LIGHT_PLATE : DARK_PLATE
}

/**
 * Plate geometry around a text block of the given size. Padding stays under
 * half the font size, which is the margin Fabric's text cache already leaves.
 */
export function plateRect(width: number, height: number, fontSize: number) {
  const padX = fontSize * 0.3
  const padY = fontSize * 0.12
  return {
    x: -width / 2 - padX,
    y: -height / 2 - padY,
    width: width + padX * 2,
    height: height + padY * 2,
    radius: fontSize * 0.18,
  }
}

/** Teach IText to draw, serialize and restore the `textPlate` flag. Idempotent. */
export function installTextPlate(fabricNs: typeof fabric): void {
  /* eslint-disable @typescript-eslint/no-explicit-any -- Fabric's private render hooks are untyped */
  const proto = fabricNs.IText.prototype as any
  if (proto.__textPlateInstalled) return
  proto.__textPlateInstalled = true

  const renderBackground = proto._renderBackground
  proto._renderBackground = function (this: PlatedText, ctx: CanvasRenderingContext2D) {
    if (this.textPlate && this.text) {
      const r = plateRect(this.width ?? 0, this.height ?? 0, this.fontSize ?? 24)
      ctx.save()
      ctx.fillStyle = plateColorFor(this.fill)
      ctx.beginPath()
      if (typeof ctx.roundRect === 'function') ctx.roundRect(r.x, r.y, r.width, r.height, r.radius)
      else ctx.rect(r.x, r.y, r.width, r.height)
      ctx.fill()
      ctx.restore()
    }
    renderBackground.call(this, ctx)
  }

  // Undo snapshots and export clones go through toObject/fromObject.
  const toObject = proto.toObject
  proto.toObject = function (this: PlatedText, propertiesToInclude?: string[]) {
    return toObject.call(this, [TEXT_PLATE_PROPERTY, ...(propertiesToInclude ?? [])])
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */
}
