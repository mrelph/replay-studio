import { describe, it, expect } from 'vitest'
import { wrapLabel } from './wrapLabel'

const measure = (s: string) => s.length

describe('wrapLabel', () => {
  it('leaves a label that fits unchanged', () => {
    expect(wrapLabel('short', 10, measure)).toBe('short')
  })

  it('breaks between words at the last space that fits', () => {
    expect(wrapLabel('one two three four', 10, measure)).toBe('one two\nthree four')
  })

  it('keeps typed line breaks', () => {
    expect(wrapLabel('a\nb', 10, measure)).toBe('a\nb')
  })

  it('does not break a word longer than the width', () => {
    expect(wrapLabel('supercalifragilistic word', 10, measure)).toBe('supercalifragilistic\nword')
  })

  it('collapses spaces only at a break; a line that fits keeps its spacing', () => {
    expect(wrapLabel('ab   cd    efghijkl', 10, measure)).toBe('ab   cd\nefghijkl')
    expect(wrapLabel('a   b', 10, measure)).toBe('a   b')
  })

  it('wraps each typed line on its own', () => {
    expect(wrapLabel('one two three\nfour', 10, measure)).toBe('one two\nthree\nfour')
  })

  it('returns an empty string for an empty label', () => {
    expect(wrapLabel('', 10, measure)).toBe('')
  })
})
