import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest'
import { fabric } from '@/lib/fabric'
import { useVideoStore } from './videoStore'
import { useDrawingStore } from './drawingStore'
import { useSpeedStore } from './speedStore'

const canvases: Array<InstanceType<typeof fabric.Canvas>> = []
const originalGetContext = HTMLCanvasElement.prototype.getContext

beforeAll(() => {
  const mockContext = new Proxy({} as Record<string, unknown>, {
    get(target, prop: string) {
      if (prop in target) return target[prop]
      if (prop === 'measureText') return (text: string) => ({ width: (text?.length || 0) * 8 })
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

const r = (id: string, start: number, end: number, speed = 0.5) => ({ id, start, end, speed })
const regions = () => useSpeedStore.getState().regions
const undo = () => useDrawingStore.getState().undo()
const redo = () => useDrawingStore.getState().redo()
const undoDepth = () => useDrawingStore.getState().undoStack.length

function addDrawing(id: string) {
  useDrawingStore.getState().addAnnotation({
    id,
    object: new fabric.Line([0, 0, 40, 20], { stroke: '#f00', strokeWidth: 4 }),
    startTime: 0,
    endTime: 2,
    layer: useDrawingStore.getState().activeLayerId,
    toolType: 'line',
  } as never)
}

beforeEach(() => {
  const canvas = new fabric.Canvas(document.createElement('canvas'), { width: 100, height: 100 })
  canvases.push(canvas)
  useVideoStore.setState({ duration: 20, fps: 30 })
  useDrawingStore.setState({ canvas, annotations: [], undoStack: [], redoStack: [], isRestoring: false })
  useSpeedStore.getState().replaceAll([])
})

afterEach(() => {
  canvases.splice(0).forEach((canvas) => canvas.dispose())
})

describe('undo and redo cover speed regions', () => {
  it('undoes and redoes a placed region', () => {
    useSpeedStore.getState().place(r('a', 2, 4))
    expect(regions()).toHaveLength(1)
    undo()
    expect(regions()).toEqual([])
    redo()
    expect(regions().map((x) => x.id)).toEqual(['a'])
  })

  it('undoes setSpeed and remove', () => {
    useSpeedStore.getState().place(r('a', 2, 4, 0.5))
    useSpeedStore.getState().setSpeed('a', 0.25)
    undo()
    expect(regions()[0].speed).toBe(0.5)
    useSpeedStore.getState().remove('a')
    expect(regions()).toEqual([])
    undo()
    expect(regions().map((x) => x.id)).toEqual(['a'])
  })

  it('keeps drawings and regions in one history, region first', () => {
    addDrawing('d')
    useSpeedStore.getState().place(r('a', 2, 4))
    undo()
    expect(regions()).toEqual([])
    expect(useDrawingStore.getState().annotations).toHaveLength(1)
    undo()
    expect(useDrawingStore.getState().annotations).toHaveLength(0)
  })

  it('undoes a drawing added after a region and leaves the region', () => {
    useSpeedStore.getState().place(r('a', 2, 4))
    addDrawing('d')
    undo()
    expect(useDrawingStore.getState().annotations).toHaveLength(0)
    expect(regions().map((x) => x.id)).toEqual(['a'])
  })

  it('does not push history for no-op changes', () => {
    useSpeedStore.getState().place(r('a', 2, 4, 0.5))
    const depth = undoDepth()
    useSpeedStore.getState().setSpeed('a', 0.5)
    useSpeedStore.getState().place(r('a', 2, 4, 0.5))
    expect(undoDepth()).toBe(depth)
  })

  it('replaceAll does not push history', () => {
    useSpeedStore.getState().replaceAll([r('a', 2, 4)])
    expect(undoDepth()).toBe(0)
  })

  it('clears a selection whose region no longer exists after undo', () => {
    useSpeedStore.getState().place(r('a', 2, 4))
    useSpeedStore.getState().select('a')
    undo()
    expect(useSpeedStore.getState().selectedId).toBeNull()
  })

  it('clearHistory leaves nothing to undo and keeps regions', () => {
    addDrawing('d')
    useSpeedStore.getState().place(r('a', 2, 4))
    useDrawingStore.getState().clearHistory()
    undo()
    redo()
    expect(regions().map((x) => x.id)).toEqual(['a'])
    expect(useDrawingStore.getState().annotations).toHaveLength(1)
  })

  it('undoing a drawing leaves loaded regions eligible for the late fps re-snap', () => {
    useVideoStore.setState({ duration: 0 })
    useSpeedStore.getState().replaceAll([r('a', 2.01, 4.02)])
    addDrawing('d')
    undo()
    useVideoStore.setState({ duration: 20, fps: 59.94 })
    const [a] = regions()
    expect(Math.abs(a.start * 59.94 - Math.round(a.start * 59.94))).toBeLessThan(1e-6)
  })

  it.each(['undo', 'redo'] as const)('%s keeps the speed regions a project load installed mid-restore', (which) => {
    useSpeedStore.getState().place(r('a', 2, 4))
    if (which === 'redo') undo()
    const { canvas } = useDrawingStore.getState()
    const real = canvas!.loadFromJSON.bind(canvas)
    let finish: () => void = () => undefined
    canvas!.loadFromJSON = ((json: unknown, callback: () => void) => {
      finish = () => real(json as never, callback)
      return canvas
    }) as never
    ;(which === 'undo' ? undo : redo)()
    useDrawingStore.getState().replaceAnnotations([])
    useSpeedStore.getState().replaceAll([r('loaded', 6, 8)])
    finish()
    expect(regions().map((x) => x.id)).toEqual(['loaded'])
    expect(useDrawingStore.getState().pendingReplacement).toBeNull()
  })
})
