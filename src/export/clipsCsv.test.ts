import { describe, it, expect } from 'vitest'
import { buildClipsCsv, formatCsvTimecode, type ClipCsvRow } from './clipsCsv'

function makeRow(overrides: Partial<ClipCsvRow> = {}): ClipCsvRow {
  return {
    number: 1,
    name: 'First half',
    start: 0,
    end: 12.4,
    tags: [],
    notes: '',
    file: '01 - First half.mp4',
    status: 'exported',
    ...overrides,
  }
}

describe('formatCsvTimecode', () => {
  it('formats hh:mm:ss.f', () => {
    expect(formatCsvTimecode(0)).toBe('00:00:00.0')
    expect(formatCsvTimecode(12.4)).toBe('00:00:12.4')
    expect(formatCsvTimecode(65)).toBe('00:01:05.0')
    expect(formatCsvTimecode(3725.7)).toBe('01:02:05.7')
  })

  it('clamps negative seconds to zero', () => {
    expect(formatCsvTimecode(-5)).toBe('00:00:00.0')
  })
})

describe('buildClipsCsv', () => {
  it('writes a header row and one row per clip, with CRLF line endings', () => {
    const csv = buildClipsCsv([makeRow()])
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe('Number,Name,Start,End,Duration,Tags,Notes,File,Status')
    expect(lines[1]).toBe('1,First half,00:00:00.0,00:00:12.4,00:00:12.4,,,01 - First half.mp4,exported')
    // Trailing CRLF -> a final empty element after split.
    expect(lines[lines.length - 1]).toBe('')
  })

  it('joins tags with a semicolon', () => {
    const csv = buildClipsCsv([makeRow({ tags: ['Offense', 'PP'] })])
    expect(csv).toContain('Offense;PP')
  })

  it('quotes a field containing a comma, doubling no quotes since there are none', () => {
    const csv = buildClipsCsv([makeRow({ name: 'Set, Play' })])
    expect(csv).toContain('"Set, Play"')
  })

  it('quotes a field containing a quote and doubles the inner quote', () => {
    const csv = buildClipsCsv([makeRow({ notes: 'He said "go"' })])
    expect(csv).toContain('"He said ""go"""')
  })

  it('quotes a field containing a newline', () => {
    const csv = buildClipsCsv([makeRow({ notes: 'line one\nline two' })])
    expect(csv).toContain('"line one\nline two"')
  })

  it('neutralizes spreadsheet formula injection with a leading apostrophe', () => {
    const csv = buildClipsCsv([
      makeRow({ number: 1, name: '=cmd|/c calc', notes: '+1', file: '-danger.mp4' }),
    ])
    const dataLine = csv.split('\r\n')[1]
    expect(dataLine).toContain("'=cmd|/c calc")
    expect(dataLine).toContain("'+1")
    expect(dataLine).toContain("'-danger.mp4")
  })

  it('neutralizes an @-formula and a tab/CR-leading field', () => {
    const csv = buildClipsCsv([makeRow({ name: '@SUM(A1)', notes: '\ttabbed' })])
    expect(csv).toContain("'@SUM(A1)")
    // The notes field starts with a tab, which also needs quoting (control char in RFC 4180
    // is not required, but combined with the apostrophe prefix it stays a single field).
    expect(csv).toContain("'\ttabbed")
  })

  it('does not neutralize a field that merely contains, but does not start with, a trigger character', () => {
    const csv = buildClipsCsv([makeRow({ name: 'Play - Set' })])
    const dataLine = csv.split('\r\n')[1]
    expect(dataLine).toContain('Play - Set')
    expect(dataLine).not.toContain("'Play - Set")
  })

  it('maps each status through unchanged', () => {
    const csv = buildClipsCsv([
      makeRow({ number: 1, status: 'exported' }),
      makeRow({ number: 2, status: 'failed' }),
      makeRow({ number: 3, status: 'cancelled' }),
    ])
    const lines = csv.split('\r\n')
    expect(lines[1].endsWith(',exported')).toBe(true)
    expect(lines[2].endsWith(',failed')).toBe(true)
    expect(lines[3].endsWith(',cancelled')).toBe(true)
  })
})
