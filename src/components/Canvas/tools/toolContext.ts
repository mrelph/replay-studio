import { useToolStore } from '@/stores/toolStore'
import type { ToolContext } from './types'

/**
 * Context for a tool module. Colour, width, style and text format are read from
 * the store when the tool reads them, so a change mid-gesture (even one a tool
 * finishes later, like a callout's typing) applies to the shape in progress.
 */
export function liveToolContext(canvas: fabric.Canvas, commit: ToolContext['commit']): ToolContext {
  return {
    canvas,
    commit,
    get color() { return useToolStore.getState().strokeColor },
    get strokeWidth() { return useToolStore.getState().strokeWidth },
    get style() { return useToolStore.getState().annotationStyle },
    get textFormat() { return useToolStore.getState().textFormat },
  }
}
