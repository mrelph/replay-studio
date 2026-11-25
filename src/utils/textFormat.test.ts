import { describe, it, expect } from 'vitest'
import type { fabric } from 'fabric'
import {
  applyTextFormat, isTextObject, readTextFormat, stepFontSize, textFormatProps, FONT_SIZES,
} from './textFormat'

/** Minimal stand-in for fabric.IText: `set` merges props, like fabric does. */
function fakeText(props: Record<string, unknown> = {}): fabric.IText {
  const obj: Record<string, unknown> = {
    type: 'i-text',
    fontSize: 24,
    scaleX: 1,
    scaleY: 1,
    ...props,
    set(values: Record<string, unknown>) {
      Object.assign(obj, values)
      return obj
    },
    setCoords() {},
  }
  return obj as unknown as fabric.IText
}

describe('stepFontSize', () => {
  it('moves to the neighbouring preset', () => {
    expect(stepFontSize(24, 1)).toBe(32)
    expect(stepFontSize(24, -1)).toBe(20)
  })

  it('snaps an off-preset size to the next preset in that direction', () => {
    expect(stepFontSize(30, 1)).toBe(32)
    expect(stepFontSize(30, -1)).toBe(24)
  })

  it('clamps at both ends', () => {
    expect(stepFontSize(FONT_SIZES[0], -1)).toBe(FONT_SIZES[0])
    expect(stepFontSize(500, 1)).toBe(FONT_SIZES[FONT_SIZES.length - 1])
  })
})

describe('isTextObject', () => {
  it('accepts text types only', () => {
    expect(isTextObject(fakeText())).toBe(true)
    expect(isTextObject({ type: 'rect' } as fabric.Object)).toBe(false)
    expect(isTextObject(null)).toBe(false)
  })
})

describe('textFormatProps', () => {
  it('maps flags to fabric options', () => {
    expect(textFormatProps({
      fontSize: 48, bold: true, italic: true, underline: true, fontFamily: 'Oswald Variable', plate: true,
    })).toEqual({
      fontSize: 48, fontWeight: 'bold', fontStyle: 'italic', underline: true,
      fontFamily: 'Oswald Variable', textPlate: true,
    })
    expect(textFormatProps({
      fontSize: 16, bold: false, italic: false, underline: false, fontFamily: 'Arial', plate: false,
    })).toEqual({
      fontSize: 16, fontWeight: 'normal', fontStyle: 'normal', underline: false,
      fontFamily: 'Arial', textPlate: false,
    })
  })
})

describe('readTextFormat', () => {
  it('folds handle scaling into the size', () => {
    expect(readTextFormat(fakeText({ fontSize: 24, scaleY: 2 })).fontSize).toBe(48)
  })

  it('reads bold, italic and underline', () => {
    const format = readTextFormat(fakeText({ fontWeight: 'bold', fontStyle: 'italic', underline: true }))
    expect(format).toMatchObject({ bold: true, italic: true, underline: true })
    expect(readTextFormat(fakeText({ fontWeight: 700 })).bold).toBe(true)
    expect(readTextFormat(fakeText())).toMatchObject({ bold: false, italic: false, underline: false })
  })
})

describe('applyTextFormat', () => {
  it('sets an exact size and clears handle scaling', () => {
    const text = fakeText({ fontSize: 24, scaleX: 2, scaleY: 2 })
    applyTextFormat(text, { fontSize: 64 })
    expect(text.fontSize).toBe(64)
    expect(text.scaleX).toBe(1)
    expect(text.scaleY).toBe(1)
    expect(readTextFormat(text).fontSize).toBe(64)
  })

  it('changes only the fields given', () => {
    const text = fakeText({ fontWeight: 'bold', scaleY: 2 })
    applyTextFormat(text, { italic: true })
    expect(readTextFormat(text)).toEqual({
      fontSize: 48, bold: true, italic: true, underline: false, fontFamily: 'Arial', plate: false,
    })
  })

  it('sets the font and the backing plate', () => {
    const text = fakeText()
    applyTextFormat(text, { fontFamily: 'Oswald Variable', plate: true })
    expect(readTextFormat(text)).toMatchObject({ fontFamily: 'Oswald Variable', plate: true })
    applyTextFormat(text, { plate: false })
    expect(readTextFormat(text).plate).toBe(false)
  })
})
