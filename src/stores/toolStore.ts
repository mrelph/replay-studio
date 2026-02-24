import { create } from 'zustand'

export type ToolType =
  | 'select'
  | 'pen'
  | 'line'
  | 'arrow'
  | 'rectangle'
  | 'circle'
  | 'text'
  | 'spotlight'
  | 'magnifier'
  | 'tracker'
  | 'laser'

interface ToolState {
  currentTool: ToolType
  strokeColor: string
  fillColor: string
  strokeWidth: number
  fontSize: number
  isDrawing: boolean

  // Actions
  setCurrentTool: (tool: ToolType) => void
  setStrokeColor: (color: string) => void
  setFillColor: (color: string) => void
  setStrokeWidth: (width: number) => void
  setFontSize: (size: number) => void
  setIsDrawing: (drawing: boolean) => void
}

export const useToolStore = create<ToolState>((set) => ({
  currentTool: 'select',
  strokeColor: '#ff0000',
  fillColor: 'transparent',
  strokeWidth: 4,
  fontSize: 24,
  isDrawing: false,

  setCurrentTool: (tool) => set({ currentTool: tool }),
  setStrokeColor: (color) => set({ strokeColor: color }),
  setFillColor: (color) => set({ fillColor: color }),
  setStrokeWidth: (width) => set({ strokeWidth: width }),
  setFontSize: (size) => set({ fontSize: size }),
  setIsDrawing: (drawing) => set({ isDrawing: drawing }),
}))

// Preset colors for quick selection
export const PRESET_COLORS = [
  '#ff0000', // Red
  '#ff6b00', // Orange
  '#ffd000', // Yellow
  '#00ff00', // Green
  '#00d4ff', // Cyan
  '#0066ff', // Blue
  '#9900ff', // Purple
  '#ff00ff', // Magenta
  '#ffffff', // White
  '#000000', // Black
]

export const STROKE_WIDTHS = [2, 4, 6, 8, 12, 16]
