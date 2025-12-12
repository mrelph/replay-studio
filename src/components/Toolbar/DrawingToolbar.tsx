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
      className={`w-10 h-10 flex items-center justify-center rounded-lg transition-all duration-150 ${
        isActive
          ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 scale-105'
          : 'hover:bg-gray-700/80 text-gray-400 hover:text-white'
      }`}
      title={`${label}${shortcut ? ` (${shortcut})` : ''}`}
    >
      {icon}
    </button>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wider px-1 mt-2 mb-1">
      {children}
    </div>
  )
}

function Divider() {
  return <div className="w-10 h-px bg-gray-700/50 my-2" />
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
  const { strokeColor, strokeWidth, setStrokeColor, setStrokeWidth } = useToolStore()
  const { undo, redo, clearAnnotations, undoStack, redoStack } = useDrawingStore()

  return (
    <div className="w-14 bg-gray-800/95 border-r border-gray-700/50 flex flex-col items-center py-3 backdrop-blur-sm">
      {/* Selection tool */}
      <SectionLabel>Select</SectionLabel>
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

      <Divider />

      {/* Drawing tools */}
      <SectionLabel>Draw</SectionLabel>
      <div className="flex flex-col gap-0.5">
        <ToolButton
          tool="pen"
          label="Freehand"
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
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <line x1="4" y1="20" x2="20" y2="4" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/>
            </svg>
          }
        />

        <ToolButton
          tool="arrow"
          label="Arrow"
          shortcut="A"
          icon={
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <line x1="4" y1="20" x2="18" y2="6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <polyline points="12,4 20,4 20,12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          }
        />
      </div>

      <Divider />

      {/* Shape tools */}
      <SectionLabel>Shapes</SectionLabel>
      <div className="flex flex-col gap-0.5">
        <ToolButton
          tool="rectangle"
          label="Rectangle"
          shortcut="R"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <rect x="4" y="4" width="16" height="16" rx="1"/>
            </svg>
          }
        />

        <ToolButton
          tool="circle"
          label="Ellipse"
          shortcut="C"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <ellipse cx="12" cy="12" rx="8" ry="8"/>
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
      </div>

      <Divider />

      {/* Advanced telestrator tools */}
      <SectionLabel>Effects</SectionLabel>
      <div className="flex flex-col gap-0.5">
        <ToolButton
          tool="spotlight"
          label="Spotlight"
          shortcut="S"
          icon={
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.4"/>
              <circle cx="12" cy="12" r="5" fill="currentColor"/>
            </svg>
          }
        />

        <ToolButton
          tool="magnifier"
          label="Zoom Lens"
          shortcut="M"
          icon={
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <circle cx="10" cy="10" r="6" fill="none" stroke="currentColor" strokeWidth="2"/>
              <line x1="14.5" y1="14.5" x2="20" y2="20" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              <line x1="10" y1="7" x2="10" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="7" y1="10" x2="13" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          }
        />

        <ToolButton
          tool="tracker"
          label="Player Tracker"
          shortcut="K"
          icon={
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2"/>
              <circle cx="12" cy="12" r="3" fill="currentColor"/>
              <line x1="12" y1="5" x2="12" y2="8" stroke="currentColor" strokeWidth="1.5"/>
              <line x1="12" y1="16" x2="12" y2="19" stroke="currentColor" strokeWidth="1.5"/>
              <line x1="5" y1="12" x2="8" y2="12" stroke="currentColor" strokeWidth="1.5"/>
              <line x1="16" y1="12" x2="19" y2="12" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
          }
        />
      </div>

      <Divider />

      {/* Color picker */}
      <SectionLabel>Color</SectionLabel>
      <div className="grid grid-cols-2 gap-1">
        {PRESET_COLORS.slice(0, 6).map((color) => (
          <button
            key={color}
            onClick={() => setStrokeColor(color)}
            className={`w-5 h-5 rounded-sm transition-all ${
              strokeColor === color
                ? 'ring-2 ring-white ring-offset-1 ring-offset-gray-800 scale-110'
                : 'hover:scale-110'
            }`}
            style={{ backgroundColor: color }}
            title={COLOR_NAMES[color] || color}
          />
        ))}
      </div>

      <Divider />

      {/* Stroke width */}
      <SectionLabel>Size</SectionLabel>
      <div className="flex flex-col gap-1">
        {STROKE_WIDTHS.slice(0, 4).map((width) => (
          <button
            key={width}
            onClick={() => setStrokeWidth(width)}
            className={`w-10 h-6 rounded flex items-center justify-center transition-all ${
              strokeWidth === width
                ? 'bg-blue-600/80 ring-1 ring-blue-400'
                : 'hover:bg-gray-700/80'
            }`}
            title={`${width}px stroke`}
          >
            <div
              className="bg-gray-200 rounded-full"
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
          className="w-10 h-10 flex items-center justify-center hover:bg-gray-700/80 rounded-lg text-gray-400 hover:text-white transition-all disabled:opacity-25 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          title="Undo (Ctrl+Z)"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z"/>
          </svg>
        </button>

        <button
          onClick={redo}
          disabled={redoStack.length === 0}
          className="w-10 h-10 flex items-center justify-center hover:bg-gray-700/80 rounded-lg text-gray-400 hover:text-white transition-all disabled:opacity-25 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          title="Redo (Ctrl+Y)"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22L3.9 16c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z"/>
          </svg>
        </button>

        <button
          onClick={clearAnnotations}
          className="w-10 h-10 flex items-center justify-center hover:bg-red-600/80 rounded-lg text-gray-400 hover:text-white transition-all"
          title="Clear all annotations"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
          </svg>
        </button>
      </div>
    </div>
  )
}
