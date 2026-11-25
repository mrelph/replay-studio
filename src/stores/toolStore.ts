import { create } from 'zustand'
import type { AnnotationStyle } from '@/utils/annotationStyle'
import { DEFAULT_TEXT_FORMAT, type TextFormat } from '@/utils/textFormat'

export type ToolType =
  | 'select'
  | 'pen'
  | 'line'
  | 'arrow'
  | 'arc-arrow'
  | 'rectangle'
  | 'circle'
  | 'text'
  | 'spotlight'
  | 'magnifier'
  | 'tracker'
  | 'laser'
  | 'erase'

interface ToolState {
  currentTool: ToolType
  strokeColor: string
  fillColor: string
  strokeWidth: number
  textFormat: TextFormat
  isDrawing: boolean
  annotationStyle: AnnotationStyle

  // Actions
  setCurrentTool: (tool: ToolType) => void
  setStrokeColor: (color: string) => void
  setFillColor: (color: string) => void
  setStrokeWidth: (width: number) => void
  setTextFormat: (changes: Partial<TextFormat>) => void
  setIsDrawing: (drawing: boolean) => void
  setAnnotationStyle: (style: AnnotationStyle) => void
}

export const useToolStore = create<ToolState>((set) => ({
  currentTool: 'select',
  strokeColor: '#FF3B30',
  fillColor: 'transparent',
  strokeWidth: 4,
  textFormat: DEFAULT_TEXT_FORMAT,
  isDrawing: false,
  annotationStyle: 'outline',

  setCurrentTool: (tool) => set({ currentTool: tool }),
  setStrokeColor: (color) => set({ strokeColor: color }),
  setFillColor: (color) => set({ fillColor: color }),
  setStrokeWidth: (width) => set({ strokeWidth: width }),
  setTextFormat: (changes) => set((state) => ({ textFormat: { ...state.textFormat, ...changes } })),
  setIsDrawing: (drawing) => set({ isDrawing: drawing }),
  setAnnotationStyle: (style) => set({ annotationStyle: style }),
}))

// Broadcast-standard color palette (desaturated, brightness-balanced)
export const PRESET_COLORS = [
  '#FF3B30', // Red (Apple/ESPN standard)
  '#FF9500', // Orange
  '#FFCC00', // Yellow
  '#34C759', // Green
  '#00C7BE', // Teal
  '#007AFF', // Blue (broadcast blue)
  '#AF52DE', // Purple
  '#FF2D55', // Pink
  '#FFFFFF', // White
  '#1C1C1E', // Near-black
]

export const STROKE_WIDTHS = [2, 4, 6, 8, 12, 16]
