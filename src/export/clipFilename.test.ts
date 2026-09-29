import { describe, it, expect } from 'vitest'
import { buildClipBaseName, orderLabel, sanitizeFilenameComponent } from './clipFilename'

describe('orderLabel', () => {
  it('zero-pads to two digits', () => {
    expect(orderLabel(1)).toBe('01')
    expect(orderLabel(23)).toBe('23')
    expect(orderLabel(100)).toBe('100')
  })
})

describe('sanitizeFilenameComponent', () => {
  it('strips filesystem-hostile characters', () => {
    expect(sanitizeFilenameComponent('a/b\\c:d*e?f"g<h>i|j')).toBe('abcdefghij')
  })

  it('trims whitespace', () => {
    expect(sanitizeFilenameComponent('  spaced  ')).toBe('spaced')
  })
})

describe('buildClipBaseName', () => {
  it('builds "NN - Name" with no tags', () => {
    expect(buildClipBaseName(1, 'First half', [])).toBe('01 - First half')
  })

  it('appends "[tag1, tag2]" when the clip has tags', () => {
    expect(buildClipBaseName(2, 'Power play', ['Offense', 'PP'])).toBe('02 - Power play [Offense, PP]')
  })

  it('sanitizes both the name and the tags for the filesystem', () => {
    expect(buildClipBaseName(1, 'Bad:Name', ['Ta/g'])).toBe('01 - BadName [Tag]')
  })

  it('falls back to "Clip" for a name that sanitizes to nothing', () => {
    expect(buildClipBaseName(1, '***', [])).toBe('01 - Clip')
  })

  it('drops a tag that sanitizes to nothing', () => {
    expect(buildClipBaseName(1, 'Name', ['***', 'Good'])).toBe('01 - Name [Good]')
  })

  it('caps the total base name length at 120 chars', () => {
    const longName = 'x'.repeat(100)
    const base = buildClipBaseName(1, longName, ['tag1', 'tag2'])
    expect(base.length).toBeLessThanOrEqual(120)
  })
})
