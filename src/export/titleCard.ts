// Title cards for highlight reels (docs/REEL_PLAN.md). The bundled ffmpeg has
// no drawtext, so a card is drawn here as a full-frame RGBA overlay over a
// freeze of the clip's first frame. `layoutTitleCard` is pure (text
// measurement is injected) so the fitting rules are unit-tested;
// `renderTitleCardRgba` draws the layout with Canvas 2D.

const FONT_STACK = '"Inter Variable", Inter, system-ui, -apple-system, sans-serif'
export const MAX_NAME_LINES = 2
export const MAX_TAG_CHIPS = 6
const SCRIM = 'rgba(0, 0, 0, 0.8)'
const TEXT = '#ffffff'
const MUTED = 'rgba(255, 255, 255, 0.72)'
const ACCENT = '#60a5fa'
const CHIP_FILL = 'rgba(255, 255, 255, 0.14)'
const CHIP_STROKE = 'rgba(255, 255, 255, 0.35)'

export interface TitleCardInput {
  width: number
  height: number
  /** 1-based clip number and total, shown as "3 / 12". */
  number: number
  total: number
  name: string
  tags: string[]
}

/** Width of `text` in `font` (a CSS font shorthand). */
export type MeasureText = (text: string, font: string) => number

export interface CardText {
  text: string
  font: string
  color: string
  /** Horizontal center and top edge, in pixels. */
  x: number
  y: number
}

export interface CardChip {
  text: string
  font: string
  x: number
  y: number
  width: number
  height: number
  textX: number
  textY: number
}

export interface TitleCardLayout {
  width: number
  height: number
  scrim: string
  texts: CardText[]
  /** A short accent rule between the counter and the name. */
  rule: { x: number; y: number; width: number; height: number; color: string }
  chips: CardChip[]
}

/** Longest prefix of `text` that fits in `maxWidth` with an ellipsis appended. */
function ellipsize(text: string, font: string, maxWidth: number, measure: MeasureText): string {
  if (measure(text, font) <= maxWidth) return text
  let lo = 0
  let hi = text.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (measure(text.slice(0, mid).trimEnd() + '…', font) <= maxWidth) lo = mid
    else hi = mid - 1
  }
  return text.slice(0, lo).trimEnd() + '…'
}

/**
 * Greedy word wrap to at most `maxLines`; a word wider than the line is
 * broken by characters, and text that still doesn't fit ends in an ellipsis.
 */
export function wrapText(text: string, font: string, maxWidth: number, maxLines: number, measure: MeasureText): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  let i = 0
  while (i < words.length) {
    const word = words[i]
    const candidate = line ? `${line} ${word}` : word
    if (measure(candidate, font) <= maxWidth) {
      line = candidate
      i++
      continue
    }
    if (line) {
      lines.push(line)
      line = ''
    } else {
      // A single word wider than the line: take as many characters as fit.
      let n = word.length
      while (n > 1 && measure(word.slice(0, n), font) > maxWidth) n--
      lines.push(word.slice(0, n))
      words[i] = word.slice(n)
    }
    if (lines.length === maxLines) break
  }
  if (lines.length < maxLines && line) {
    lines.push(line)
    line = ''
  }
  const overflow = line !== '' || i < words.length
  if (overflow && lines.length > 0) {
    const rest = [lines[lines.length - 1], line, ...words.slice(i)].filter(Boolean).join(' ')
    lines[lines.length - 1] = ellipsize(rest, font, maxWidth, measure)
  }
  return lines
}

