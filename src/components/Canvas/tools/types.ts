import type { AnnotationStyle } from '@/utils/annotationStyle'
import type { TextFormat } from '@/utils/textFormat'

export interface ToolPoint { x: number; y: number }

export interface ToolContext {
  canvas: fabric.Canvas
  color: string
  strokeWidth: number
  style: AnnotationStyle
  textFormat: TextFormat
  /** Stamps the captured frame time and does everything createAnnotation does. */
  commit(object: fabric.Object, toolType: string): void
}

export interface CanvasTool {
  onDown?(ctx: ToolContext, p: ToolPoint, e: fabric.IEvent): void
  onMove?(ctx: ToolContext, p: ToolPoint, e: fabric.IEvent): void
  onUp?(ctx: ToolContext, p: ToolPoint, e: fabric.IEvent): void
  onDoubleClick?(ctx: ToolContext, p: ToolPoint, e: fabric.IEvent): void
  /** Returns true when the key was handled (the caller stops it reaching other listeners). */
  onKey?(ctx: ToolContext, e: KeyboardEvent): boolean
  /** Tool switched away, or the gesture must be abandoned: remove preview objects. */
  cancel?(ctx: ToolContext): void
  /** The user picked another tool mid-gesture, or playback started or the playhead left the gesture's frame (see abandon.ts). Without this, `cancel` runs. */
  onToolSwitch?(ctx: ToolContext): void
  /** True while a multi-step gesture is in progress (used by Task 3). */
  isBusy?(): boolean
}
