import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { fabric } from '@/lib/fabric'
import {
  recordedHold,
  findFreezeAt,
  findFreezeCarrierAt,
  setFrameFreeze,
  setFreezeAt,
  addFreezeMarker,
  MAX_RECORDED_HOLD_SECONDS,
} from './freezeMarkers'
import { useDrawingStore, type Annotation } from '@/stores/drawingStore'
import { timeForFrame } from './frames'

describe('recordedHold', () => {
  it('records the paused time, rounded to 0.1 s', () => {
    expect(recordedHold(10, 10, 2.34)).toEqual({ record: true, seconds: 2.3, capped: false })
  })

  it('still records after frame-stepping a little while paused', () => {
    expect(recordedHold(10, 10.3, 1.5).record).toBe(true)
  })

  it('ignores a pause where the coach scrubbed away', () => {
    expect(recordedHold(10, 25, 4)).toEqual({ record: false, reason: 'moved' })
    expect(recordedHold(10, 5, 4)).toEqual({ record: false, reason: 'moved' })
    expect(recordedHold(10, 9, 4)).toEqual({ record: false, reason: 'moved' })
  })

  it('ignores a double-tap', () => {
    expect(recordedHold(10, 10, 0.2)).toEqual({ record: false, reason: 'too-short' })
  })

  it('caps very long pauses', () => {
    expect(recordedHold(10, 10, 240)).toEqual({ record: true, seconds: MAX_RECORDED_HOLD_SECONDS, capped: true })
  })
})

describe('findFreezeAt', () => {
  const ann = (id: string, startTime: number, freezeDuration?: number) =>
    ({ id, startTime, freezeDuration, endTime: startTime + 1, layer: 1, toolType: 'freeze' }) as unknown as Annotation

  it('matches by frame, not exact float time', () => {
    const fps = 30000 / 1001
    const list = [ann('a', timeForFrame(31, fps), 2), ann('b', 5, 3)]
    expect(findFreezeAt(list, 31.6 / fps, fps)?.id).toBe('a') // later in the same frame
    expect(findFreezeAt(list, 32.2 / fps, fps)).toBeUndefined() // next frame
  })

  it('ignores annotations without a freeze', () => {
    expect(findFreezeAt([ann('a', 5)], 5, 30)).toBeUndefined()
  })
})

describe('findFreezeCarrierAt', () => {
  const ann = (id: string, startTime: number, toolType: string, freezeDuration?: number) =>
    ({ id, startTime, freezeDuration, endTime: startTime + 1, layer: 1, toolType }) as unknown as Annotation

  it('returns a marker whose freeze is 0', () => {
    expect(findFreezeCarrierAt([ann('m', 5, 'freeze', 0)], 5, 30)?.id).toBe('m')
  })

  it('prefers the marker over a drawing that also has a freeze', () => {
    const list = [ann('d', 5, 'arrow', 3), ann('m', 5, 'freeze', 2)]
    expect(findFreezeCarrierAt(list, 5, 30)?.id).toBe('m')
  })

  it('returns a legacy drawing carrier when there is no marker', () => {
    const list = [ann('x', 5, 'arrow'), ann('d', 5, 'arrow', 3)]
    expect(findFreezeCarrierAt(list, 5, 30)?.id).toBe('d')
  })

  it('findFreezeAt ignores a 0 carrier', () => {
    expect(findFreezeAt([ann('m', 5, 'freeze', 0)], 5, 30)).toBeUndefined()
  })
})

describe('setFrameFreeze', () => {
  const originalGetContext = HTMLCanvasElement.prototype.getContext
  beforeAll(() => {
    HTMLCanvasElement.prototype.getContext = (() => new Proxy({}, { get: () => () => undefined })) as unknown as HTMLCanvasElement['getContext']
  })
  afterAll(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext
  })

  it('keeps one carrier when the freeze is set to 0 and then changed', () => {
    const canvas = new fabric.Canvas(document.createElement('canvas'), { width: 100, height: 100 })
    useDrawingStore.setState({ canvas, annotations: [], undoStack: [], redoStack: [], isRestoring: false })
    addFreezeMarker(4, 1.4, { auto: true })
    const freezes = () => useDrawingStore.getState().annotations.filter((a) => a.toolType === 'freeze')

    const id = setFrameFreeze(4, 0, 30, { auto: false })
    expect(freezes()).toHaveLength(1)
    expect(freezes()[0].id).toBe(id)
    expect(freezes()[0].freezeDuration).toBe(0)
    expect(freezes()[0].freezeAuto).toBe(false)

    expect(setFrameFreeze(4, 2, 30, { auto: false })).toBe(id)
    expect(freezes()).toHaveLength(1)
    expect(freezes()[0].freezeDuration).toBe(2)
  })

  it('setFreezeAt leaves a legacy carrier without a freezeAuto key, and makes an automatic one hand-set', () => {
    const canvas = new fabric.Canvas(document.createElement('canvas'), { width: 100, height: 100 })
    useDrawingStore.setState({ canvas, annotations: [], undoStack: [], redoStack: [], isRestoring: false })
    const legacy = addFreezeMarker(4, 1)
    expect(setFreezeAt(4, 3, 30)).toBe(legacy)
    const marker = useDrawingStore.getState().annotations[0]
    expect(marker.freezeDuration).toBe(3)
    expect(marker.freezeAuto).toBeUndefined()

    addFreezeMarker(8, 1.4, { auto: true })
    setFreezeAt(8, 2, 30)
    const auto = useDrawingStore.getState().annotations[1]
    expect(auto.freezeDuration).toBe(2)
    expect(auto.freezeAuto).toBe(false)
  })
})
