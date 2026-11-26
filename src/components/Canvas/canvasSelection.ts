import type { fabric } from 'fabric'
import { useSpeedStore } from '@/stores/speedStore'
import { useVoiceStore } from '@/stores/voiceStore'

const SELECTION_EVENTS = ['selection:created', 'selection:updated']

/** A drawing selected on the canvas takes the selection from the speed and voice lanes, so one Delete removes one thing. */
export function clearLaneSelectionOnCanvasSelect(canvas: fabric.Canvas): () => void {
  const clear = () => {
    if (useSpeedStore.getState().selectedId !== null) useSpeedStore.getState().select(null)
    if (useVoiceStore.getState().selectedId !== null) useVoiceStore.getState().select(null)
  }
  SELECTION_EVENTS.forEach((event) => canvas.on(event, clear))
  return () => SELECTION_EVENTS.forEach((event) => canvas.off(event, clear))
}
