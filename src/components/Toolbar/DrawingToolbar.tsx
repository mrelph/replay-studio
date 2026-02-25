import {
  MousePointer2, Pen, Minus, ArrowUpRight, Square, Circle, Type,
  Sun, ZoomIn, Crosshair, Radio, Undo2, Redo2, Trash2
} from 'lucide-react'
import { useToolStore, PRESET_COLORS, STROKE_WIDTHS, type ToolType } from '@/stores/toolStore'
import { useDrawingStore } from '@/stores/drawingStore'
import { useAudienceStore } from '@/stores/audienceStore'

interface ToolButtonProps {
  tool: ToolType
  icon: React.ReactNode
  label: string
  shortcut?: string
}

function ToolButton({ tool, icon, label, shortcut }: ToolButtonProps) {
  const { currentTool, setCurrentTool } = useToolStore()
  const isActive = currentTool === tool

  return (
    <button
      onClick={() => setCurrentTool(tool)}
      className={`w-10 h-10 flex items-center justify-center rounded-lg transition-all duration-150 ${
        isActive
          ? 'bg-accent text-accent-text shadow-md'
          : 'hover:bg-surface-sunken text-text-secondary hover:text-text-primary'
      }`}
      title={`${label}${shortcut ? ` (${shortcut})` : ''}`}
    >
      {icon}
    </button>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-medium text-text-disabled uppercase tracking-wider px-1 mt-2 mb-1">
      {children}
    </div>
  )
}

function ToolbarDivider() {
  return <div className="w-10 h-px bg-border-subtle my-2" />
}

const COLOR_NAMES: Record<string, string> = {
  '#ff0000': 'Red',
  '#ff9800': 'Orange',
  '#ffeb3b': 'Yellow',
  '#4caf50': 'Green',
  '#2196f3': 'Blue',
  '#9c27b0': 'Purple',
  '#ffffff': 'White',
  '#000000': 'Black',
}

