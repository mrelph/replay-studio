import { describe, it, expect } from 'vitest'
import { layoutTitleCard, wrapText, MAX_TAG_CHIPS, type MeasureText } from './titleCard'

/** Monospace stand-in: each character is 0.6 of the font's pixel size wide. */
const measure: MeasureText = (text, font) => {
  const size = Number(/(\d+)px/.exec(font)?.[1] ?? 10)
  return text.length * size * 0.6
}
const FONT = '700 10px sans-serif' // 6 px per character

describe('wrapText', () => {
  it('keeps short text on one line', () => {
    expect(wrapText('Breakout', FONT, 100, 2, measure)).toEqual(['Breakout'])
  })

  it('wraps on words', () => {
    expect(wrapText('Power play entry left side', FONT, 100, 2, measure)).toEqual(['Power play entry', 'left side'])
  })

  it('ellipsizes text that needs more than the allowed lines', () => {
    const lines = wrapText('one two three four five six seven eight nine ten', FONT, 60, 2, measure)
    expect(lines).toHaveLength(2)
    expect(lines[1].endsWith('…')).toBe(true)
    for (const line of lines) expect(measure(line, FONT)).toBeLessThanOrEqual(60)
  })

  it('breaks a single word longer than the line', () => {
    const lines = wrapText('Supercalifragilistic', FONT, 60, 2, measure)
    expect(lines[0]).toBe('Supercalif')
    expect(lines).toHaveLength(2)
    for (const line of lines) expect(measure(line, FONT)).toBeLessThanOrEqual(60)
  })
})

describe('layoutTitleCard', () => {
  const base = { width: 1920, height: 1080, number: 3, total: 12, name: 'Breakout', tags: [] as string[] }

  it('shows the counter, then the name, centred horizontally and vertically', () => {
    const layout = layoutTitleCard(base, measure)
    expect(layout.texts.map((t) => t.text)).toEqual(['3 / 12', 'Breakout'])
    for (const t of layout.texts) expect(t.x).toBe(960)
    const top = layout.texts[0].y
    const bottom = layout.texts[1].y + 92 // name font size at 1080p
    expect(Math.abs(top - (1080 - bottom))).toBeLessThan(40)
    expect(layout.chips).toHaveLength(0)
  })

  it('shows up to six tag chips, then +k, inside the margins', () => {
    const tags = ['PK', 'Breakout', 'D-zone', 'Gap', 'Stick', 'Shot', 'Rebound', 'Goal']
    const layout = layoutTitleCard({ ...base, tags }, measure)
    const labels = layout.chips.map((c) => c.text)
    expect(labels.slice(0, MAX_TAG_CHIPS)).toEqual(tags.slice(0, MAX_TAG_CHIPS))
    expect(labels[labels.length - 1]).toBe('+2')
    for (const chip of layout.chips) {
      expect(chip.x).toBeGreaterThanOrEqual(1920 * 0.08 - 1)
      expect(chip.x + chip.width).toBeLessThanOrEqual(1920 * 0.92 + 1)
    }
    // Chips sit below the name.
    expect(layout.chips[0].y).toBeGreaterThan(layout.texts[1].y)
  })

  it('caps a long name at two lines and scales with resolution', () => {
    const long = 'Neutral zone regroup into a stretch pass that sets up the weak side winger for a one timer'
    const layout = layoutTitleCard({ ...base, name: long, width: 1280, height: 720 }, measure)
    const nameLines = layout.texts.slice(1)
    expect(nameLines).toHaveLength(2)
    expect(nameLines[1].text.endsWith('…')).toBe(true)
    expect(nameLines[0].font).toContain('61px')
  })
})
