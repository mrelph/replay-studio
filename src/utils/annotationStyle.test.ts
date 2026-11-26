import { describe, it, expect } from 'vitest'
import { fabric } from '@/lib/fabric'
import { shadowForStyle, restyleObject, arrowHeadSize } from './annotationStyle'
import { useToolStore } from '@/stores/toolStore'
import { buildRing } from '@/components/Canvas/tools/ringTool'
import { surfaceParts } from './surfaceShape'
import { buildCallout } from '@/components/Canvas/tools/calloutTool'
import { calloutParts } from './calloutGeometry'

// jsdom has no 2D canvas; IText measures text on construction, so stub a permissive context.
const mockContext = new Proxy({} as Record<string, unknown>, {
  get(target, prop: string) {
    if (prop in target) return target[prop]
    if (prop === 'measureText') return (text: string) => ({ width: (text?.length || 0) * 8 })
    if (prop === 'canvas') return { width: 0, height: 0 }
    if (prop === 'getContextAttributes') return () => ({})
    return () => undefined
  },
  set(target, prop: string, value) {
    target[prop] = value
    return true
  },
})
HTMLCanvasElement.prototype.getContext = (() => mockContext) as unknown as HTMLCanvasElement['getContext']

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
  it('shadows only the outline of a ring, and both parts of an arrow', () => {
    const ring = buildRing({ center: { x: 0, y: 0 }, rx: 40, ry: 16, color: '#f00', strokeWidth: 4, style: 'clean' })
    const { fill, outline } = surfaceParts(ring)!
    fill.set({ shadow: new fabric.Shadow({ blur: 3 }) })
    restyleObject(ring, 'ring', 'outline')
    expect(fill.shadow).toBeFalsy()
    expect((outline.shadow as fabric.Shadow).blur).toBe(3)
    restyleObject(ring, 'ring', 'glow')
    expect(outline.shadow).toMatchObject({ color: '#f00', blur: 12 })
    const arrow = new fabric.Group([new fabric.Line([0, 0, 10, 0], { stroke: '#f00' }), new fabric.Triangle({ fill: '#f00' })])
    restyleObject(arrow, 'arrow', 'outline')
    expect(arrow.getObjects().every((o) => (o.shadow as fabric.Shadow)?.blur === 3)).toBe(true)
  })
  it('shadows the dot and leader of a callout, never the plated label', () => {
    const label = new fabric.IText('Pass', { left: 100, top: 0, fill: '#f00' })
    const callout = buildCallout({ target: { x: 0, y: 100 }, label, color: '#f00', strokeWidth: 4, style: 'clean' })
    const parts = calloutParts(callout)!
    restyleObject(callout, 'callout', 'outline')
    expect((parts.dot.shadow as fabric.Shadow).blur).toBe(3)
    expect((parts.leader.shadow as fabric.Shadow).blur).toBe(3)
    expect(parts.label.shadow).toBeFalsy()
    expect((parts.label as fabric.IText & { textPlate?: boolean }).textPlate).toBe(true)
  })
  it('leaves spotlight alone', () => {
    const e = new fabric.Ellipse({ rx: 5, ry: 5, shadow: new fabric.Shadow({ blur: 25 }) })
    restyleObject(e, 'spotlight', 'clean')
    expect((e.shadow as fabric.Shadow).blur).toBe(25)
  })
  it('toolStore defaults to outline', () => expect(useToolStore.getState().annotationStyle).toBe('outline'))
  it.each([[2, 25, 12], [4, 25, 12], [8, 32, 16], [16, 64, 32]])('stroke %i → head %i x %i', (w, length, width) =>
    expect(arrowHeadSize(w)).toEqual({ length, width }))
})
