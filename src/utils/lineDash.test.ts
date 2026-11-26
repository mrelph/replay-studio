import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { fabric } from '@/lib/fabric'
import { applyDash, dashPattern, dashSelected, revealDashArray, strokeTarget } from './lineDash'
import { applyReveal, stripReveal } from '@/export/reveal'

const originalGetContext = HTMLCanvasElement.prototype.getContext
beforeAll(() => {
  const mockContext = new Proxy({} as Record<string, unknown>, {
    get(target, prop: string) {
      if (prop in target) return target[prop]
      if (prop === 'canvas') return { width: 0, height: 0, getAttribute: () => null, setAttribute: () => undefined }
      if (prop === 'getContextAttributes') return () => ({})
      return () => undefined
    },
    set(target, prop: string, value) {
      target[prop] = value
      return true
    },
  })
  HTMLCanvasElement.prototype.getContext = (() => mockContext) as unknown as HTMLCanvasElement['getContext']
})
afterAll(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext
})

const canvases: Array<InstanceType<typeof fabric.Canvas>> = []
afterEach(() => {
  canvases.splice(0).forEach((canvas) => canvas.dispose())
})

function arrow() {
  const shaft = new fabric.Line([0, 0, 100, 0], { stroke: '#f00', strokeWidth: 4, strokeLineCap: 'round' })
  const head = new fabric.Triangle({ width: 24, height: 25, fill: '#f00' })
  return { group: new fabric.Group([shaft, head]), shaft, head }
}

describe('lineDash', () => {
  it('derives the pattern from the stroke width', () => {
    expect(dashPattern(4)).toEqual([12, 8])
  })

  it('builds a reveal dash array that shows the pattern up to the revealed length', () => {
    expect(revealDashArray([6, 4], 100, 0)).toEqual([0, 100])
    const half = revealDashArray([6, 4], 100, 0.5)
    expect(half.length % 2).toBe(0)
    expect(half.slice(0, 9)).toEqual([6, 4, 6, 4, 6, 4, 6, 4, 6])
    expect(half[half.length - 1]).toBeGreaterThanOrEqual(100)
    const part = revealDashArray([6, 4], 100, 0.53)
    expect(part.slice(10, 11)).toEqual([3])
    expect(part[part.length - 1]).toBeGreaterThanOrEqual(100)
    const shown = (a: number[]) => a.filter((_, i) => i % 2 === 0).reduce((x, y) => x + y, 0)
    expect(shown(half)).toBe(30)
    expect(shown(part)).toBe(33)
  })

  it('dashes a line with butt caps and a uniform stroke, and clears back to the round cap', () => {
    const line = new fabric.Line([0, 0, 100, 0], { stroke: '#f00', strokeWidth: 4, strokeLineCap: 'round' })
    applyDash(line, 'line', true)
    expect(line.strokeDashArray).toEqual([12, 8])
    expect(line.strokeLineCap).toBe('butt')
    expect(line.strokeUniform).toBe(true)
    applyDash(line, 'line', false)
    expect(line.strokeDashArray).toBeFalsy()
    expect(line.strokeLineCap).toBe('round')
    expect(line.strokeUniform).toBe(false)
  })

  it('dashes only the shaft of an arrow', () => {
    const { group, shaft, head } = arrow()
    expect(strokeTarget(group, 'arrow')).toBe(shaft)
    applyDash(group, 'arrow', true)
    expect(shaft.strokeDashArray).toEqual([12, 8])
    expect(head.strokeDashArray).toBeFalsy()
    expect(group.strokeDashArray).toBeFalsy()
  })

  it('ignores tools that cannot be dashed', () => {
    const rect = new fabric.Rect({ width: 50, height: 30, stroke: '#f00' })
    applyDash(rect, 'rectangle', true)
    expect(rect.strokeDashArray).toBeFalsy()
  })

  it('keeps a dashed arrow dashed through an undo snapshot round trip', async () => {
    const canvas = new fabric.Canvas(document.createElement('canvas'), { width: 200, height: 200 })
    canvases.push(canvas)
    const { group } = arrow()
    applyDash(group, 'arrow', true)
    canvas.add(group)
    const json = JSON.stringify(canvas.toJSON())
    canvas.clear()
    await new Promise<void>((resolve) => canvas.loadFromJSON(JSON.parse(json), () => resolve()))
    const [restored] = canvas.getObjects() as fabric.Group[]
    const [shaft, head] = restored.getObjects()
    expect(shaft.strokeDashArray).toEqual([12, 8])
    expect(shaft.strokeLineCap).toBe('butt')
    expect(shaft.strokeUniform).toBe(true)
    expect(head.strokeDashArray).toBeFalsy()
  })
  describe('switching mid-reveal', () => {
    function switchSelected(line: fabric.Line, lineDash: 'solid' | 'dashed') {
      const canvas = new fabric.Canvas(document.createElement('canvas'), { width: 200, height: 200 })
      canvases.push(canvas)
      canvas.add(line)
      canvas.setActiveObject(line)
      dashSelected({ canvas, annotations: [{ id: 'l', object: line, toolType: 'line' }], saveState: () => {}, updateAnnotation: () => {} }, lineDash)
    }

    it('keeps the dashes on a solid line switched to dashed while it draws on', () => {
      const line = new fabric.Line([0, 0, 100, 0], { stroke: '#f00', strokeWidth: 4, strokeLineCap: 'round' })
      applyReveal(line, 'line', 0.4)
      switchSelected(line, 'dashed')
      stripReveal(line)
      expect(line.strokeDashArray).toEqual([12, 8])
      expect(line.strokeLineCap).toBe('butt')
    })

    it('keeps a dashed line solid once switched while it draws on', () => {
      const line = new fabric.Line([0, 0, 100, 0], { stroke: '#f00', strokeWidth: 4, strokeLineCap: 'round' })
      applyDash(line, 'line', true)
      applyReveal(line, 'line', 0.4, { dashed: true })
      switchSelected(line, 'solid')
      stripReveal(line)
      expect(line.strokeDashArray).toBeFalsy()
      expect(line.strokeLineCap).toBe('round')
    })
  })
})
