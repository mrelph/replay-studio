import { useState } from 'react'
import { useDrawingStore, type Layer } from '@/stores/drawingStore'

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
        isActive ? 'border-blue-500 bg-gray-800' : 'border-transparent hover:bg-gray-800/50'
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
            className="flex-1 px-1 py-0.5 bg-gray-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
            autoFocus
          />
        ) : (
          <button
            onClick={onSelect}
            onDoubleClick={() => setIsEditing(true)}
            className={`flex-1 text-left text-sm truncate ${
              layer.visible ? 'text-gray-200' : 'text-gray-500 line-through'
            }`}
          >
            {layer.name}
          </button>
        )}

        {/* Annotation count badge */}
        {annotationCount > 0 && (
          <span className="px-1.5 py-0.5 bg-gray-700 rounded text-xs text-gray-400 mr-1">
            {annotationCount}
          </span>
        )}

        {/* Controls */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Move up */}
          <button
            onClick={onMoveUp}
            disabled={isFirst}
            className="p-1 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
            title="Move up"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
          </button>

          {/* Move down */}
          <button
            onClick={onMoveDown}
            disabled={isLast}
            className="p-1 text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
            title="Move down"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Visibility toggle */}
          <button
            onClick={onToggleVisibility}
            className={`p-1 ${layer.visible ? 'text-gray-400 hover:text-white' : 'text-gray-600'}`}
            title={layer.visible ? 'Hide layer' : 'Show layer'}
          >
            {layer.visible ? (
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            ) : (
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
            )}
          </button>

          {/* Lock toggle */}
          <button
            onClick={onToggleLock}
            className={`p-1 ${layer.locked ? 'text-yellow-500' : 'text-gray-400 hover:text-white'}`}
            title={layer.locked ? 'Unlock layer' : 'Lock layer'}
          >
            {layer.locked ? (
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            ) : (
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
              </svg>
            )}
          </button>

          {/* Delete */}
          <button
            onClick={onDelete}
            disabled={!canDelete}
            className="p-1 text-gray-400 hover:text-red-400 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Delete layer"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
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
        isSelected ? 'bg-blue-600/30' : 'hover:bg-gray-800/50'
      }`}
    >
      <svg className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={iconPath} />
      </svg>
      <span className="text-xs text-gray-300 flex-1 truncate">
        {annotation.name || annotation.toolType}
      </span>
      <span className="text-xs text-gray-500">
        {formatTime(annotation.startTime)}-{formatTime(annotation.endTime)}
      </span>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        className="p-0.5 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
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
        className="absolute right-0 top-1/2 -translate-y-1/2 bg-gray-800 hover:bg-gray-700 p-2 rounded-l-lg text-gray-400 hover:text-white transition-colors z-20"
        title="Open Layer Panel"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
      </button>
    )
  }

  return (
    <div className="w-56 bg-gray-800 border-l border-gray-700 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
        <h3 className="text-sm font-medium text-gray-200">Layers</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={addLayer}
            className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors"
            title="Add layer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
          <button
            onClick={onToggle}
            className="p-1 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors"
            title="Close panel"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
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
                  className="p-1.5 text-gray-500 hover:text-gray-300"
                >
                  <svg
                    className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
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
                <div className="ml-4 border-l border-gray-700">
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
      <div className="px-3 py-2 border-t border-gray-700 text-xs text-gray-500">
        {layers.length} layer{layers.length !== 1 ? 's' : ''} | {annotations.length} annotation{annotations.length !== 1 ? 's' : ''}
      </div>
    </div>
  )
}
