import { useEffect, useReducer, useState } from 'react'
import {
  MousePointer2, Pen, Minus, ArrowUpRight, Redo, Square, Circle, Type,
  Sun, ZoomIn, Undo2, Redo2, Trash2, Eraser, Bold, Italic, Underline, Plus, RectangleHorizontal, CircleDot, Pentagon, MessageSquareText
} from 'lucide-react'
import { useToolStore, PRESET_COLORS, STROKE_WIDTHS, type ToolType } from '@/stores/toolStore'
import { useDrawingStore } from '@/stores/drawingStore'
import { fabric } from '@/lib/fabric'
import { Modal, Button } from '@/components/ui'
import { STAY_PRESETS, STAY_TOOL_TYPES, stayTiming, type StayPreset } from '@/utils/stayPreset'
import { getToolDefaults } from '@/utils/annotationDefaults'
import { useVideoStore } from '@/stores/videoStore'
import { restyleObject, STYLED_TOOL_TYPES, type AnnotationStyle } from '@/utils/annotationStyle'
import type { LineDash } from '@/utils/lineDash'
import { dashSelected } from '@/utils/dashSelected'
import {
  applyTextFormat, ensureFontLoaded, isTextObject, readTextFormat, stepFontSize,
  FONT_FAMILIES, FONT_SIZES, type TextFormat,
} from '@/utils/textFormat'

const ANNOTATION_STYLES: { value: AnnotationStyle; label: string; title: string }[] = [
  { value: 'outline', label: 'Outline', title: 'Dark outline: readable on bright ice' },
  { value: 'glow', label: 'Glow', title: 'Soft glow in the shape colour' },
  { value: 'clean', label: 'Clean', title: 'No shadow' },
]

const LINE_DASHES: { value: LineDash; label: string; title: string }[] = [
  { value: 'solid', label: 'Solid', title: 'Solid lines, arrows and pen strokes (D)' },
  { value: 'dashed', label: 'Dashed', title: 'Dashed lines, arrows and pen strokes: a pass or a skating route (D)' },
]

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
    <div className="flex flex-col items-center gap-0 flex-shrink-0 whitespace-nowrap" role="group" aria-label={label}>
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

const SELECTION_EVENTS = ['selection:created', 'selection:updated', 'selection:cleared', 'object:modified', 'object:removed']

/** Text objects in the canvas selection, re-read whenever the selection or an object changes. */
function useSelectedText() {
  const canvas = useDrawingStore((s) => s.canvas)
  const [, refresh] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    if (!canvas) return
    const onChange = () => refresh()
    SELECTION_EVENTS.forEach((event) => canvas.on(event, onChange))
    return () => SELECTION_EVENTS.forEach((event) => canvas.off(event, onChange))
  }, [canvas])
  return { selectedText: canvas ? canvas.getActiveObjects().filter(isTextObject) : [], refresh }
}

// Keeps keyboard focus in the text being edited (a text box or a callout's label) when a toolbar setting is clicked.
const keepFocus = (e: React.MouseEvent) => e.preventDefault()

