import { useEffect, useRef, useState } from 'react'
import { useSpeedStore } from '@/stores/speedStore'
import { useVideoStore } from '@/stores/videoStore'
import { useDrawingStore } from '@/stores/drawingStore'
import { Button } from '@/components/ui'
import { SPEED_CHIPS, formatSpeed, type SpeedRegion } from '@/utils/speedRegions'
import { dragSpeedRegion, rampFraction } from '@/utils/speedLane'

type Edge = 'move' | 'start' | 'end'

interface Drag {
  edge: Edge
  origin: SpeedRegion
  grabOffset: number
  region: SpeedRegion
}

const RAMP_FADE = 'linear-gradient(to right, rgba(0,0,0,0.45), rgba(0,0,0,0))'

function selectSpeedRegion(id: string) {
  useDrawingStore.getState().selectAnnotation(null)
  useSpeedStore.getState().select(id)
}

export default function SpeedLane({ duration }: { duration: number }) {
  const regions = useSpeedStore((s) => s.regions)
  const selectedId = useSpeedStore((s) => s.selectedId)
  const laneRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<Drag | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const dragging = drag !== null

  useEffect(() => {
    if (!dragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const current = dragRef.current
      const rect = laneRef.current?.getBoundingClientRect()
      if (!current || !rect || rect.width === 0) return
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
      const { fps, currentTime } = useVideoStore.getState()
      const region = dragSpeedRegion(current.origin, current.edge, x * duration, current.grabOffset, {
        duration,
        fps,
        playhead: currentTime,
        pxPerSecond: rect.width / duration,
        free: e.altKey,
      })
      const next = { ...current, region }
      dragRef.current = next
      setDrag(next)
    }

    const handleMouseUp = () => {
      const finished = dragRef.current
      dragRef.current = null
      setDrag(null)
      if (!finished) return
      const { origin, region } = finished
      if (region.start !== origin.start || region.end !== origin.end) useSpeedStore.getState().place(region)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [dragging, duration])

  const startDrag = (e: React.MouseEvent, region: SpeedRegion, edge: Edge) => {
    e.preventDefault()
    e.stopPropagation()
    const rect = laneRef.current?.getBoundingClientRect()
    const pointer = rect && rect.width > 0 ? ((e.clientX - rect.left) / rect.width) * duration : region.start
    selectSpeedRegion(region.id)
    const next = { edge, origin: region, grabOffset: pointer - region.start, region }
    dragRef.current = next
    setDrag(next)
  }

  return (
    <div
      ref={laneRef}
      className="absolute inset-x-0 top-8 h-4 bg-surface-elevated/40 border-b border-border-subtle/50"
      aria-label="Speed lane"
    >
      {regions.map((stored) => {
        const region = drag && drag.origin.id === stored.id ? drag.region : stored
        const isSelected = selectedId === region.id
        const left = (region.start / duration) * 100
        const width = ((region.end - region.start) / duration) * 100
        const ramp = `${rampFraction(region) * 100}%`
        return (
          <div
            key={region.id}
            role="button"
            tabIndex={0}
            aria-label={`Speed region ${formatSpeed(region.speed)}`}
            aria-pressed={isSelected}
            className={`absolute top-0.5 bottom-0.5 rounded-sm cursor-grab group bg-accent overflow-hidden ${
              isSelected ? 'ring-2 ring-accent-hover z-10' : 'opacity-85 hover:opacity-100'
            }`}
            style={{ left: `${left}%`, width: `${Math.max(width, 0.4)}%` }}
            onMouseDown={(e) => startDrag(e, region, 'move')}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                selectSpeedRegion(region.id)
              }
            }}
          >
            <div
              className="absolute left-0 top-0 bottom-0 pointer-events-none"
              style={{ width: ramp, backgroundImage: RAMP_FADE }}
            />
            <div
              className="absolute right-0 top-0 bottom-0 pointer-events-none"
              style={{ width: ramp, backgroundImage: RAMP_FADE, transform: 'scaleX(-1)' }}
            />
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium text-white leading-none truncate px-1 pointer-events-none">
              {formatSpeed(region.speed)}
            </span>
            <div
              className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-white/40"
              onMouseDown={(e) => startDrag(e, region, 'start')}
            />
            <div
              className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize hover:bg-white/40"
              onMouseDown={(e) => startDrag(e, region, 'end')}
            />
          </div>
        )
      })}
    </div>
  )
}

export function SpeedRegionDetails({ region }: { region: SpeedRegion }) {
  const setSpeed = useSpeedStore((s) => s.setSpeed)
  const remove = useSpeedStore((s) => s.remove)
  return (
    <div className="mt-2 p-3 bg-surface-sunken rounded-lg flex items-center gap-4 flex-wrap">
      <span className="text-xs text-text-tertiary">Speed:</span>
      <div className="flex items-center gap-1">
        {SPEED_CHIPS.map((speed) => (
          <button
            key={speed}
            onClick={() => setSpeed(region.id, speed)}
            className={`px-2 h-7 rounded text-xs whitespace-nowrap transition-all ${
              region.speed === speed ? 'bg-accent-subtle ring-1 ring-accent' : 'hover:bg-surface-elevated'
            }`}
            aria-pressed={region.speed === speed}
          >
            {formatSpeed(speed)}
          </button>
        ))}
      </div>
      <div className="flex-1" />
      <Button onClick={() => remove(region.id)} variant="danger" size="sm">
        Delete
      </Button>
    </div>
  )
}
