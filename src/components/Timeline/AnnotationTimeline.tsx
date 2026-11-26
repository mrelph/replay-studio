import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import { Trash2, Snowflake } from 'lucide-react'
import { useVideoStore } from '@/stores/videoStore'
import { useDrawingStore, type Annotation } from '@/stores/drawingStore'
import { useClipStore } from '@/stores/clipStore'
import { useSpeedStore } from '@/stores/speedStore'
import SpeedLane, { SpeedRegionDetails } from './SpeedLane'
import VoiceLane, { VoiceClipDetails, VoiceDuckSelect } from './VoiceLane'
import { useVoiceStore } from '@/stores/voiceStore'
import { stopVoice } from '@/voice/voicePlayback'
import { deleteKeyTarget } from '@/utils/speedLane'
import { PRESET_COLORS } from '@/stores/toolStore'
import { Button, Select } from '@/components/ui'
import type { Clip } from '@/types/clip'
import WaveformDisplay from './WaveformDisplay'
import { revealKind } from '@/export/reveal'
import { recolorKeepingAlpha } from '@/utils/surfaceShape'
import { parseDrawIn } from '@/utils/drawInInput'
import { snapTime, snapTargets, freezeFieldState, frameWithin, dragEndSyncTimes, startsOnFrameStart, barStart, carrierDropCollides } from '@/utils/timelineSnap'
import { assignRows, rowCount, autoLaneHeight, hiddenRowsBelow } from '@/utils/timelineRows'
import { setFrameFreeze } from '@/utils/freezeMarkers'
import { findFreezeCarrierAt } from '@/utils/freezeFrame'

interface ClipBarProps {
  clip: Clip
  index: number
  duration: number
  isSelected: boolean
  onSelect: () => void
  onUpdateRange: (start: number, end: number) => void
}

