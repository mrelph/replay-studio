import { useState } from 'react'
import {
  MousePointer2, Pen, Minus, ArrowUpRight, Redo, Square, Circle, Type,
  Sun, ZoomIn, Crosshair, Radio, Undo2, Redo2, Trash2
} from 'lucide-react'
import { useToolStore, PRESET_COLORS, STROKE_WIDTHS, type ToolType } from '@/stores/toolStore'
import { useDrawingStore } from '@/stores/drawingStore'
import { useAudienceStore } from '@/stores/audienceStore'
import { Modal, Button } from '@/components/ui'

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
      className={`w-8 h-8 flex items-center justify-center rounded-md transition-all duration-150 ${
        isActive
          ? 'bg-accent text-accent-text shadow-md'
          : 'hover:bg-surface-sunken text-text-secondary hover:text-text-primary'
      }`}
      title={`${label}${shortcut ? ` (${shortcut})` : ''}`}
      aria-label={label}
      aria-pressed={isActive}
      role="radio"
    >
      {icon}
    </button>
  )
}

function ToolGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-0" role="group" aria-label={label}>
      <div className="flex items-center gap-0.5">
        {children}
      </div>
      <span className="text-[9px] uppercase tracking-wider text-text-disabled leading-none select-none" aria-hidden="true">{label}</span>
    </div>
  )
}

function VerticalDivider() {
  return <div className="w-px h-8 bg-border-subtle mx-1.5 flex-shrink-0 self-center" />
}

const COLOR_NAMES: Record<string, string> = {
  '#FF3B30': 'Red (1)',
  '#FF9500': 'Orange (2)',
  '#FFCC00': 'Yellow (3)',
  '#34C759': 'Green (4)',
  '#00C7BE': 'Teal (5)',
  '#007AFF': 'Blue (6)',
  '#AF52DE': 'Purple (7)',
  '#FF2D55': 'Pink (8)',
  '#FFFFFF': 'White (9)',
  '#1C1C1E': 'Black',
}

