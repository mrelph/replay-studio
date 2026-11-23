import { describe, it, expect } from 'vitest'
import { fabric } from '@/lib/fabric'
import { applyReveal, stripReveal, strokeLength, revealKind } from './reveal'

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
})