// A thin lane bar for one clip: click selects + seeks, edge handles resize.
// Kept intentionally simple (no "move whole bar" drag) since edges alone
// cover the coach's workflow, and it keeps 30+ bars cheap to re-render.
function ClipBar({ clip, index, duration, isSelected, onSelect, onUpdateRange }: ClipBarProps) {
  const [isDragging, setIsDragging] = useState<'start' | 'end' | null>(null)
  const [isHovered, setIsHovered] = useState(false)
  const barRef = useRef<HTMLDivElement>(null)

  const left = (clip.start / duration) * 100
  const width = ((clip.end - clip.start) / duration) * 100

  const handleEdgeMouseDown = (e: React.MouseEvent, edge: 'start' | 'end') => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(edge)
    onSelect()
  }

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const lane = barRef.current?.parentElement
      if (!lane) return

      const rect = lane.getBoundingClientRect()
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      const time = x * duration

      if (isDragging === 'start') {
        onUpdateRange(Math.max(0, Math.min(time, clip.end)), clip.end)
      } else {
        onUpdateRange(clip.start, Math.min(duration, Math.max(time, clip.start)))
      }
    }

    const handleMouseUp = () => setIsDragging(null)

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, clip.start, clip.end, duration, onUpdateRange])

  return (
    <div
      ref={barRef}
      role="button"
      tabIndex={0}
      aria-label={`Clip ${index + 1}: ${clip.name}`}
      aria-pressed={isSelected}
      className={`absolute top-0.5 bottom-0.5 rounded-sm cursor-pointer group ${
        isSelected ? 'ring-2 ring-accent z-10' : 'opacity-85 hover:opacity-100'
      }`}
      style={{ left: `${left}%`, width: `${Math.max(width, 0.4)}%`, backgroundColor: clip.color }}
      onClick={(e) => {
        e.stopPropagation()
        onSelect()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {isHovered && !isDragging && (
        <div className="chrome-reset absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-surface-elevated text-text-primary text-xs rounded shadow-lg border border-border-subtle pointer-events-none z-30 whitespace-nowrap">
          <span className="font-medium">{clip.name}</span>
          <span className="text-text-disabled ml-1.5">{formatTime(clip.start)}&ndash;{formatTime(clip.end)}</span>
          {clip.tags.length > 0 && <span className="text-text-tertiary ml-1.5">{clip.tags.join(', ')}</span>}
        </div>
      )}
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium text-white leading-none truncate px-1 pointer-events-none">
        {index + 1}
      </span>
      {/* Start handle */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize opacity-0 group-hover:opacity-100 hover:bg-white/40"
        onMouseDown={(e) => handleEdgeMouseDown(e, 'start')}
        onClick={(e) => e.stopPropagation()}
      />
      {/* End handle */}
      <div
        className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize opacity-0 group-hover:opacity-100 hover:bg-white/40"
        onMouseDown={(e) => handleEdgeMouseDown(e, 'end')}
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  )
}

interface TimelineMarkerProps {
  annotation: Annotation
  duration: number
  isSelected: boolean
  onSelect: () => void
  row: number
  onUpdateTime: (startTime: number, endTime: number) => void
  onDragStart: () => void
  onDragEnd: () => void
}

function TimelineMarker({ annotation, duration, isSelected, row, onSelect, onUpdateTime, onDragStart, onDragEnd }: TimelineMarkerProps) {
  const [isDragging, setIsDragging] = useState<'move' | 'start' | 'end' | null>(null)
  const [isHovered, setIsHovered] = useState(false)
  const markerRef = useRef<HTMLDivElement>(null)
  const dragStartRef = useRef(annotation.startTime)
  const dragEndRef = useRef(annotation.endTime)

  const left = (annotation.startTime / duration) * 100
  const width = ((annotation.endTime - annotation.startTime) / duration) * 100

  const handleMouseDown = (e: React.MouseEvent, type: 'move' | 'start' | 'end') => {
    e.stopPropagation()
    dragStartRef.current = annotation.startTime
    dragEndRef.current = annotation.endTime
    setIsDragging(type)
    onDragStart()
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
      const { fps, currentTime } = useVideoStore.getState()
      const targets = snapTargets(useDrawingStore.getState().annotations, currentTime, annotation)
      const snap = (t: number) => snapTime(t, targets, rect.width / duration, fps, e.altKey)

      const exact = startsOnFrameStart(annotation)
      if (isDragging === 'move') {
        const annotationDuration = annotation.endTime - annotation.startTime
        const newStart = frameWithin(snap(time - annotationDuration / 2), 0, duration - annotationDuration, fps, exact)
        onUpdateTime(newStart, newStart + annotationDuration)
      } else if (isDragging === 'start') {
        const newStart = frameWithin(snap(time), 0, annotation.endTime - 0.1, fps, exact)
        onUpdateTime(newStart, annotation.endTime)
      } else if (isDragging === 'end') {
        const newEnd = frameWithin(snap(time), annotation.startTime + 0.1, duration, fps)
        onUpdateTime(annotation.startTime, newEnd)
      }
    }

    const handleMouseUp = () => {
      setIsDragging(null)
      onDragEnd()
      const finalStart = useDrawingStore.getState().annotations.find((a) => a.id === annotation.id)?.startTime
      if (finalStart === undefined) return
      // One freeze per frame: a carrier dropped on another carrier's frame goes back.
      if (carrierDropCollides(useDrawingStore.getState().annotations, annotation.id, useVideoStore.getState().fps)) {
        onUpdateTime(dragStartRef.current, dragEndRef.current)
        return
      }
      const times = dragEndSyncTimes(annotation.toolType, isDragging, dragStartRef.current, finalStart)
      if (times) useDrawingStore.getState().syncFrames(times)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, annotation, duration, onUpdateTime, onDragEnd])

  // A marker removed mid-drag never sees mouseup; release the frozen rows.
  useEffect(() => {
    if (!isDragging) return
    return onDragEnd
  }, [isDragging, onDragEnd])

  // Get color based on annotation type
  const getColor = () => {
    const id = annotation.id
    if (id.startsWith('path')) return 'bg-red-500/80'
    if (id.startsWith('arc-arrow')) return 'bg-amber-500/80'
    if (id.startsWith('arrow')) return 'bg-orange-500/80'
    if (id.startsWith('line')) return 'bg-yellow-500/80'
    if (id.startsWith('rectangle')) return 'bg-green-500/80'
    if (id.startsWith('circle')) return 'bg-cyan-500/80'
    if (id.startsWith('text')) return 'bg-blue-500/80'
    if (id.startsWith('spotlight')) return 'bg-yellow-400/80'
    if (id.startsWith('magnifier')) return 'bg-cyan-400/80'
    if (id.startsWith('ring')) return 'bg-pink-500/80'
    if (id.startsWith('zone')) return 'bg-lime-500/80'
    if (id.startsWith('callout')) return 'bg-indigo-500/80'
    if (id.startsWith('tracker')) return 'bg-purple-500/80'
    if (id.startsWith('freeze')) return 'bg-sky-400/80'
    return 'bg-text-tertiary'
  }

  const formatMarkerTime = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  return (
    <div
      ref={markerRef}
      className={`absolute h-6 rounded-md cursor-pointer group ${getColor()} ${
        isSelected ? 'ring-2 ring-accent ring-offset-1 ring-offset-surface-sunken' : 'opacity-80 hover:opacity-100'
      }`}
      style={{
        left: `${left}%`,
        width: `${Math.max(width, 0.5)}%`,
        top: `${row * 28 + 4}px`,
      }}
      onMouseDown={(e) => handleMouseDown(e, 'move')}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Hover tooltip */}
      {isHovered && !isDragging && (
        <div className="chrome-reset absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 bg-surface-elevated text-text-primary text-xs rounded shadow-lg border border-border-subtle pointer-events-none z-30 whitespace-nowrap">
          <span className="font-medium capitalize">{annotation.toolType || annotation.id.split('-')[0]}</span>
          <span className="text-text-disabled ml-1.5">{formatMarkerTime(annotation.startTime)}-{formatMarkerTime(annotation.endTime)}</span>
        </div>
      )}
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
      <div className="px-2 text-xs text-white truncate leading-6 flex items-center gap-1">
        {annotation.freezeDuration ? (
          <>
            <Snowflake className="w-3 h-3 flex-shrink-0" />
            <span>{annotation.freezeDuration}s</span>
          </>
        ) : (
          annotation.id.split('-')[0]
        )}
      </div>
    </div>
  )
}

