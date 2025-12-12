import { useRef, useState, useCallback, useEffect } from 'react'
import { useVideoStore } from '@/stores/videoStore'
import { useDrawingStore, type Annotation } from '@/stores/drawingStore'

interface TimelineMarkerProps {
  annotation: Annotation
  duration: number
  isSelected: boolean
  onSelect: () => void
  onUpdateTime: (startTime: number, endTime: number) => void
}

function TimelineMarker({ annotation, duration, isSelected, onSelect, onUpdateTime }: TimelineMarkerProps) {
  const [isDragging, setIsDragging] = useState<'move' | 'start' | 'end' | null>(null)
  const markerRef = useRef<HTMLDivElement>(null)

  const left = (annotation.startTime / duration) * 100
  const width = ((annotation.endTime - annotation.startTime) / duration) * 100

  const handleMouseDown = (e: React.MouseEvent, type: 'move' | 'start' | 'end') => {
    e.stopPropagation()
    setIsDragging(type)
    onSelect()
  }

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const timeline = markerRef.current?.parentElement
      if (!timeline) return

      const rect = timeline.getBoundingClientRect()
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      const time = x * duration

      if (isDragging === 'move') {
        const annotationDuration = annotation.endTime - annotation.startTime
        const newStart = Math.max(0, Math.min(duration - annotationDuration, time - annotationDuration / 2))
        onUpdateTime(newStart, newStart + annotationDuration)
      } else if (isDragging === 'start') {
        const newStart = Math.min(annotation.endTime - 0.1, time)
        onUpdateTime(Math.max(0, newStart), annotation.endTime)
      } else if (isDragging === 'end') {
        const newEnd = Math.max(annotation.startTime + 0.1, time)
        onUpdateTime(annotation.startTime, Math.min(duration, newEnd))
      }
    }

    const handleMouseUp = () => {
      setIsDragging(null)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, annotation, duration, onUpdateTime])

  // Get color based on annotation type
  const getColor = () => {
    const id = annotation.id
    if (id.startsWith('path')) return 'bg-red-500'
    if (id.startsWith('arrow')) return 'bg-orange-500'
    if (id.startsWith('line')) return 'bg-yellow-500'
    if (id.startsWith('rectangle')) return 'bg-green-500'
    if (id.startsWith('circle')) return 'bg-cyan-500'
    if (id.startsWith('text')) return 'bg-blue-500'
    if (id.startsWith('spotlight')) return 'bg-yellow-400'
    if (id.startsWith('magnifier')) return 'bg-cyan-400'
    if (id.startsWith('tracker')) return 'bg-purple-500'
    return 'bg-gray-500'
  }

  return (
    <div
      ref={markerRef}
      className={`absolute h-6 rounded cursor-pointer group ${getColor()} ${
        isSelected ? 'ring-2 ring-white ring-offset-1 ring-offset-gray-900' : 'opacity-80 hover:opacity-100'
      }`}
      style={{
        left: `${left}%`,
        width: `${Math.max(width, 0.5)}%`,
        top: `${(annotation.layer % 3) * 28 + 4}px`,
      }}
      onMouseDown={(e) => handleMouseDown(e, 'move')}
    >
      {/* Start handle */}
      <div
        className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 rounded-l"
        onMouseDown={(e) => handleMouseDown(e, 'start')}
      />
      {/* End handle */}
      <div
        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 rounded-r"
        onMouseDown={(e) => handleMouseDown(e, 'end')}
      />
      {/* Label */}
      <div className="px-2 text-xs text-white truncate leading-6">
        {annotation.id.split('-')[0]}
      </div>
    </div>
  )
}

