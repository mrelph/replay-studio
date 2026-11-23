import { describe, it, expect } from 'vitest'
import { fabric } from '@/lib/fabric'
import { shadowForStyle, restyleObject } from './annotationStyle'
import { useToolStore } from '@/stores/toolStore'

describe('annotationStyle', () => {
  it('outline is a tight dark edge', () => {
    const s = shadowForStyle('outline', '#FFCC00')!
    expect(s.color).toBe('rgba(0,0,0,0.85)')
    expect(s.blur).toBe(3)
    expect(s.offsetX).toBe(0)
  })
  it('glow keeps the shape colour and blur', () => {
    expect(shadowForStyle('glow', '#FFCC00')!.blur).toBe(10)
    expect(shadowForStyle('glow', '#FFCC00', 15)).toMatchObject({ color: '#FFCC00', blur: 15 })
  })
  it('clean has no shadow', () => expect(shadowForStyle('clean', '#fff')).toBeUndefined())
  it('restyles a line and both parts of an arrow', () => {
    const line = new fabric.Line([0, 0, 10, 0], { stroke: '#f00' })
    restyleObject(line, 'line', 'outline')
    expect((line.shadow as fabric.Shadow).blur).toBe(3)
    const arrow = new fabric.Group([new fabric.Line([0, 0, 10, 0], { stroke: '#f00' }), new fabric.Triangle({ fill: '#f00' })])
    restyleObject(arrow, 'arrow', 'clean')
    expect(arrow.getObjects().every((o) => !o.shadow)).toBe(true)
  })
  it('leaves spotlight alone', () => {
    const e = new fabric.Ellipse({ rx: 5, ry: 5, shadow: new fabric.Shadow({ blur: 25 }) })
    restyleObject(e, 'spotlight', 'clean')
    expect((e.shadow as fabric.Shadow).blur).toBe(25)
  })
  it('toolStore defaults to outline', () => expect(useToolStore.getState().annotationStyle).toBe('outline'))
})