export default function AnnotationTimeline() {
  const timelineRef = useRef<HTMLDivElement>(null)
  const { currentTime, duration, seek, inPoint, outPoint } = useVideoStore()
  const { annotations, selectedAnnotationId, selectAnnotation, updateAnnotation, removeAnnotation } = useDrawingStore()
  const { clips, selectedClipId, selectClip, updateClip } = useClipStore()
  const speedRegions = useSpeedStore((s) => s.regions)
  const selectedSpeedId = useSpeedStore((s) => s.selectedId)
  const selectedSpeedRegion = speedRegions.find((r) => r.id === selectedSpeedId)
  const hasSpeedLane = speedRegions.length > 0
  const voiceClips = useVoiceStore((s) => s.clips)
  const selectedVoiceId = useVoiceStore((s) => s.selectedId)
  const selectedVoiceClip = voiceClips.find((c) => c.id === selectedVoiceId)
  const hasVoiceLane = voiceClips.length > 0
  const laneTopPx = 32 + (hasSpeedLane ? 16 : 0) + (hasVoiceLane ? 16 : 0)
  const laneTop = laneTopPx === 64 ? 'top-16' : laneTopPx === 48 ? 'top-12' : 'top-8'
  const voiceLaneTop = hasSpeedLane ? 'top-12' : 'top-8'
  const [userHeight, setUserHeight] = useState<number | null>(null)
  const [laneScroll, setLaneScroll] = useState(0)
  const laneRef = useRef<HTMLDivElement>(null)
  const [trackWidth, setTrackWidth] = useState(0)
  const isResizingRef = useRef(false)
  const [markerDragging, setMarkerDragging] = useState(false)
  const computedRows = useMemo(
    () => assignRows(annotations, 0.005 * duration),
    [annotations, duration],
  )
  // Rows stay put while a bar is dragged so it does not jump under the cursor.
  const rowsRef = useRef(computedRows)
  if (!markerDragging) rowsRef.current = computedRows
  const rows = rowsRef.current
  const totalRows = rowCount(rows)
  const containerHeight = userHeight ?? autoLaneHeight(totalRows, laneTopPx)
  const laneViewport = Math.max(0, containerHeight - laneTopPx)
  const hiddenBelow = hiddenRowsBelow(laneScroll, laneViewport, totalRows)
  const scrolledDown = laneScroll > 0
  const handleMarkerDragStart = useCallback(() => setMarkerDragging(true), [])
  const handleMarkerDragEnd = useCallback(() => setMarkerDragging(false), [])

  useEffect(() => {
    setLaneScroll(laneRef.current?.scrollTop ?? 0)
  }, [totalRows, containerHeight])

  // Track the timeline div width for waveform rendering
  useEffect(() => {
    const el = timelineRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setTrackWidth(entry.contentRect.width)
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [duration]) // re-attach when timeline appears (duration > 0)

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  const handleTimelineClick = useCallback((e: React.MouseEvent) => {
    if (!timelineRef.current || duration === 0) return

    const rect = timelineRef.current.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width
    seek(x * duration)
    // A click that reaches the track landed on empty space (bars stop propagation).
    useSpeedStore.getState().select(null)
    useVoiceStore.getState().select(null)
  }, [duration, seek])

  const handleUpdateTime = useCallback((id: string, startTime: number, endTime: number) => {
    updateAnnotation(id, { startTime, endTime })
  }, [updateAnnotation])

  const handleDeleteSelected = useCallback(() => {
    if (selectedAnnotationId) {
      removeAnnotation(selectedAnnotationId)
    }
  }, [selectedAnnotationId, removeAnnotation])

  // Selecting an annotation (here or on the canvas) clears the speed region selection
  useEffect(() => {
    if (selectedAnnotationId) {
      useSpeedStore.getState().select(null)
      useVoiceStore.getState().select(null)
    }
  }, [selectedAnnotationId])

  // Keyboard handler for delete: a selected speed region wins over an annotation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      const what = deleteKeyTarget(
        { key: e.key, tagName: target.tagName, isContentEditable: target.isContentEditable },
        selectedSpeedId,
        selectedAnnotationId,
        selectedVoiceId,
      )
      if (what === 'voice' && selectedVoiceId) {
        stopVoice()
        useVoiceStore.getState().remove(selectedVoiceId)
      } else if (what === 'region' && selectedSpeedId) useSpeedStore.getState().remove(selectedSpeedId)
      else if (what === 'deselect-region') useSpeedStore.getState().select(null)
      else if (what === 'annotation') handleDeleteSelected()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedSpeedId, selectedAnnotationId, selectedVoiceId, handleDeleteSelected])

  // Resize handle for timeline height
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isResizingRef.current = true
    const startY = e.clientY
    const startHeight = containerHeight

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return
      const delta = startY - e.clientY
      setUserHeight(Math.max(80, Math.min(480, startHeight + delta)))
    }

    const handleMouseUp = () => {
      isResizingRef.current = false
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }, [containerHeight])

  if (duration === 0) return null

  return (
    <div className="bg-surface-elevated border-t border-border-subtle px-4 py-2">
      {/* Resize handle */}
      <div
        className="h-1.5 -mt-3 mb-1 cursor-ns-resize group flex items-center justify-center"
        onMouseDown={handleResizeStart}
        onDoubleClick={() => setUserHeight(null)}
        title="Drag to resize. Double-click to fit."
      >
        <div className="w-10 h-1 rounded-full bg-border-subtle group-hover:bg-text-disabled transition-colors" />
      </div>

      {/* Timeline header */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-text-tertiary uppercase tracking-wide">Annotations Timeline</span>
        <div className="flex items-center gap-2">
          {hasVoiceLane && <VoiceDuckSelect />}
          {selectedAnnotationId && (
            <Button onClick={handleDeleteSelected} variant="danger" size="sm">
              <Trash2 className="w-3 h-3" />
              Delete
            </Button>
          )}
          <span className="text-xs text-text-disabled">
            {annotations.length} annotations{clips.length > 0 ? ` · ${clips.length} clips` : ''}
          </span>
        </div>
      </div>

      {/* Timeline track */}
      <div
        ref={timelineRef}
        role="region"
        aria-label="Annotation timeline"
        className="relative bg-surface-sunken rounded-lg cursor-pointer overflow-hidden"
        style={{ height: containerHeight }}
        onClick={handleTimelineClick}
      >
        {/* Audio waveform background */}
        <WaveformDisplay width={trackWidth} height={containerHeight} />

        {/* Time markers */}
        <div className="absolute inset-x-0 top-0 h-4 flex border-b border-border-subtle">
          {Array.from({ length: 11 }).map((_, i) => (
            <div key={i} className="flex-1 border-r border-border-subtle last:border-r-0">
              <span className="text-[10px] text-text-disabled pl-1">
                {formatTime((duration * i) / 10)}
              </span>
            </div>
          ))}
        </div>

        {/* Clip bars lane */}
        <div className="absolute inset-x-0 top-4 h-4 bg-surface-elevated/40 border-b border-border-subtle/50">
          {clips.map((clip, index) => (
            <ClipBar
              key={clip.id}
              clip={clip}
              index={index}
              duration={duration}
              isSelected={selectedClipId === clip.id}
              onSelect={() => {
                selectClip(clip.id)
                seek(clip.start)
              }}
              onUpdateRange={(start, end) => updateClip(clip.id, { start, end })}
            />
          ))}
        </div>

        {hasSpeedLane && <SpeedLane duration={duration} />}
        <VoiceLane duration={duration} topClass={voiceLaneTop} />

        {/* In/Out point markers */}
        {inPoint !== null && (
          <div
            className={`absolute ${laneTop} bottom-0 w-0.5 bg-success z-20`}
            style={{ left: `${(inPoint / duration) * 100}%` }}
          />
        )}
        {outPoint !== null && (
          <div
            className={`absolute ${laneTop} bottom-0 w-0.5 bg-error z-20`}
            style={{ left: `${(outPoint / duration) * 100}%` }}
          />
        )}
        {inPoint !== null && outPoint !== null && (
          <div
            className={`absolute ${laneTop} bottom-0 bg-accent/10 z-10 pointer-events-none`}
            style={{
              left: `${(inPoint / duration) * 100}%`,
              width: `${((outPoint - inPoint) / duration) * 100}%`,
            }}
          />
        )}

        {/* Annotation markers */}
        <div
          ref={laneRef}
          onScroll={(e) => setLaneScroll(e.currentTarget.scrollTop)}
          className={`absolute inset-x-0 ${laneTop} bottom-0 overflow-y-auto [scrollbar-width:none]`}
        >
          <div className="absolute top-0 left-0 w-px pointer-events-none" style={{ height: totalRows * 28 + 8 }} />
          {annotations.map((annotation) => (
            <TimelineMarker
              key={annotation.id}
              annotation={annotation}
              duration={duration}
              isSelected={selectedAnnotationId === annotation.id}
              row={rows.get(annotation.id) ?? 0}
              onSelect={() => selectAnnotation(annotation.id)}
              onUpdateTime={(start, end) => handleUpdateTime(annotation.id, start, end)}
              onDragStart={handleMarkerDragStart}
              onDragEnd={handleMarkerDragEnd}
            />
          ))}
        </div>

        {scrolledDown && (
          <div
            className={`absolute inset-x-0 ${laneTop} h-4 z-20 pointer-events-none bg-gradient-to-b from-surface-sunken to-transparent`}
          />
        )}
        {hiddenBelow > 0 && (
          <div className="absolute inset-x-0 bottom-0 h-6 z-20 pointer-events-none flex items-end justify-center bg-gradient-to-t from-surface-sunken to-transparent">
            <span className="text-[10px] leading-none pb-0.5 text-text-tertiary">+{hiddenBelow}</span>
          </div>
        )}

        {/* Playhead */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-text-primary z-30 pointer-events-none"
          style={{ left: `${progress}%` }}
        >
          <div className="absolute -top-0 left-1/2 -translate-x-1/2 w-3 h-3 bg-text-primary rotate-45" />
        </div>
      </div>

      {selectedSpeedRegion && <SpeedRegionDetails region={selectedSpeedRegion} />}
      {selectedVoiceClip && <VoiceClipDetails clip={selectedVoiceClip} />}

      {/* Selected annotation details */}
      {selectedAnnotationId && (
        <AnnotationDetails
          annotation={annotations.find((a) => a.id === selectedAnnotationId)!}
          onUpdate={(updates) => updateAnnotation(selectedAnnotationId, updates)}
          onUpdateAnnotation={updateAnnotation}
          onDelete={handleDeleteSelected}
        />
      )}
    </div>
  )
}

interface AnnotationDetailsProps {
  annotation: Annotation
  onUpdate: (updates: Partial<Annotation>) => void
  onUpdateAnnotation: (id: string, updates: Partial<Annotation>) => void
  onDelete: () => void
}

function AnnotationDetails({ annotation, onUpdate, onUpdateAnnotation, onDelete }: AnnotationDetailsProps) {
  const { layers, annotations, syncFrames } = useDrawingStore()
  const fps = useVideoStore((s) => s.fps)
  const startOnFocusRef = useRef({ id: annotation.id, start: annotation.startTime })
  const freeze = freezeFieldState(annotations, annotation.startTime, fps)

  const handleAutoFreeze = () => {
    const carrier = findFreezeCarrierAt(annotations, annotation.startTime, fps)
    if (carrier) {
      onUpdateAnnotation(carrier.id, { freezeAuto: true })
      syncFrames([annotation.startTime])
    } else {
      syncFrames([annotation.startTime], { createFreeze: true })
    }
  }
  const fabricObj = annotation.object as fabric.Object | undefined

  // fabric types `shadow` as `Shadow | string | null`; only the object form
  // carries a mutable `color`.
  const recolorShadow = (obj: fabric.Object, color: string) => {
    const shadow = obj.shadow
    if (shadow && typeof shadow !== 'string') shadow.color = color
  }

  const handleColorChange = (color: string) => {
    if (!fabricObj) return
    if (fabricObj.type === 'group') {
      ;(fabricObj as fabric.Group).getObjects().forEach((obj) => {
        if (obj.stroke) obj.set('stroke', color)
        if (obj.fill && obj.fill !== 'transparent') obj.set('fill', typeof obj.fill === 'string' ? recolorKeepingAlpha(obj.fill, color) : color)
        recolorShadow(obj, color)
      })
    } else {
      if (fabricObj.stroke) fabricObj.set('stroke', color)
      if (fabricObj.fill && fabricObj.fill !== 'transparent' && fabricObj.type !== 'circle') fabricObj.set('fill', typeof fabricObj.fill === 'string' ? recolorKeepingAlpha(fabricObj.fill, color) : color)
      recolorShadow(fabricObj, color)
    }
    fabricObj.canvas?.renderAll()
  }

  const handleOpacityChange = (opacity: number) => {
    if (!fabricObj) return
    fabricObj.set('opacity', opacity)
    fabricObj.canvas?.renderAll()
  }

  const currentOpacity = fabricObj?.opacity ?? 1

  return (
    <div className="mt-2 p-3 bg-surface-sunken rounded-lg space-y-2">
      {/* Row 1: Type, timing, layer */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-tertiary">Type:</span>
          <span className="text-xs text-text-primary font-medium capitalize">{annotation.toolType || annotation.id.split('-')[0]}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-tertiary">Start:</span>
          <input
            type="number"
            step="0.1"
            value={annotation.startTime.toFixed(2)}
            onFocus={() => { startOnFocusRef.current = { id: annotation.id, start: annotation.startTime } }}
            onChange={(e) => onUpdate({ startTime: Math.max(0, parseFloat(e.target.value) || 0) })}
            onBlur={() => {
              const focused = startOnFocusRef.current
              if (focused.id !== annotation.id || annotation.startTime === focused.start) return
              // A typed start lands on its frame, so a freeze on that frame shows the drawing.
              const snapped = barStart(annotation, annotation.startTime, fps)
              if (snapped !== annotation.startTime) onUpdate({ startTime: snapped })
              if (snapped !== focused.start) syncFrames([focused.start, snapped])
            }}
            className="w-20 px-2 py-1 bg-surface-elevated text-text-primary text-xs rounded border border-border focus:border-accent focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-tertiary">End:</span>
          <input
            type="number"
            step="0.1"
            value={annotation.endTime.toFixed(2)}
            onChange={(e) => onUpdate({ endTime: Math.max(annotation.startTime + 0.1, parseFloat(e.target.value) || 0) })}
            className="w-20 px-2 py-1 bg-surface-elevated text-text-primary text-xs rounded border border-border focus:border-accent focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-tertiary">Layer:</span>
          <Select
            value={annotation.layer}
            onChange={(e) => onUpdate({ layer: parseInt(e.target.value) })}
            className="text-xs py-1"
          >
            {layers.map((layer) => (
              <option key={layer.id} value={layer.id}>{layer.name}</option>
            ))}
          </Select>
        </div>
        <div className="flex-1" />
        <Button onClick={onDelete} variant="danger" size="sm">
          Delete
        </Button>
      </div>

      {/* Row 2: Color, opacity, fade */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-tertiary">Color:</span>
          <div className="flex items-center gap-1">
            {PRESET_COLORS.slice(0, 8).map((color) => (
              <button
                key={color}
                onClick={() => handleColorChange(color)}
                className="w-4 h-4 rounded-sm transition-all hover:scale-125 flex-shrink-0"
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-text-tertiary">Opacity:</span>
          <input
            type="range"
            min="0.1"
            max="1"
            step="0.05"
            value={currentOpacity}
            onChange={(e) => handleOpacityChange(parseFloat(e.target.value))}
            className="w-20 h-1 accent-[var(--color-accent)]"
          />
          <span className="text-xs text-text-disabled w-8">{Math.round(currentOpacity * 100)}%</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-text-tertiary">Fade In:</span>
          <input
            type="number"
            step="0.05"
            min="0"
            max="2"
            value={(annotation.fadeIn ?? 0).toFixed(2)}
            onChange={(e) => onUpdate({ fadeIn: Math.max(0, parseFloat(e.target.value) || 0) })}
            className="w-16 px-2 py-1 bg-surface-elevated text-text-primary text-xs rounded border border-border focus:border-accent focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-tertiary">Fade Out:</span>
          <input
            type="number"
            step="0.05"
            min="0"
            max="2"
            value={(annotation.fadeOut ?? 0).toFixed(2)}
            onChange={(e) => onUpdate({ fadeOut: Math.max(0, parseFloat(e.target.value) || 0) })}
            className="w-16 px-2 py-1 bg-surface-elevated text-text-primary text-xs rounded border border-border focus:border-accent focus:outline-none"
          />
        </div>
        {revealKind(annotation.toolType) !== 'none' && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-tertiary">Draw-on:</span>
            <input
              type="number"
              step="0.05"
              min="0"
              max="2"
              value={(annotation.drawIn ?? 0).toFixed(2)}
              onChange={(e) => onUpdate({ drawIn: parseDrawIn(e.target.value) })}
              className="w-16 px-2 py-1 bg-surface-elevated text-text-primary text-xs rounded border border-border focus:border-accent focus:outline-none"
            />
          </div>
        )}

        <div className="flex items-center gap-2">
          <Snowflake className="w-3 h-3 text-text-tertiary" />
          <span className="text-xs text-text-tertiary">Freeze:</span>
          <input
            type="number"
            step="0.5"
            min="0"
            max="30"
            value={freeze.seconds.toFixed(1)}
            onChange={(e) => {
              const val = Math.min(30, Math.max(0, parseFloat(e.target.value) || 0))
              setFrameFreeze(annotation.startTime, val, fps, { auto: false, history: false })
            }}
            className="w-16 px-2 py-1 bg-surface-elevated text-text-primary text-xs rounded border border-border focus:border-accent focus:outline-none"
          />
          <span className="text-xs text-text-disabled">sec</span>
          {freeze.isAuto && <span className="text-xs text-text-tertiary">Auto</span>}
          {freeze.showAutoButton && (
            <Button onClick={handleAutoFreeze} variant="secondary" size="sm">
              Auto
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}
