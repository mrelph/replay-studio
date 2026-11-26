import type { ToolType } from '@/stores/toolStore'

/** Drawing tools with a toolbar button and shortcut. Each task that adds a tool's module appends it here. */
export const IMPLEMENTED_DRAW_TOOLS: readonly ToolType[] = [
  'pen', 'line', 'arrow', 'arc-arrow', 'rectangle', 'circle', 'text', 'spotlight', 'magnifier', 'ring', 'zone',
]

/** The toolType an annotation is stored under, where it differs from the tool (the pen's strokes arrive as 'path'). */
export const ANNOTATION_TOOL_TYPE: Partial<Record<ToolType, string>> = { pen: 'path' }
