import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from 'vitest'
import { fabric } from '@/lib/fabric'
import { useVideoStore } from './videoStore'
import { useDrawingStore } from './drawingStore'
import { useSpeedStore } from './speedStore'
import { useVoiceStore } from './voiceStore'
import { getVoiceAudio } from '@/voice/voiceAudio'
import type { VoiceClip } from '@/types/voice'

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

const clip = (id: string, startTime: number, frozen = true): VoiceClip => ({ id, startTime, duration: 2, frozen, mime: 'audio/webm' })
const blob = (text: string) => new Blob([text], { type: 'audio/webm' })
const ids = () => useVoiceStore.getState().clips.map((c) => c.id)
const undo = () => useDrawingStore.getState().undo()
const redo = () => useDrawingStore.getState().redo()

beforeEach(() => {
  const canvas = new fabric.Canvas(document.createElement('canvas'), { width: 100, height: 100 })
  canvases.push(canvas)
  useVideoStore.setState({ duration: 20, fps: 30 })
  useDrawingStore.setState({ canvas, annotations: [], undoStack: [], redoStack: [], isRestoring: false })
  useSpeedStore.getState().replaceAll([])
  useVoiceStore.getState().replaceAll([])
  localStorage.clear()
})

afterEach(() => {
  canvases.splice(0).forEach((c) => c.dispose())
})

describe('voice store undo', () => {
  it('undoes and redoes add, keeping the audio', () => {
    useVoiceStore.getState().add(clip('a', 1), blob('a'))
    expect(ids()).toEqual(['a'])
    undo()
    expect(ids()).toEqual([])
    expect(getVoiceAudio('a')).toBeDefined()
    redo()
    expect(ids()).toEqual(['a'])
  })

  it('replaces the frozen clip on the same frame in one undo step', () => {
    useVoiceStore.getState().add(clip('a', 1), blob('a'))
    useVoiceStore.getState().add(clip('b', 1.005), blob('b'))
    expect(ids()).toEqual(['b'])
    undo()
    expect(ids()).toEqual(['a'])
  })

  it('removes and restores on undo; unknown id is a no-op', () => {
    useVoiceStore.getState().add(clip('a', 1), blob('a'))
    const depth = useDrawingStore.getState().undoStack.length
    useVoiceStore.getState().remove('nope')
    expect(useDrawingStore.getState().undoStack.length).toBe(depth)
    useVoiceStore.getState().remove('a')
    expect(ids()).toEqual([])
    undo()
    expect(ids()).toEqual(['a'])
  })

  it('speed and voice undo steps leave each other alone', () => {
    useSpeedStore.getState().place({ id: 's', start: 2, end: 4, speed: 0.5 })
    useVoiceStore.getState().add(clip('a', 1), blob('a'))
    undo()
    expect(useSpeedStore.getState().regions.map((r) => r.id)).toEqual(['s'])
    expect(ids()).toEqual([])
    useSpeedStore.getState().replaceAll([])
    useVoiceStore.getState().add(clip('b', 5), blob('b'))
    useSpeedStore.getState().place({ id: 's2', start: 2, end: 4, speed: 0.5 })
    undo()
    expect(ids()).toEqual(['b'])
    expect(useSpeedStore.getState().regions).toEqual([])
  })

  it('drops a selection that no longer exists after undo', () => {
    useVoiceStore.getState().add(clip('a', 1), blob('a'))
    useVoiceStore.getState().select('a')
    undo()
    expect(useVoiceStore.getState().selectedId).toBeNull()
  })

  it('replaceAll pushes no history', () => {
    useVoiceStore.getState().replaceAll([clip('a', 1)])
    expect(useDrawingStore.getState().undoStack.length).toBe(0)
  })
})

describe('duck setting', () => {
  it('persists and does not push history', () => {
    useVoiceStore.getState().setDuck('off')
    expect(localStorage.getItem('replay-studio-voice-duck')).toBe('off')
    expect(useVoiceStore.getState().duck).toBe('off')
    expect(useDrawingStore.getState().undoStack.length).toBe(0)
  })

  it('reads an unknown stored value as low', async () => {
    localStorage.setItem('replay-studio-voice-duck', 'loud')
    vi.resetModules()
    const fresh = await import('./voiceStore')
    expect(fresh.useVoiceStore.getState().duck).toBe('low')
  })
})
