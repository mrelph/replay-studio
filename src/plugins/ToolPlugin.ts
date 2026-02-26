import type fabricModule from 'fabric'

/**
 * Context passed to tool plugin lifecycle methods.
 * Provides access to the fabric canvas, video state, and drawing store actions.
 */
export interface ToolPluginContext {
  canvas: fabricModule.Canvas
  videoElement: HTMLVideoElement | null
  currentTime: number
  duration: number
  canvasWidth: number
  canvasHeight: number
  strokeColor: string
  strokeWidth: number
  addAnnotation: (object: fabricModule.Object, toolType: string) => void
}

export interface ToolPluginPointer {
  x: number
  y: number
}

/**
 * Interface for defining custom drawing/annotation tools.
 * Future tools can implement this interface and register with the ToolRegistry.
 */
export interface ToolPlugin {
  /** Unique identifier for this tool (e.g., 'custom-arrow') */
  id: string
  /** Display name shown in toolbar */
  name: string
  /** Lucide icon name or SVG string */
  icon: string
  /** Tool category for grouping in toolbar */
  category: 'draw' | 'shape' | 'effect' | 'custom'
  /** CSS cursor to show when tool is active */
  cursor: string

  /** Called when mouse button is pressed on canvas */
  onMouseDown?(ctx: ToolPluginContext, pointer: ToolPluginPointer): void
  /** Called when mouse moves on canvas (during drawing) */
  onMouseMove?(ctx: ToolPluginContext, pointer: ToolPluginPointer): void
  /** Called when mouse button is released on canvas */
  onMouseUp?(ctx: ToolPluginContext, pointer: ToolPluginPointer): void
  /** Called on each video time update (for animated tools) */
  onTimeUpdate?(ctx: ToolPluginContext, currentTime: number): void
  /** Called when this tool becomes the active tool */
  activate?(ctx: ToolPluginContext): void
  /** Called when switching away from this tool */
  deactivate?(ctx: ToolPluginContext): void
  /** Cleanup when tool is unregistered */
  dispose?(): void
}
