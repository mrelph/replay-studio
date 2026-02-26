import { useState } from 'react'
import {
  ChevronRight, ChevronLeft, ChevronUp, ChevronDown,
  Eye, EyeOff, Lock, Unlock, Trash2, Plus, X
} from 'lucide-react'
import { useDrawingStore, type Layer } from '@/stores/drawingStore'
import { IconButton, Badge } from '@/components/ui'

const TOOL_ICONS: Record<string, string> = {
  pen: 'M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z',
  arrow: 'M7 11l5-5m0 0l5 5m-5-5v12',
  line: 'M4 12h16',
  rectangle: 'M4 6h16v12H4V6z',
  circle: 'M12 8a4 4 0 100 8 4 4 0 000-8z',
  text: 'M4 6h16M4 12h8M4 18h16',
  spotlight: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z',
  magnifier: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z',
  tracker: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z',
}

interface LayerItemProps {
  layer: Layer
  isActive: boolean
  annotationCount: number
  onSelect: () => void
  onToggleVisibility: () => void
  onToggleLock: () => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onRename: (name: string) => void
  isFirst: boolean
  isLast: boolean
  canDelete: boolean
}

function LayerItem({
  layer,
  isActive,
  annotationCount,
  onSelect,
  onToggleVisibility,
  onToggleLock,
  onDelete,
  onMoveUp,
  onMoveDown,
  onRename,
  isFirst,
  isLast,
  canDelete,
}: LayerItemProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editName, setEditName] = useState(layer.name)

  const handleRename = () => {
    if (editName.trim()) {
      onRename(editName.trim())
    } else {
      setEditName(layer.name)
    }
    setIsEditing(false)
  }

  return (
    <div
      className={`group border-l-2 ${
        isActive ? 'border-accent bg-accent-subtle' : 'border-transparent hover:bg-surface-sunken/50'
      }`}
    >
      <div className="flex items-center px-2 py-1.5">
        {/* Color indicator */}
        <div
          className="w-3 h-3 rounded-full mr-2 flex-shrink-0"
          style={{ backgroundColor: layer.color }}
        />

        {/* Layer name */}
        {isEditing ? (
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleRename()
              if (e.key === 'Escape') {
                setEditName(layer.name)
                setIsEditing(false)
              }
            }}
            className="flex-1 px-1 py-0.5 bg-surface-sunken rounded text-sm text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
            autoFocus
          />
        ) : (
          <button
            onClick={onSelect}
            onDoubleClick={() => setIsEditing(true)}
            className={`flex-1 text-left text-sm truncate ${
              layer.visible ? 'text-text-secondary' : 'text-text-disabled line-through'
            }`}
          >
            {layer.name}
          </button>
        )}

        {/* Annotation count badge */}
        {annotationCount > 0 && (
          <Badge className="mr-1">{annotationCount}</Badge>
        )}

        {/* Controls */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <IconButton onClick={onMoveUp} disabled={isFirst} title="Move up" size="sm">
            <ChevronUp className="w-3 h-3" />
          </IconButton>

          <IconButton onClick={onMoveDown} disabled={isLast} title="Move down" size="sm">
            <ChevronDown className="w-3 h-3" />
          </IconButton>

          <IconButton
            onClick={onToggleVisibility}
            title={layer.visible ? 'Hide layer' : 'Show layer'}
            size="sm"
            className={layer.visible ? '' : 'text-text-disabled'}
          >
            {layer.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
          </IconButton>

          <IconButton
            onClick={onToggleLock}
            title={layer.locked ? 'Unlock layer' : 'Lock layer'}
            size="sm"
            className={layer.locked ? 'text-warning' : ''}
          >
            {layer.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
          </IconButton>

          <IconButton
            onClick={onDelete}
            disabled={!canDelete}
            title="Delete layer"
            size="sm"
            className="hover:text-error"
          >
            <Trash2 className="w-3 h-3" />
          </IconButton>
        </div>
      </div>
    </div>
  )
}

interface AnnotationItemProps {
  annotation: {
    id: string
    toolType: string
    startTime: number
    endTime: number
    name?: string
  }
  isSelected: boolean
  onSelect: () => void
  onDelete: () => void
}

function AnnotationItem({ annotation, isSelected, onSelect, onDelete }: AnnotationItemProps) {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const iconPath = TOOL_ICONS[annotation.toolType] || TOOL_ICONS.pen

  return (
    <div
      onClick={onSelect}
      className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer group ${
        isSelected ? 'bg-accent-subtle' : 'hover:bg-surface-sunken/50'
      }`}
    >
      <svg className="w-3.5 h-3.5 text-text-disabled flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={iconPath} />
      </svg>
      <span className="text-xs text-text-secondary flex-1 truncate">
        {annotation.name || annotation.toolType}
      </span>
      <span className="text-xs text-text-disabled">
        {formatTime(annotation.startTime)}-{formatTime(annotation.endTime)}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        className="p-0.5 text-text-disabled hover:text-error opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}

interface LayerPanelProps {
  isOpen: boolean
  onToggle: () => void
}

export default function LayerPanel({ isOpen, onToggle }: LayerPanelProps) {
  const {
    layers,
    annotations,
    activeLayerId,
    selectedAnnotationId,
    addLayer,
    removeLayer,
    updateLayer,
    setActiveLayer,
    moveLayerUp,
    moveLayerDown,
    selectAnnotation,
    removeAnnotation,
    getAnnotationsForLayer,
  } = useDrawingStore()

  const [expandedLayers, setExpandedLayers] = useState<Set<number>>(new Set([1]))

  const toggleLayerExpanded = (layerId: number) => {
    setExpandedLayers(prev => {
      const next = new Set(prev)
      if (next.has(layerId)) {
        next.delete(layerId)
      } else {
        next.add(layerId)
      }
      return next
    })
  }

  if (!isOpen) {
    return (
      <button
        onClick={onToggle}
        className="absolute right-0 top-1/2 -translate-y-1/2 bg-surface-elevated hover:bg-surface-sunken p-2 rounded-l-lg text-text-secondary hover:text-text-primary transition-colors z-20 border border-r-0 border-border-subtle"
        title="Open Layer Panel"
      >
        <ChevronLeft className="w-4 h-4" />
      </button>
    )
  }

  return (
    <div className="w-56 bg-surface-elevated border-l border-border-subtle flex flex-col animate-slide-in-right">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle">
        <h3 className="text-sm font-medium text-text-secondary">Layers</h3>
        <div className="flex items-center gap-1">
          <IconButton onClick={addLayer} title="Add layer" size="sm">
            <Plus className="w-4 h-4" />
          </IconButton>
          <IconButton onClick={onToggle} title="Close panel" size="sm">
            <ChevronRight className="w-4 h-4" />
          </IconButton>
        </div>
      </div>

      {/* Layer list */}
      <div className="flex-1 overflow-y-auto">
        {layers.map((layer, index) => {
          const layerAnnotations = getAnnotationsForLayer(layer.id)
          const isExpanded = expandedLayers.has(layer.id)

          return (
            <div key={layer.id}>
              {/* Layer header */}
              <div className="flex items-center">
                <button
                  onClick={() => toggleLayerExpanded(layer.id)}
                  className="p-1.5 text-text-disabled hover:text-text-secondary"
                >
                  <ChevronRight
                    className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                  />
                </button>
                <div className="flex-1">
                  <LayerItem
                    layer={layer}
                    isActive={layer.id === activeLayerId}
                    annotationCount={layerAnnotations.length}
                    onSelect={() => setActiveLayer(layer.id)}
                    onToggleVisibility={() => updateLayer(layer.id, { visible: !layer.visible })}
                    onToggleLock={() => updateLayer(layer.id, { locked: !layer.locked })}
                    onDelete={() => removeLayer(layer.id)}
                    onMoveUp={() => moveLayerUp(layer.id)}
                    onMoveDown={() => moveLayerDown(layer.id)}
                    onRename={(name) => updateLayer(layer.id, { name })}
                    isFirst={index === 0}
                    isLast={index === layers.length - 1}
                    canDelete={layers.length > 1}
                  />
                </div>
              </div>

              {/* Annotations in this layer */}
              {isExpanded && layerAnnotations.length > 0 && (
                <div className="ml-4 border-l border-border-subtle">
                  {layerAnnotations.map(ann => (
                    <AnnotationItem
                      key={ann.id}
                      annotation={ann}
                      isSelected={ann.id === selectedAnnotationId}
                      onSelect={() => selectAnnotation(ann.id)}
                      onDelete={() => removeAnnotation(ann.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Footer with stats */}
      <div className="px-3 py-2 border-t border-border-subtle text-xs text-text-disabled">
        {layers.length} layer{layers.length !== 1 ? 's' : ''} | {annotations.length} annotation{annotations.length !== 1 ? 's' : ''}
      </div>
    </div>
  )
}
