import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { fabric } from '@/lib/fabric'
import { useDrawingStore } from './drawingStore'

describe('drawingStore undo', () => {
  const originalGetContext = HTMLCanvasElement.prototype.getContext

  beforeAll(() => {
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
  })
  afterAll(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext
  })

  it('keeps drawIn across undo', () => {
    const canvas = new fabric.Canvas(document.createElement('canvas'), { width: 100, height: 100 })
    useDrawingStore.setState({ canvas, annotations: [], undoStack: [], redoStack: [], isRestoring: false })
    const object = new fabric.Line([0, 0, 40, 20], { stroke: '#f00', strokeWidth: 4 })
    useDrawingStore.getState().addAnnotation({
      id: 'a',
      object,
      startTime: 0,
      endTime: 2,
      layer: useDrawingStore.getState().activeLayerId,
      toolType: 'line',
      drawIn: 0.35,
    } as never)
    useDrawingStore.getState().saveState()
    useDrawingStore.setState((state) => ({ annotations: state.annotations.map((a) => ({ ...a, drawIn: 0.9 })) }))
    useDrawingStore.getState().undo()
    expect(useDrawingStore.getState().annotations[0].drawIn).toBe(0.35)
  })
})