function FormatToggle({ active, label, onClick, children }: {
  active: boolean; label: string; onClick: () => void; children: React.ReactNode
}) {
  return (
    <button
      onMouseDown={keepFocus}
      onClick={onClick}
      className={`w-7 h-7 rounded flex items-center justify-center transition-all ${
        active ? 'bg-accent-subtle ring-1 ring-accent text-text-primary' : 'hover:bg-surface-sunken text-text-secondary'
      }`}
      title={label}
      aria-label={label}
      aria-pressed={active}
    >
      {children}
    </button>
  )
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
  const {
    currentTool, strokeColor, strokeWidth, annotationStyle, stayPreset, textFormat, lineDash,
    setStrokeColor, setStrokeWidth, setAnnotationStyle, setStayPreset, setTextFormat, setLineDash,
  } = useToolStore()
  const { selectedText, refresh: refreshSelectedText } = useSelectedText()
  const showTextGroup = currentTool === 'text' || selectedText.length > 0
  // Show the selected text's own format; otherwise the format new text will get.
  const shownFormat = selectedText.length > 0 ? readTextFormat(selectedText[0]) : textFormat

  const changeTextFormat = (changes: Partial<TextFormat>) => {
    setTextFormat(changes)
    if (selectedText.length === 0) return
    const { canvas, saveState } = useDrawingStore.getState()
    saveState()
    selectedText.forEach((text) => applyTextFormat(text, changes))
    canvas?.requestRenderAll()
    refreshSelectedText()
  }

  const changeFontFamily = async (fontFamily: string) => {
    await ensureFontLoaded(fontFamily)
    fabric.util.clearFabricFontCache(fontFamily)
    changeTextFormat({ fontFamily })
    // The dropdown took keyboard focus; hand it back to the text being typed.
    selectedText.find((text) => text.isEditing)?.hiddenTextarea?.focus()
  }
  const { undo, redo, clearAnnotations, undoStack, redoStack, annotations } = useDrawingStore()

  const chooseAnnotationStyle = (style: AnnotationStyle) => {
    setAnnotationStyle(style)
    const { canvas, annotations: all, saveState } = useDrawingStore.getState()
    if (!canvas) return
    const selected = new Set(canvas.getActiveObjects())
    const targets = all.filter((a) => selected.has(a.object) && STYLED_TOOL_TYPES.has(a.toolType))
    if (targets.length === 0) return
    saveState()
    targets.forEach((a) => restyleObject(a.object, a.toolType, style))
    canvas.requestRenderAll()
  }
  const chooseLineDash = (value: LineDash) => {
    setLineDash(value)
    dashSelected(useDrawingStore.getState(), value)
  }
  const chooseStayPreset = (preset: StayPreset) => {
    setStayPreset(preset)
    const { canvas, annotations: all, saveState, updateAnnotation } = useDrawingStore.getState()
    if (!canvas) return
    const selected = new Set(canvas.getActiveObjects())
    const targets = all.filter((a) => selected.has(a.object) && STAY_TOOL_TYPES.has(a.toolType))
    if (targets.length === 0) return
    const { duration, fps } = useVideoStore.getState()
    saveState()
    targets.forEach((a) => {
      updateAnnotation(a.id, stayTiming(preset, a.startTime, duration, fps, getToolDefaults(a.toolType)))
    })
  }
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  return (
    <div role="toolbar" aria-label="Drawing tools" className="min-h-12 bg-surface-elevated/95 border-t border-border-subtle flex flex-wrap items-center px-3 py-1 gap-x-1 gap-y-1 backdrop-blur-sm flex-shrink-0">
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
        <ToolButton tool="erase" label="Eraser" shortcut="E" icon={<Eraser className="w-4 h-4" />} />
      </ToolGroup>

      <VerticalDivider />

      {/* Shape tools */}
      <ToolGroup label="Shapes">
        <ToolButton tool="rectangle" label="Rectangle" shortcut="R" icon={<Square className="w-4 h-4" />} />
        <ToolButton tool="circle" label="Ellipse" shortcut="C" icon={<Circle className="w-4 h-4" />} />
        <ToolButton tool="text" label="Text" shortcut="T" icon={<Type className="w-4 h-4" />} />
      </ToolGroup>

      {showTextGroup && (
        <>
          <VerticalDivider />

          {/* Text format: applies to selected text and to new text. Sits beside the Text tool so it stays on screen in a narrow window. */}
          <ToolGroup label="Text">
            <select
              value={shownFormat.fontFamily}
              onChange={(e) => void changeFontFamily(e.target.value)}
              className="h-7 w-24 rounded bg-surface-sunken border border-border-subtle text-xs text-text-primary px-1 mr-1"
              style={{ fontFamily: shownFormat.fontFamily }}
              title="Font"
              aria-label="Font"
            >
              {FONT_FAMILIES.some((f) => f.value === shownFormat.fontFamily) ? null : (
                <option value={shownFormat.fontFamily}>{shownFormat.fontFamily}</option>
              )}
              {FONT_FAMILIES.map(({ label, value }) => (
                <option key={value} value={value} style={{ fontFamily: value }}>{label}</option>
              ))}
            </select>
            <button
              onMouseDown={keepFocus}
              onClick={() => changeTextFormat({ fontSize: stepFontSize(shownFormat.fontSize, -1) })}
              disabled={shownFormat.fontSize <= FONT_SIZES[0]}
              className="w-6 h-7 rounded flex items-center justify-center text-text-secondary hover:bg-surface-sunken disabled:opacity-25 disabled:hover:bg-transparent"
              title="Smaller text"
              aria-label="Smaller text"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="w-7 text-center text-xs tabular-nums text-text-primary select-none" title="Text size">
              {shownFormat.fontSize}
            </span>
            <button
              onMouseDown={keepFocus}
              onClick={() => changeTextFormat({ fontSize: stepFontSize(shownFormat.fontSize, 1) })}
              disabled={shownFormat.fontSize >= FONT_SIZES[FONT_SIZES.length - 1]}
              className="w-6 h-7 rounded flex items-center justify-center text-text-secondary hover:bg-surface-sunken disabled:opacity-25 disabled:hover:bg-transparent"
              title="Larger text"
              aria-label="Larger text"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <FormatToggle active={shownFormat.bold} label="Bold" onClick={() => changeTextFormat({ bold: !shownFormat.bold })}>
              <Bold className="w-3.5 h-3.5" />
            </FormatToggle>
            <FormatToggle active={shownFormat.italic} label="Italic" onClick={() => changeTextFormat({ italic: !shownFormat.italic })}>
              <Italic className="w-3.5 h-3.5" />
            </FormatToggle>
            <FormatToggle active={shownFormat.underline} label="Underline" onClick={() => changeTextFormat({ underline: !shownFormat.underline })}>
              <Underline className="w-3.5 h-3.5" />
            </FormatToggle>
            <FormatToggle active={shownFormat.plate} label="Background plate" onClick={() => changeTextFormat({ plate: !shownFormat.plate })}>
              <RectangleHorizontal className="w-3.5 h-3.5" fill="currentColor" fillOpacity={0.35} />
            </FormatToggle>
          </ToolGroup>
        </>
      )}

      <VerticalDivider />

      {/* Field markings */}
      <ToolGroup label="Field">
        <ToolButton tool="ring" label="Player Ring" shortcut="G" icon={<CircleDot className="w-4 h-4" />} />
        <ToolButton tool="zone" label="Zone" shortcut="Z" icon={<Pentagon className="w-4 h-4" />} />
        <ToolButton tool="callout" label="Callout" shortcut="Shift+T" icon={<MessageSquareText className="w-4 h-4" />} />
      </ToolGroup>

      <VerticalDivider />

      {/* Effects */}
      <ToolGroup label="Effects">
        <ToolButton tool="spotlight" label="Spotlight" shortcut="S" icon={<Sun className="w-4 h-4" />} />
        <ToolButton tool="magnifier" label="Zoom Lens" shortcut="Shift+M" icon={<ZoomIn className="w-4 h-4" />} />
        {/* Player tracker hidden until tracking is reliable (tool code kept in Canvas/tools). */}
        {/* Laser pointer hidden with the audience view (it only drew on the audience window). */}
      </ToolGroup>

      <VerticalDivider />

      {/* Color swatches */}
      <ToolGroup label="Color">
        {PRESET_COLORS.slice(0, 6).map((color) => (
          <button
            key={color}
            onMouseDown={keepFocus}
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
            onMouseDown={keepFocus}
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

      {/* Contrast style */}
      <ToolGroup label="Style">
        {ANNOTATION_STYLES.map(({ value, label, title }) => (
          <button
            key={value}
            onMouseDown={keepFocus}
            onClick={() => chooseAnnotationStyle(value)}
            className={`px-2 h-7 rounded text-xs transition-all ${
              annotationStyle === value
                ? 'bg-accent-subtle ring-1 ring-accent'
                : 'hover:bg-surface-sunken'
            }`}
            title={title}
            aria-pressed={annotationStyle === value}
          >
            {label}
          </button>
        ))}
      </ToolGroup>

      <VerticalDivider />

      {/* Solid or dashed lines, arrows and pen strokes; switches selected ones */}
      <ToolGroup label="Line">
        {LINE_DASHES.map(({ value, label, title }) => (
          <button
            key={value}
            onMouseDown={keepFocus}
            onClick={() => chooseLineDash(value)}
            className={`px-2 h-7 rounded text-xs transition-all ${
              lineDash === value
                ? 'bg-accent-subtle ring-1 ring-accent'
                : 'hover:bg-surface-sunken'
            }`}
            title={title}
            aria-pressed={lineDash === value}
          >
            {label}
          </button>
        ))}
      </ToolGroup>

      <VerticalDivider />

      {/* How long new drawings stay; re-times selected drawings */}
      <ToolGroup label="Stays">
        {STAY_PRESETS.map(({ value, label }) => (
          <button
            key={String(value)}
            onMouseDown={keepFocus}
            onClick={() => chooseStayPreset(value)}
            className={`px-2 h-7 rounded text-xs whitespace-nowrap transition-all ${
              stayPreset === value
                ? 'bg-accent-subtle ring-1 ring-accent'
                : 'hover:bg-surface-sunken'
            }`}
            title={value === 'freeze' ? 'Only on the freeze; gone when play resumes' : `Stays ${label === 'To end' ? 'to the end of the video' : label}`}
            aria-pressed={stayPreset === value}
          >
            {label}
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
