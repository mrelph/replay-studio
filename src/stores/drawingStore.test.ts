import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { fabric } from '@/lib/fabric'
import { useDrawingStore, type Annotation } from './drawingStore'

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

describe('drawingStore undo', () => {

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

  it('keeps revealDelay and freezeAuto across undo', () => {
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
      revealDelay: 0.35,
      freezeAuto: true,
    } as never)
    useDrawingStore.getState().saveState()
    useDrawingStore.setState((state) => ({
      annotations: state.annotations.map((a) => ({ ...a, revealDelay: 0.9, freezeAuto: false })),
    }))
    useDrawingStore.getState().undo()
    expect(useDrawingStore.getState().annotations[0].revealDelay).toBe(0.35)
    expect(useDrawingStore.getState().annotations[0].freezeAuto).toBe(true)
  })
})

describe('drawingStore frame sync', () => {
  const store = () => useDrawingStore.getState()
  const byId = (id: string) => store().annotations.find((a) => a.id === id) as Annotation
  const freezes = () => store().annotations.filter((a) => a.toolType === 'freeze')
  const drawing = (id: string, startTime: number, drawIn?: number) =>
    ({
      id,
      object: new fabric.Line([0, 0, 40, 20], { stroke: '#f00', strokeWidth: 4 }),
      startTime,
      endTime: startTime + 2,
      layer: 1,
      toolType: 'arrow',
      drawIn,
    }) as Annotation
  const reset = () => {
    const canvas = new fabric.Canvas(document.createElement('canvas'), { width: 100, height: 100 })
    useDrawingStore.setState({ canvas, annotations: [], undoStack: [], redoStack: [], isRestoring: false, selectedAnnotationId: null })
  }
  const draw = (a: Annotation) => {
    store().addAnnotation(a)
    store().syncFrames([a.startTime], { createFreeze: true })
  }

  beforeEach(reset)

  it('creates an automatic freeze on a drawn frame and grows it with each drawing', () => {
    draw(drawing('a', 3, 0.35))
    expect(freezes()).toHaveLength(1)
    expect(freezes()[0].startTime).toBe(3)
    expect(freezes()[0].freezeAuto).toBe(true)
    expect(freezes()[0].freezeDuration).toBeCloseTo(1.4)
    expect(byId('a').revealDelay).toBe(0)

    draw(drawing('b', 3, 0.4))
    expect(freezes()).toHaveLength(1)
    expect(byId('b').revealDelay).toBeCloseTo(0.35)
    expect(freezes()[0].freezeDuration).toBeCloseTo(1.8)
  })

  it('re-sequences on delete and removes the automatic marker with the last drawing', () => {
    draw(drawing('a', 3, 0.35))
    draw(drawing('b', 3, 0.4))
    store().removeAnnotations(['a'])
    expect(byId('b').revealDelay).toBe(0)
    expect(freezes()[0].freezeDuration).toBeCloseTo(1.4)
    store().removeAnnotations(['b'])
    expect(store().annotations).toHaveLength(0)
  })

  it('never recalculates a hand-set hold, but still assigns delays', () => {
    draw(drawing('a', 3, 0.35))
    store().updateAnnotation(freezes()[0].id, { freezeAuto: false, freezeDuration: 5 })
    draw(drawing('b', 3, 0.4))
    expect(freezes()).toHaveLength(1)
    expect(freezes()[0].freezeDuration).toBe(5)
    expect(byId('b').revealDelay).toBeCloseTo(0.35)
  })

  it('keeps a freeze of 0 and adds no second marker', () => {
    draw(drawing('a', 3, 0.35))
    store().updateAnnotation(freezes()[0].id, { freezeAuto: false, freezeDuration: 0 })
    draw(drawing('b', 3, 0.4))
    expect(freezes()).toHaveLength(1)
    expect(freezes()[0].freezeDuration).toBe(0)
  })

  it('resizes an automatic hold when a drawIn changes', () => {
    draw(drawing('a', 3, 0.35))
    draw(drawing('b', 3, 0.4))
    store().updateAnnotation('a', { drawIn: 1 })
    expect(byId('b').revealDelay).toBeCloseTo(1)
    expect(freezes()[0].freezeDuration).toBeCloseTo(2.4)
  })

  it('re-sequences both frames when a drawing moves, without creating a freeze', () => {
    draw(drawing('a', 3, 0.35))
    draw(drawing('b', 3, 0.4))
    store().updateAnnotation('b', { startTime: 9 })
    expect(freezes()).toHaveLength(1)
    expect(freezes()[0].startTime).toBe(3)
    expect(freezes()[0].freezeDuration).toBeCloseTo(1.4)
    expect(byId('b').revealDelay ?? 0).toBe(0)
    expect(freezes().some((f) => f.startTime === 9)).toBe(false)
  })

  it('keeps an automatic freeze while its only drawing is dragged away and back', () => {
    draw(drawing('a', 3, 0.35))
    store().updateAnnotation('a', { startTime: 9 })
    expect(freezes()).toHaveLength(1)
    store().updateAnnotation('a', { startTime: 3 })
    expect(freezes()).toHaveLength(1)
    expect(freezes()[0].freezeAuto).toBe(true)
    expect(freezes()[0].freezeDuration).toBeCloseTo(1.4)
    expect(byId('a').revealDelay).toBe(0)
  })

  it('prunes an emptied automatic freeze on an explicit sync', () => {
    draw(drawing('a', 3, 0.35))
    store().updateAnnotation('a', { startTime: 9 })
    expect(freezes()[0].freezeDuration).toBeCloseTo(1.4)
    expect(freezes()[0].freezeAuto).toBe(true)
    store().syncFrames([3])
    expect(freezes()).toHaveLength(0)
  })

  it('makes the drawing and its freeze one undo step', () => {
    draw(drawing('a', 3, 0.35))
    expect(store().undoStack).toHaveLength(1)
    store().undo()
    expect(store().annotations).toHaveLength(0)
    store().redo()
    expect(store().annotations).toHaveLength(2)
    expect(freezes()[0].freezeAuto).toBe(true)
  })

  it('adds no freezes or delays when annotations are only added (project load)', () => {
    store().addAnnotation(drawing('a', 3, 0.35))
    store().addAnnotation(drawing('b', 3, 0.4))
    store().addAnnotation(drawing('c', 3))
    expect(freezes()).toHaveLength(0)
    expect(store().annotations.every((a) => a.revealDelay === undefined)).toBe(true)
  })

  it('discards an empty text drawn on a new frame without a trace', () => {
    draw(drawing('a', 1, 0.35))
    const undoBefore = store().undoStack.length
    const text = { ...drawing('t', 3), toolType: 'text' }
    draw(text)
    expect(freezes()).toHaveLength(2)
    store().discardNewAnnotation('t')
    expect(store().annotations.map((a) => a.id)).toEqual(['a', freezes()[0].id])
    expect(freezes().map((f) => f.startTime)).toEqual([1])
    expect(store().undoStack).toHaveLength(undoBefore)
  })

  it('discards an empty text as the only annotation, leaving nothing to undo', () => {
    draw({ ...drawing('t', 3), toolType: 'text' })
    store().discardNewAnnotation('t')
    expect(store().annotations).toHaveLength(0)
    expect(store().undoStack).toHaveLength(0)
  })

  it('addAnnotation with history false saves no undo state', () => {
    store().addAnnotation(drawing('a', 3), { history: false })
    expect(store().undoStack).toHaveLength(0)
  })
})
