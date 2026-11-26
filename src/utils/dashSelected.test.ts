import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { fabric } from '@/lib/fabric'
import { applyDash } from './lineDash'
import { dashSelected } from './dashSelected'
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

describe('dashSelected switching mid-reveal', () => {
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
