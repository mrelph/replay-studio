import { useToolStore, PRESET_COLORS, STROKE_WIDTHS, type ToolType } from '@/stores/toolStore'
import { useDrawingStore } from '@/stores/drawingStore'

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
      className={`p-2.5 rounded-lg transition-colors ${
        isActive
          ? 'bg-blue-600 text-white'
          : 'hover:bg-gray-700 text-gray-300 hover:text-white'
      }`}
      title={`${label}${shortcut ? ` (${shortcut})` : ''}`}
    >
      {icon}
    </button>
  )
}

export default function DrawingToolbar() {
  const { strokeColor, strokeWidth, setStrokeColor, setStrokeWidth } = useToolStore()
  const { undo, redo, clearAnnotations, undoStack, redoStack } = useDrawingStore()

  return (
    <div className="w-16 bg-gray-800 border-r border-gray-700 flex flex-col items-center py-3 gap-1">
      {/* Selection tool */}
      <ToolButton
        tool="select"
        label="Select"
        shortcut="V"
        icon={
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/>
          </svg>
        }
      />

      <div className="w-8 h-px bg-gray-700 my-1" />

      {/* Drawing tools */}
      <ToolButton
        tool="pen"
        label="Pen"
        shortcut="P"
        icon={
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M20.71 7.04c.39-.39.39-1.04 0-1.41l-2.34-2.34c-.37-.39-1.02-.39-1.41 0l-1.84 1.83 3.75 3.75M3 17.25V21h3.75L17.81 9.93l-3.75-3.75L3 17.25z"/>
          </svg>
        }
      />

      <ToolButton
        tool="line"
        label="Line"
        shortcut="L"
        icon={
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M19 13H5v-2h14v2z" transform="rotate(-45 12 12)"/>
          </svg>
        }
      />

      <ToolButton
        tool="arrow"
        label="Arrow"
        shortcut="A"
        icon={
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8-8-8z"/>
          </svg>
        }
      />

      <ToolButton
        tool="rectangle"
        label="Rectangle"
        shortcut="R"
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
          </svg>
        }
      />

      <ToolButton
        tool="circle"
        label="Circle"
        shortcut="C"
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="9"/>
          </svg>
        }
      />

      <ToolButton
        tool="text"
        label="Text"
        shortcut="T"
        icon={
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M5 4v3h5.5v12h3V7H19V4H5z"/>
          </svg>
        }
      />

      <div className="w-8 h-px bg-gray-700 my-1" />

      {/* Advanced tools */}
      <ToolButton
        tool="spotlight"
        label="Spotlight"
        shortcut="S"
        icon={
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z"/>
          </svg>
        }
      />

      <ToolButton
        tool="magnifier"
        label="Magnifier"
        shortcut="M"
        icon={
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
            <path d="M12 10h-2v2H9v-2H7V9h2V7h1v2h2v1z"/>
          </svg>
        }
      />

      <ToolButton
        tool="tracker"
        label="Player Tracker"
        shortcut="K"
        icon={
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
          </svg>
        }
      />

      <div className="w-8 h-px bg-gray-700 my-1" />

      {/* Color picker */}
      <div className="flex flex-col gap-1">
        {PRESET_COLORS.slice(0, 5).map((color) => (
          <button
            key={color}
            onClick={() => setStrokeColor(color)}
            className={`w-6 h-6 rounded border-2 ${
              strokeColor === color ? 'border-white' : 'border-transparent'
            }`}
            style={{ backgroundColor: color }}
            title={`Set color: ${color}`}
          />
        ))}
      </div>

      <div className="w-8 h-px bg-gray-700 my-1" />

      {/* Stroke width */}
      <div className="flex flex-col gap-1">
        {STROKE_WIDTHS.slice(0, 4).map((width) => (
          <button
            key={width}
            onClick={() => setStrokeWidth(width)}
            className={`w-6 h-6 rounded flex items-center justify-center ${
              strokeWidth === width ? 'bg-blue-600' : 'hover:bg-gray-700'
            }`}
            title={`Stroke width: ${width}px`}
          >
            <div
              className="bg-white rounded-full"
              style={{ width: Math.min(width, 16), height: Math.min(width, 16) }}
            />
          </button>
        ))}
      </div>

      <div className="flex-1" />

      {/* Undo/Redo */}
      <button
        onClick={undo}
        disabled={undoStack.length === 0}
        className="p-2 hover:bg-gray-700 rounded text-gray-300 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        title="Undo (Ctrl+Z)"
      >
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/>
        </svg>
      </button>

      <button
        onClick={redo}
        disabled={redoStack.length === 0}
        className="p-2 hover:bg-gray-700 rounded text-gray-300 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        title="Redo (Ctrl+Y)"
      >
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z"/>
        </svg>
      </button>

      {/* Clear all */}
      <button
        onClick={clearAnnotations}
        className="p-2 hover:bg-red-600 rounded text-gray-300 hover:text-white transition-colors"
        title="Clear all annotations"
      >
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
        </svg>
      </button>
    </div>
  )
}
