import { describe, it, expect, beforeEach } from 'vitest'
import type { fabric } from 'fabric'
import { useSpeedStore } from '@/stores/speedStore'
import { useVoiceStore } from '@/stores/voiceStore'
import { clearLaneSelectionOnCanvasSelect } from './canvasSelection'

class FakeCanvas {
  handlers = new Map<string, Set<() => void>>()
  on(event: string, handler: () => void) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set())
    this.handlers.get(event)!.add(handler)
  }
  off(event: string, handler: () => void) {
    this.handlers.get(event)?.delete(handler)
  }
  fire(event: string) {
    this.handlers.get(event)?.forEach((handler) => handler())
  }
}

beforeEach(() => {
  useSpeedStore.setState({ selectedId: 's1' })
  useVoiceStore.setState({ selectedId: 'v1' })
})

describe('clearLaneSelectionOnCanvasSelect', () => {
  it.each(['selection:created', 'selection:updated'])('%s clears the voice and speed selections', (event) => {
    const canvas = new FakeCanvas()
    clearLaneSelectionOnCanvasSelect(canvas as unknown as fabric.Canvas)
    canvas.fire(event)
    expect(useVoiceStore.getState().selectedId).toBeNull()
    expect(useSpeedStore.getState().selectedId).toBeNull()
  })

  it('a cleared canvas selection leaves the lanes alone, and the returned function stops listening', () => {
    const canvas = new FakeCanvas()
    const stop = clearLaneSelectionOnCanvasSelect(canvas as unknown as fabric.Canvas)
    canvas.fire('selection:cleared')
    expect(useVoiceStore.getState().selectedId).toBe('v1')
    stop()
    canvas.fire('selection:created')
    expect(useVoiceStore.getState().selectedId).toBe('v1')
    expect(useSpeedStore.getState().selectedId).toBe('s1')
  })
})
