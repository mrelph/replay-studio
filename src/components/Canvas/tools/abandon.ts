import type { CanvasTool, ToolContext } from './types'

/**
 * Why a gesture in progress has to end: playback started, the playhead moved
 * to another frame, an undo/redo or project load is replacing the canvas
 * contents, or the canvas itself is being disposed.
 */
export type AbandonReason = 'play' | 'seek' | 'restore' | 'dispose'

/**
 * Playing or seeking away ends the gesture the way a tool switch does (a typed
 * callout is kept, on the frame it was started on). A restore or a disposal
 * replaces the canvas under the gesture, so its work is dropped.
 */
export function abandonKeepsWork(reason: AbandonReason): boolean {
  return reason === 'play' || reason === 'seek'
}

/** Ends a busy tool's gesture for `reason`; `restoring` is true while an undo/redo or project load is in flight. */
export function abandonGesture(tool: CanvasTool, ctx: ToolContext, reason: AbandonReason, restoring: boolean): void {
  if (!tool.isBusy?.()) return
  if (!restoring && abandonKeepsWork(reason) && tool.onToolSwitch) tool.onToolSwitch(ctx)
  else tool.cancel?.(ctx)
}
