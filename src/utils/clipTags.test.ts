import { describe, it, expect } from 'vitest'
import { normalizeTag, normalizeTags, clampNotes, hashTagColorClass, MAX_TAG_LENGTH, MAX_TAGS_PER_CLIP } from './clipTags'

describe('normalizeTag', () => {
  it('trims and collapses internal whitespace', () => {
    expect(normalizeTag('  Offense   Set  ')).toBe('Offense Set')
  })

  it('caps at MAX_TAG_LENGTH', () => {
    expect(normalizeTag('a'.repeat(40))).toBe('a'.repeat(MAX_TAG_LENGTH))
  })

  it('returns an empty string for whitespace-only input', () => {
    expect(normalizeTag('   ')).toBe('')
  })
})

describe('normalizeTags', () => {
  it('drops entries that normalize to nothing', () => {
    expect(normalizeTags(['Offense', '   ', 'PP'])).toEqual(['Offense', 'PP'])
  })

  it('dedupes case-insensitively, keeping the first casing seen', () => {
    expect(normalizeTags(['Offense', 'offense', 'OFFENSE'])).toEqual(['Offense'])
  })

  it('caps at MAX_TAGS_PER_CLIP', () => {
    const many = Array.from({ length: 20 }, (_, i) => `tag${i}`)
    expect(normalizeTags(many)).toHaveLength(MAX_TAGS_PER_CLIP)
  })
})

describe('clampNotes', () => {
  it('leaves short notes unchanged', () => {
    expect(clampNotes('short')).toBe('short')
  })

  it('caps at 2000 chars', () => {
    expect(clampNotes('a'.repeat(2500))).toHaveLength(2000)
  })
})

describe('hashTagColorClass', () => {
  it('is stable for the same tag', () => {
    expect(hashTagColorClass('Offense')).toBe(hashTagColorClass('Offense'))
  })

  it('is case-insensitive', () => {
    expect(hashTagColorClass('Offense')).toBe(hashTagColorClass('offense'))
  })

  it('returns a non-empty class string', () => {
    expect(hashTagColorClass('PP').length).toBeGreaterThan(0)
  })
})