export default function AnnotationTimeline() {
  const timelineRef = useRef<HTMLDivElement>(null)
  const { currentTime, duration, seek, inPoint, outPoint } = useVideoStore()
  const { annotations, selectedAnnotationId, selectAnnotation, updateAnnotation, removeAnnotation } = useDrawingStore()

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  const handleTimelineClick = useCallback((e: React.MouseEvent) => {
    if (!timelineRef.current || duration === 0) return

    const rect = timelineRef.current.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    seek(x * duration)
  }, [duration, seek])

  const handleUpdateTime = useCallback((id: string, startTime: number, endTime: number) => {
    updateAnnotation(id, { startTime, endTime })
  }, [updateAnnotation])

  const handleDeleteSelected = useCallback(() => {
    if (selectedAnnotationId) {
      removeAnnotation(selectedAnnotationId)
    }
  }, [selectedAnnotationId, removeAnnotation])

  // Keyboard handler for delete
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedAnnotationId) {
        const target = e.target as HTMLElement
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          handleDeleteSelected()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedAnnotationId, handleDeleteSelected])

  if (duration === 0) return null

  return (
    <div className="bg-gray-800 border-t border-gray-700 px-4 py-2">
      {/* Timeline header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-400 uppercase tracking-wide">Annotations Timeline</span>
        <div className="flex items-center gap-2">
          {selectedAnnotationId && (
            <button
              onClick={handleDeleteSelected}
              className="px-2 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
            >
              Delete
            </button>
          )}
          <span className="text-xs text-gray-500">{annotations.length} annotations</span>
        </div>
      </div>

      {/* Timeline track */}
      <div
        ref={timelineRef}
        className="relative h-24 bg-gray-900 rounded cursor-pointer overflow-hidden"
        onClick={handleTimelineClick}
      >
        {/* Time markers */}
        <div className="absolute inset-x-0 top-0 h-4 flex border-b border-gray-700">
          {Array.from({ length: 11 }).map((_, i) => (
            <div key={i} className="flex-1 border-r border-gray-700 last:border-r-0">
              <span className="text-[10px] text-gray-500 pl-1">
                {formatTime((duration * i) / 10)}
              </span>
            </div>
          ))}
        </div>

        {/* In/Out point markers */}
        {inPoint !== null && (
          <div
            className="absolute top-4 bottom-0 w-0.5 bg-green-500 z-20"
            style={{ left: `${(inPoint / duration) * 100}%` }}
          />
        )}
        {outPoint !== null && (
          <div
            className="absolute top-4 bottom-0 w-0.5 bg-red-500 z-20"
            style={{ left: `${(outPoint / duration) * 100}%` }}
          />
        )}
        {inPoint !== null && outPoint !== null && (
          <div
            className="absolute top-4 bottom-0 bg-blue-500/10 z-10"
            style={{
              left: `${(inPoint / duration) * 100}%`,
              width: `${((outPoint - inPoint) / duration) * 100}%`,
            }}
          />
        )}

        {/* Annotation markers */}
        <div className="absolute inset-x-0 top-4 bottom-0">
          {annotations.map((annotation) => (
            <TimelineMarker
              key={annotation.id}
              annotation={annotation}
              duration={duration}
              isSelected={selectedAnnotationId === annotation.id}
              onSelect={() => selectAnnotation(annotation.id)}
              onUpdateTime={(start, end) => handleUpdateTime(annotation.id, start, end)}
            />
          ))}
        </div>

        {/* Playhead */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white z-30 pointer-events-none"
          style={{ left: `${progress}%` }}
        >
          <div className="absolute -top-0 left-1/2 -translate-x-1/2 w-3 h-3 bg-white rotate-45" />
        </div>
      </div>

      {/* Selected annotation details */}
      {selectedAnnotationId && (
        <AnnotationDetails
          annotation={annotations.find((a) => a.id === selectedAnnotationId)!}
          onUpdate={(updates) => updateAnnotation(selectedAnnotationId, updates)}
          onDelete={handleDeleteSelected}
        />
      )}
    </div>
  )
}

interface AnnotationDetailsProps {
  annotation: Annotation
  onUpdate: (updates: Partial<Annotation>) => void
  onDelete: () => void
}

function AnnotationDetails({ annotation, onUpdate, onDelete }: AnnotationDetailsProps) {
  return (
    <div className="mt-2 p-2 bg-gray-900 rounded flex items-center gap-4">
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400">Type:</span>
        <span className="text-xs text-white font-medium">{annotation.id.split('-')[0]}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400">Start:</span>
        <input
          type="number"
          step="0.1"
          value={annotation.startTime.toFixed(2)}
          onChange={(e) => onUpdate({ startTime: Math.max(0, parseFloat(e.target.value) || 0) })}
          className="w-20 px-2 py-1 bg-gray-800 text-white text-xs rounded border border-gray-700"
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400">End:</span>
        <input
          type="number"
          step="0.1"
          value={annotation.endTime.toFixed(2)}
          onChange={(e) => onUpdate({ endTime: Math.max(annotation.startTime + 0.1, parseFloat(e.target.value) || 0) })}
          className="w-20 px-2 py-1 bg-gray-800 text-white text-xs rounded border border-gray-700"
        />
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400">Layer:</span>
        <select
          value={annotation.layer}
          onChange={(e) => onUpdate({ layer: parseInt(e.target.value) })}
          className="px-2 py-1 bg-gray-800 text-white text-xs rounded border border-gray-700"
        >
          {[0, 1, 2].map((layer) => (
            <option key={layer} value={layer}>Layer {layer + 1}</option>
          ))}
        </select>
      </div>
      <div className="flex-1" />
      <button
        onClick={onDelete}
        className="px-3 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
      >
        Delete
      </button>
    </div>
  )
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}