export default function DrawingToolbar() {
  const { strokeColor, strokeWidth, setStrokeColor, setStrokeWidth, currentTool, setCurrentTool } = useToolStore()
  const { undo, redo, clearAnnotations, undoStack, redoStack } = useDrawingStore()
  const isAudienceOpen = useAudienceStore((s) => s.isAudienceOpen)

  return (
    <div className="w-14 bg-surface-elevated/95 border-r border-border-subtle flex flex-col items-center py-3 backdrop-blur-sm overflow-y-auto overflow-x-hidden min-h-0 scrollbar-narrow">
      {/* Selection tool */}
      <SectionLabel>Select</SectionLabel>
      <ToolButton
        tool="select"
        label="Select"
        shortcut="V"
        icon={<MousePointer2 className="w-5 h-5" />}
      />

      <ToolbarDivider />

      {/* Drawing tools */}
      <SectionLabel>Draw</SectionLabel>
      <div className="flex flex-col gap-0.5">
        <ToolButton
          tool="pen"
          label="Freehand"
          shortcut="P"
          icon={<Pen className="w-5 h-5" />}
        />
        <ToolButton
          tool="line"
          label="Line"
          shortcut="L"
          icon={<Minus className="w-5 h-5" />}
        />
        <ToolButton
          tool="arrow"
          label="Arrow"
          shortcut="A"
          icon={<ArrowUpRight className="w-5 h-5" />}
        />
      </div>

      <ToolbarDivider />

      {/* Shape tools */}
      <SectionLabel>Shapes</SectionLabel>
      <div className="flex flex-col gap-0.5">
        <ToolButton
          tool="rectangle"
          label="Rectangle"
          shortcut="R"
          icon={<Square className="w-5 h-5" />}
        />
        <ToolButton
          tool="circle"
          label="Ellipse"
          shortcut="C"
          icon={<Circle className="w-5 h-5" />}
        />
        <ToolButton
          tool="text"
          label="Text"
          shortcut="T"
          icon={<Type className="w-5 h-5" />}
        />
      </div>

      <ToolbarDivider />

      {/* Advanced telestrator tools */}
      <SectionLabel>Effects</SectionLabel>
      <div className="flex flex-col gap-0.5">
        <ToolButton
          tool="spotlight"
          label="Spotlight"
          shortcut="S"
          icon={<Sun className="w-5 h-5" />}
        />
        <ToolButton
          tool="magnifier"
          label="Zoom Lens"
          shortcut="M"
          icon={<ZoomIn className="w-5 h-5" />}
        />
        <ToolButton
          tool="tracker"
          label="Player Tracker"
          shortcut="K"
          icon={<Crosshair className="w-5 h-5" />}
        />
      </div>

      <ToolbarDivider />

      {/* Presentation tools */}
      <SectionLabel>Present</SectionLabel>
      <div className="flex flex-col gap-0.5">
        <button
          onClick={() => setCurrentTool('laser')}
          className={`w-10 h-10 flex items-center justify-center rounded-lg transition-all duration-150 ${
            currentTool === 'laser'
              ? 'bg-error text-white shadow-md'
              : isAudienceOpen
              ? 'hover:bg-surface-sunken text-text-secondary hover:text-text-primary'
              : 'text-text-disabled cursor-not-allowed opacity-40'
          }`}
          disabled={!isAudienceOpen}
          title={`Laser Pointer (Shift+P)${!isAudienceOpen ? ' - Open Audience View first' : ''}`}
        >
          <Radio className="w-5 h-5" />
        </button>
      </div>

      <ToolbarDivider />

      {/* Color picker */}
      <SectionLabel>Color</SectionLabel>
      <div className="grid grid-cols-2 gap-1.5">
        {PRESET_COLORS.slice(0, 6).map((color) => (
          <button
            key={color}
            onClick={() => setStrokeColor(color)}
            className={`w-5 h-5 rounded-sm transition-all ${
              strokeColor === color
                ? 'ring-2 ring-accent ring-offset-1 ring-offset-surface-elevated scale-110'
                : 'hover:scale-110'
            }`}
            style={{ backgroundColor: color }}
            title={COLOR_NAMES[color] || color}
          />
        ))}
      </div>

      <ToolbarDivider />

      {/* Stroke width */}
      <SectionLabel>Size</SectionLabel>
      <div className="flex flex-col gap-1">
        {STROKE_WIDTHS.slice(0, 4).map((width) => (
          <button
            key={width}
            onClick={() => setStrokeWidth(width)}
            className={`w-10 h-6 rounded flex items-center justify-center transition-all ${
              strokeWidth === width
                ? 'bg-accent-subtle ring-1 ring-accent'
                : 'hover:bg-surface-sunken'
            }`}
            title={`${width}px stroke`}
          >
            <div
              className="bg-text-secondary rounded-full"
              style={{
                width: Math.max(Math.min(width * 1.5, 20), 4),
                height: Math.min(width, 8),
              }}
            />
          </button>
        ))}
      </div>

      <div className="flex-1" />

      {/* Actions */}
      <SectionLabel>Actions</SectionLabel>
      <div className="flex flex-col gap-0.5">
        <button
          onClick={undo}
          disabled={undoStack.length === 0}
          className="w-10 h-10 flex items-center justify-center hover:bg-surface-sunken rounded-lg text-text-secondary hover:text-text-primary transition-all disabled:opacity-25 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="w-5 h-5" />
        </button>

        <button
          onClick={redo}
          disabled={redoStack.length === 0}
          className="w-10 h-10 flex items-center justify-center hover:bg-surface-sunken rounded-lg text-text-secondary hover:text-text-primary transition-all disabled:opacity-25 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          title="Redo (Ctrl+Y)"
        >
          <Redo2 className="w-5 h-5" />
        </button>

        <button
          onClick={clearAnnotations}
          className="w-10 h-10 flex items-center justify-center hover:bg-error-subtle rounded-lg text-text-secondary hover:text-error transition-all"
          title="Clear all annotations"
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </div>
    </div>
  )
}