export function layoutTitleCard(input: TitleCardInput, measure: MeasureText): TitleCardLayout {
  const { width: W, height: H } = input
  const pad = Math.round(W * 0.08)
  const maxWidth = W - pad * 2
  const centerX = W / 2

  const counterSize = Math.max(12, Math.round(H * 0.034))
  const nameSize = Math.max(20, Math.round(H * 0.085))
  const chipSize = Math.max(11, Math.round(H * 0.03))
  const counterFont = `600 ${counterSize}px ${FONT_STACK}`
  const nameFont = `700 ${nameSize}px ${FONT_STACK}`
  const chipFont = `600 ${chipSize}px ${FONT_STACK}`
  const nameLineHeight = Math.round(nameSize * 1.15)

  const nameLines = wrapText(input.name || 'Clip', nameFont, maxWidth, MAX_NAME_LINES, measure)

  // Tag chips: up to MAX_TAG_CHIPS, then "+k"; at most two centred rows.
  const chipHeight = Math.round(chipSize * 1.9)
  const chipPadX = Math.round(chipSize * 0.75)
  const chipGap = Math.round(chipSize * 0.5)
  const shown = input.tags.slice(0, MAX_TAG_CHIPS)
  const hiddenCount = input.tags.length - shown.length
  const labels = hiddenCount > 0 ? [...shown, `+${hiddenCount}`] : shown
  const chipWidthOf = (label: string) => Math.ceil(measure(label, chipFont)) + chipPadX * 2
  const rows: string[][] = []
  for (const raw of labels) {
    const label = chipWidthOf(raw) > maxWidth ? ellipsize(raw, chipFont, maxWidth - chipPadX * 2, measure) : raw
    const row = rows[rows.length - 1]
    const rowWidth = row ? row.reduce((sum, l) => sum + chipWidthOf(l), 0) + chipGap * row.length : 0
    if (row && rowWidth + chipWidthOf(label) <= maxWidth) row.push(label)
    else if (rows.length < 2) rows.push([label])
    else break
  }

  const counterGap = Math.round(counterSize * 0.9)
  const ruleHeight = Math.max(2, Math.round(H * 0.004))
  const ruleGap = Math.round(nameSize * 0.45)
  const chipsGap = rows.length > 0 ? Math.round(nameSize * 0.55) : 0
  const chipsHeight = rows.length * chipHeight + Math.max(0, rows.length - 1) * chipGap
  const blockHeight =
    counterSize + counterGap + ruleHeight + ruleGap + nameLines.length * nameLineHeight + chipsGap + chipsHeight
  let y = Math.round((H - blockHeight) / 2)

  const texts: CardText[] = [{ text: `${input.number} / ${input.total}`, font: counterFont, color: MUTED, x: centerX, y }]
  y += counterSize + counterGap
  const ruleWidth = Math.round(W * 0.05)
  const rule = { x: Math.round(centerX - ruleWidth / 2), y, width: ruleWidth, height: ruleHeight, color: ACCENT }
  y += ruleHeight + ruleGap
  for (const line of nameLines) {
    texts.push({ text: line, font: nameFont, color: TEXT, x: centerX, y })
    y += nameLineHeight
  }
  y += chipsGap

  const chips: CardChip[] = []
  for (const row of rows) {
    const widths = row.map(chipWidthOf)
    const rowWidth = widths.reduce((a, b) => a + b, 0) + chipGap * (row.length - 1)
    let x = Math.round(centerX - rowWidth / 2)
    row.forEach((label, i) => {
      chips.push({
        text: label,
        font: chipFont,
        x,
        y,
        width: widths[i],
        height: chipHeight,
        textX: x + widths[i] / 2,
        textY: y + Math.round((chipHeight - chipSize) / 2),
      })
      x += widths[i] + chipGap
    })
    y += chipHeight + chipGap
  }

  return { width: W, height: H, scrim: SCRIM, texts, rule, chips }
}

export function drawTitleCard(ctx: CanvasRenderingContext2D, layout: TitleCardLayout): void {
  ctx.clearRect(0, 0, layout.width, layout.height)
  ctx.fillStyle = layout.scrim
  ctx.fillRect(0, 0, layout.width, layout.height)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  for (const t of layout.texts) {
    ctx.font = t.font
    ctx.fillStyle = t.color
    ctx.fillText(t.text, t.x, t.y)
  }

  ctx.fillStyle = layout.rule.color
  ctx.fillRect(layout.rule.x, layout.rule.y, layout.rule.width, layout.rule.height)

  for (const chip of layout.chips) {
    ctx.beginPath()
    ctx.roundRect(chip.x, chip.y, chip.width, chip.height, chip.height / 2)
    ctx.fillStyle = CHIP_FILL
    ctx.fill()
    ctx.lineWidth = Math.max(1, Math.round(chip.height * 0.05))
    ctx.strokeStyle = CHIP_STROKE
    ctx.stroke()
    ctx.font = chip.font
    ctx.fillStyle = TEXT
    ctx.fillText(chip.text, chip.textX, chip.textY)
  }
}

/** Draws a card at the video's native size and returns its straight-alpha RGBA pixels. */
export async function renderTitleCardRgba(input: TitleCardInput): Promise<Uint8Array> {
  // Make sure the UI font is ready, or the first card can fall back to a default face.
  try {
    await document.fonts?.ready
  } catch {
    // Fall back to whatever font is available.
  }
  const canvas = document.createElement('canvas')
  canvas.width = input.width
  canvas.height = input.height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not draw the title card')
  const measure: MeasureText = (text, font) => {
    ctx.font = font
    return ctx.measureText(text).width
  }
  drawTitleCard(ctx, layoutTitleCard(input, measure))
  const { data } = ctx.getImageData(0, 0, input.width, input.height)
  return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
}
