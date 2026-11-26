import { describe, it, expect } from 'vitest'
import { fabric } from '@/lib/fabric'
import { applyReveal, stripReveal, strokeLength, revealKind } from './reveal'
import { buildRing } from '@/components/Canvas/tools/ringTool'
import { surfaceParts } from '@/utils/surfaceShape'

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

describe('reveal', () => {
  it('maps tool types to reveal kinds', () => {
    expect(revealKind('pen')).toBe('stroke')
    expect(revealKind('arc-arrow')).toBe('arrow')
    expect(revealKind('text')).toBe('none')
    expect(revealKind('ring')).toBe('ring')
    expect(revealKind('zone')).toBe('none')
    expect(revealKind('callout')).toBe('callout')
  })

  it('half-reveals a line', () => {
    const line = new fabric.Line([0, 0, 100, 0], { stroke: '#f00', strokeWidth: 4 })
    applyReveal(line, 'line', 0.5)
    expect(line.strokeDashArray).toEqual([100, 100])
    expect(line.strokeDashOffset).toBeCloseTo(50)
  })

  it('restores the original state at 1', () => {
    const line = new fabric.Line([0, 0, 100, 0], { stroke: '#f00' })
    const before = JSON.stringify(line.toObject())
    applyReveal(line, 'line', 0.3)
    applyReveal(line, 'line', 1)
    expect(JSON.stringify(line.toObject())).toBe(before)
  })

  it('stripReveal undoes a mid-reveal state', () => {
    const rect = new fabric.Rect({ width: 50, height: 30, stroke: '#f00', fill: 'transparent' })
    const before = JSON.stringify(rect.toObject())
    applyReveal(rect, 'rectangle', 0.4)
    stripReveal(rect)
    expect(JSON.stringify(rect.toObject())).toBe(before)
  })

  it('stripReveal undoes a mid-reveal arrow', () => {
    const shaft = new fabric.Line([0, 0, 100, 0], { stroke: '#f00' })
    const head = new fabric.Triangle({ width: 24, height: 25 })
    const arrow = new fabric.Group([shaft, head])
    const before = JSON.stringify(arrow.toObject())
    applyReveal(arrow, 'arrow', 0.9)
    stripReveal(arrow)
    expect(JSON.stringify(arrow.toObject())).toBe(before)
  })

  it('uses local length on a scaled shape', () => {
    const line = new fabric.Line([0, 0, 100, 0], { stroke: '#f00', scaleX: 3 })
    applyReveal(line, 'line', 0.5)
    expect(line.strokeDashArray).toEqual([100, 100])
  })

  it('holds the arrowhead back until 0.85', () => {
    const shaft = new fabric.Line([0, 0, 100, 0], { stroke: '#f00' })
    const head = new fabric.Triangle({ width: 24, height: 25 })
    const arrow = new fabric.Group([shaft, head])
    applyReveal(arrow, 'arrow', 0.5)
    expect(head.visible).toBe(false)
    applyReveal(arrow, 'arrow', 0.925)
    expect(head.visible).toBe(true)
    expect(head.scaleX).toBeCloseTo(0.5)
    applyReveal(arrow, 'arrow', 1)
    expect(head.scaleX).toBe(1)
    expect(shaft.strokeDashArray ?? null).toBeNull()
  })

  it('ignores text and spotlight', () => {
    const text = new fabric.IText('hi')
    const before = JSON.stringify(text.toObject())
    applyReveal(text, 'text', 0.2)
    expect(JSON.stringify(text.toObject())).toBe(before)
  })

  it('measures a path by its segments', () => {
    const path = new fabric.Path('M 0 0 L 30 0 L 30 40')
    expect(strokeLength(path)).toBeCloseTo(70)
  })

  it('strokeLength of rect and ellipse', () => {
    expect(strokeLength(new fabric.Rect({ width: 50, height: 30 }))).toBe(160)
    expect(strokeLength(new fabric.Ellipse({ rx: 10, ry: 10 }))).toBeCloseTo(2 * Math.PI * 10, 1)
  })

  it('strokeLength of a legacy circle', () => {
    expect(strokeLength(new fabric.Circle({ radius: 10 }))).toBeCloseTo(2 * Math.PI * 10, 5)
  })
  describe('ring', () => {
    const ring = () => buildRing({ center: { x: 100, y: 100 }, rx: 50, ry: 20, color: '#ffcc00', strokeWidth: 4, style: 'outline' })

    it('draws the outline first, then fades the fill in', () => {
      const group = ring()
      const { fill, outline } = surfaceParts(group)!
      applyReveal(group, 'ring', 0.5)
      expect(outline.strokeDashArray).toHaveLength(2)
      expect(fill.opacity).toBe(0)
      applyReveal(group, 'ring', 0.925)
      expect(fill.opacity).toBeCloseTo(0.5)
      applyReveal(group, 'ring', 1)
      expect(fill.opacity).toBe(1)
      expect(outline.strokeDashArray).toBeFalsy()
    })

    it('stripReveal restores a mid-reveal ring', () => {
      const group = ring()
      const before = JSON.stringify(group.toObject())
      applyReveal(group, 'ring', 0.9)
      stripReveal(group)
      expect(JSON.stringify(group.toObject())).toBe(before)
    })

    it('never scales or hides the outline as if it were an arrowhead', () => {
      const group = ring()
      const { outline } = surfaceParts(group)!
      for (const fraction of [0, 0.3, 0.5, 0.9, 1]) {
        applyReveal(group, 'ring', fraction)
        expect(outline.visible).toBe(true)
        expect(outline.scaleX).toBe(1)
        expect(outline.scaleY).toBe(1)
      }
      applyReveal(group, 'ring', 0.5)
      stripReveal(group)
      expect(outline.visible).toBe(true)
      expect(outline.scaleX).toBe(1)
    })

    it('an arrow still takes the arrow path', () => {
      const shaft = new fabric.Line([0, 0, 100, 0], { stroke: '#f00', strokeWidth: 4 })
      const head = new fabric.Triangle({ width: 20, height: 25 })
      const arrow = new fabric.Group([shaft, head])
      applyReveal(arrow, 'arrow', 0.5)
      expect(head.visible).toBe(false)
      expect(shaft.strokeDashArray).toHaveLength(2)
    })

    it('a zone-shaped group gets no reveal', () => {
      const group = ring()
      const { fill, outline } = surfaceParts(group)!
      applyReveal(group, 'zone', 0.5)
      expect(outline.strokeDashArray).toBeFalsy()
      expect(fill.opacity).toBe(1)
      expect(outline.visible).toBe(true)
    })
  })
})