export default function DrawingToolbar() {
  const { strokeColor, strokeWidth, setStrokeColor, setStrokeWidth, currentTool, setCurrentTool } = useToolStore()
  const { undo, redo, clearAnnotations, undoStack, redoStack, annotations } = useDrawingStore()
  const isAudienceOpen = useAudienceStore((s) => s.isAudienceOpen)
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  return (
    <div role="toolbar" aria-label="Drawing tools" className="h-12 bg-surface-elevated/95 border-t border-border-subtle flex items-center px-3 gap-1 backdrop-blur-sm flex-shrink-0 overflow-x-auto">
      {/* Select */}
      <ToolGroup label="Select">
        <ToolButton tool="select" label="Select" shortcut="V" icon={<MousePointer2 className="w-4 h-4" />} />
      </ToolGroup>

      <VerticalDivider />

      {/* Drawing tools */}
      <ToolGroup label="Draw">
        <ToolButton tool="pen" label="Freehand" shortcut="P" icon={<Pen className="w-4 h-4" />} />
        <ToolButton tool="line" label="Line" shortcut="Shift+L" icon={<Minus className="w-4 h-4" />} />
        <ToolButton tool="arrow" label="Arrow" shortcut="A" icon={<ArrowUpRight className="w-4 h-4" />} />
        <ToolButton tool="arc-arrow" label="Arc Arrow" shortcut="Shift+A" icon={<Redo className="w-4 h-4" />} />
      </ToolGroup>

      <VerticalDivider />

      {/* Shape tools */}
      <ToolGroup label="Shapes">
        <ToolButton tool="rectangle" label="Rectangle" shortcut="R" icon={<Square className="w-4 h-4" />} />
        <ToolButton tool="circle" label="Ellipse" shortcut="C" icon={<Circle className="w-4 h-4" />} />
        <ToolButton tool="text" label="Text" shortcut="T" icon={<Type className="w-4 h-4" />} />
      </ToolGroup>

      <VerticalDivider />

      {/* Effects */}
      <ToolGroup label="Effects">
        <ToolButton tool="spotlight" label="Spotlight" shortcut="S" icon={<Sun className="w-4 h-4" />} />
        <ToolButton tool="magnifier" label="Zoom Lens" shortcut="Shift+M" icon={<ZoomIn className="w-4 h-4" />} />
        <ToolButton tool="tracker" label="Player Tracker" shortcut="Shift+K" icon={<Crosshair className="w-4 h-4" />} />
        <button
          onClick={() => setCurrentTool('laser')}
          className={`w-8 h-8 flex items-center justify-center rounded-md transition-all duration-150 ${
            currentTool === 'laser'
              ? 'bg-error text-white shadow-md'
              : isAudienceOpen
              ? 'hover:bg-surface-sunken text-text-secondary hover:text-text-primary'
              : 'text-text-disabled cursor-not-allowed opacity-40'
          }`}
          disabled={!isAudienceOpen}
          title={`Laser Pointer (Shift+P)${!isAudienceOpen ? ' - Open Audience View first' : ''}`}
        >
          <Radio className="w-4 h-4" />
        </button>
      </ToolGroup>

      <VerticalDivider />

      {/* Color swatches */}
      <ToolGroup label="Color">
        {PRESET_COLORS.slice(0, 6).map((color) => (
          <button
            key={color}
            onClick={() => setStrokeColor(color)}
            className={`w-6 h-6 rounded transition-all flex-shrink-0 ${
              strokeColor === color
                ? 'ring-2 ring-accent ring-offset-1 ring-offset-surface-elevated scale-110'
                : 'hover:scale-110'
            }`}
            style={{ backgroundColor: color }}
            title={COLOR_NAMES[color] || color}
          />
        ))}
      </ToolGroup>

      <VerticalDivider />

      {/* Stroke widths */}
      <ToolGroup label="Size">
        {STROKE_WIDTHS.slice(0, 4).map((width) => (
          <button
            key={width}
            onClick={() => setStrokeWidth(width)}
            className={`w-7 h-7 rounded flex items-center justify-center transition-all ${
              strokeWidth === width
                ? 'bg-accent-subtle ring-1 ring-accent'
                : 'hover:bg-surface-sunken'
            }`}
            title={`${width}px stroke`}
          >
            <div
              className="bg-text-secondary rounded-full"
              style={{
                width: Math.max(Math.min(width * 1.5, 16), 3),
                height: Math.min(width, 6),
              }}
            />
          </button>
        ))}
      </ToolGroup>

      <VerticalDivider />

      {/* Actions */}
      <ToolGroup label="Actions">
        <button
          onClick={undo}
          disabled={undoStack.length === 0}
          className="w-8 h-8 flex items-center justify-center hover:bg-surface-sunken rounded-md text-text-secondary hover:text-text-primary transition-all disabled:opacity-25 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="w-4 h-4" />
        </button>
        <button
          onClick={redo}
          disabled={redoStack.length === 0}
          className="w-8 h-8 flex items-center justify-center hover:bg-surface-sunken rounded-md text-text-secondary hover:text-text-primary transition-all disabled:opacity-25 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          title="Redo (Ctrl+Y)"
        >
          <Redo2 className="w-4 h-4" />
        </button>
        <button
          onClick={() => {
            if (annotations.length === 0) return
            setShowClearConfirm(true)
          }}
          disabled={annotations.length === 0}
          className="w-8 h-8 flex items-center justify-center hover:bg-error-subtle rounded-md text-text-secondary hover:text-error transition-all disabled:opacity-25 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          title="Clear all annotations"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </ToolGroup>

      {/* Clear confirmation dialog */}
      {showClearConfirm && (
        <Modal open={true} title="Clear All Annotations" onClose={() => setShowClearConfirm(false)}>
          <div className="px-6 py-4">
            <p className="text-text-secondary text-sm mb-4">
              This will remove all {annotations.length} annotation{annotations.length !== 1 ? 's' : ''} from the canvas. You can undo this with Ctrl+Z.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={() => setShowClearConfirm(false)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  clearAnnotations()
                  setShowClearConfirm(false)
                }}
              >
                Clear All
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
