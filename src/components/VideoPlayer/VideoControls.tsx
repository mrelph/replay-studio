import {
  SkipBack, RotateCcw, ChevronLeft, Play, Pause, ChevronRight,
  RotateCw, SkipForward, ChevronsLeft, ChevronsRight, Repeat2,
  Volume2, Volume1, VolumeX, Maximize, Minimize
} from 'lucide-react'
import { useVideoStore } from '@/stores/videoStore'
import { useState, useRef, useEffect } from 'react'
import { IconButton, Select, Slider } from '@/components/ui'

const PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2]

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  const frames = Math.floor((seconds % 1) * 30)
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${frames.toString().padStart(2, '0')}`
}

export default function VideoControls() {
  const {
    isPlaying,
    currentTime,
    duration,
    playbackRate,
    volume,
    isMuted,
    inPoint,
    outPoint,
    isLooping,
    togglePlay,
    seek,
    stepFrame,
    skip,
    jumpToStart,
    jumpToEnd,
    goToInPoint,
    goToOutPoint,
    setPlaybackRate,
    setVolume,
    toggleMute,
    setInPoint,
    setOutPoint,
    setIsLooping,
  } = useVideoStore()

  const [showVolumeSlider, setShowVolumeSlider] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [hoverTime, setHoverTime] = useState<{ time: number; x: number } | null>(null)
  const volumeRef = useRef<HTMLDivElement>(null)
  const volumeHideTimer = useRef<number>(0)

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  // Handle fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  // Close volume slider when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (volumeRef.current && !volumeRef.current.contains(e.target as Node)) {
        setShowVolumeSlider(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = (parseFloat(e.target.value) / 100) * duration
    seek(time)
  }

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVolume(parseFloat(e.target.value))
  }

  const toggleFullscreen = () => {
    const videoContainer = document.querySelector('.video-container')
    if (!videoContainer) return

    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      videoContainer.requestFullscreen()
    }
  }

  return (
    <div className="bg-surface-elevated px-4 py-3 border-t border-border-subtle shadow-sm relative z-50">
      {/* Timeline */}
      <div
        className="relative mb-3 group"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
          setHoverTime({ time: x * duration, x: e.clientX - rect.left })
        }}
        onMouseLeave={() => setHoverTime(null)}
      >
        {/* Hover time tooltip */}
        {hoverTime && (
          <div
            className="absolute -top-8 px-2 py-1 bg-surface-elevated text-text-primary text-xs font-mono rounded shadow-lg border border-border-subtle pointer-events-none z-20 whitespace-nowrap"
            style={{ left: hoverTime.x, transform: 'translateX(-50%)' }}
          >
            {formatTime(hoverTime.time)}
          </div>
        )}
        {/* In/Out point markers */}
        {inPoint !== null && (
          <div
            className="absolute top-0 h-full w-1 bg-success z-10 cursor-pointer"
            style={{ left: `${(inPoint / duration) * 100}%` }}
            onClick={() => goToInPoint()}
            title={`In Point: ${formatTime(inPoint)}`}
          />
        )}
        {outPoint !== null && (
          <div
            className="absolute top-0 h-full w-1 bg-error z-10 cursor-pointer"
            style={{ left: `${(outPoint / duration) * 100}%` }}
            onClick={() => goToOutPoint()}
            title={`Out Point: ${formatTime(outPoint)}`}
          />
        )}
        {/* Loop region highlight */}
        {inPoint !== null && outPoint !== null && (
          <div
            className="absolute top-0 h-full bg-accent/20"
            style={{
              left: `${(inPoint / duration) * 100}%`,
              width: `${((outPoint - inPoint) / duration) * 100}%`,
            }}
          />
        )}
        <Slider
          min={0}
          max={100}
          step={0.01}
          value={progress}
          onChange={handleSeek}
          aria-label="Video timeline"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress)}
          aria-valuetext={formatTime(currentTime)}
        />
      </div>

      <div className="flex items-center justify-between gap-4">
        {/* Left controls - Transport */}
        <div className="flex items-center gap-0.5">
          <IconButton onClick={jumpToStart} title="Jump to Start (Home)" size="sm">
            <SkipBack className="w-4 h-4" />
          </IconButton>

          <IconButton onClick={() => skip(-10)} title="Skip Back 10s (J)" size="sm">
            <RotateCcw className="w-4 h-4" />
          </IconButton>

          <IconButton onClick={() => stepFrame('backward')} title="Previous Frame (Left Arrow)" size="sm">
            <ChevronLeft className="w-4 h-4" />
          </IconButton>

          {/* Play/Pause */}
          <button
            onClick={togglePlay}
            className="p-2.5 bg-accent hover:bg-accent-hover rounded-full text-accent-text transition-colors mx-1 shadow-md"
            title="Play/Pause (Space)"
          >
            {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </button>

          <IconButton onClick={() => stepFrame('forward')} title="Next Frame (Right Arrow)" size="sm">
            <ChevronRight className="w-4 h-4" />
          </IconButton>

          <IconButton onClick={() => skip(10)} title="Skip Forward 10s (L)" size="sm">
            <RotateCw className="w-4 h-4" />
          </IconButton>

          <IconButton onClick={jumpToEnd} title="Jump to End (End)" size="sm">
            <SkipForward className="w-4 h-4" />
          </IconButton>

          {/* Divider */}
          <div className="w-px h-5 bg-border-subtle mx-1.5" />

          {/* Playback speed */}
          <Select
            value={playbackRate}
            onChange={(e) => setPlaybackRate(parseFloat(e.target.value))}
          >
            {PLAYBACK_RATES.map((rate) => (
              <option key={rate} value={rate}>
                {rate}x
              </option>
            ))}
          </Select>
        </div>

        {/* Center - Time display */}
        <div className="text-sm font-mono text-text-secondary tabular-nums">
          <span className="text-text-primary">{formatTime(currentTime)}</span>
          <span className="text-text-disabled mx-1">/</span>
          <span>{formatTime(duration)}</span>
        </div>

        {/* Right controls - In/Out, Volume, Fullscreen */}
        <div className="flex items-center gap-0.5">
          {/* Go to In Point */}
          <IconButton
            onClick={goToInPoint}
            disabled={inPoint === null}
            title="Go to In Point ([)"
            size="sm"
            className={inPoint !== null ? 'text-success hover:text-green-300' : ''}
          >
            <ChevronsLeft className="w-4 h-4" />
          </IconButton>

          {/* Set In Point */}
          <button
            onClick={() => setInPoint(currentTime)}
            className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
              inPoint !== null ? 'bg-success/15 text-success' : 'bg-surface-sunken text-text-secondary hover:bg-surface-elevated'
            }`}
            title="Set In Point (I)"
          >
            I
          </button>

          {/* Set Out Point */}
          <button
            onClick={() => setOutPoint(currentTime)}
            className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
              outPoint !== null ? 'bg-error/15 text-error' : 'bg-surface-sunken text-text-secondary hover:bg-surface-elevated'
            }`}
            title="Set Out Point (O)"
          >
            O
          </button>

          {/* Go to Out Point */}
          <IconButton
            onClick={goToOutPoint}
            disabled={outPoint === null}
            title="Go to Out Point (])"
            size="sm"
            className={outPoint !== null ? 'text-error hover:text-red-300' : ''}
          >
            <ChevronsRight className="w-4 h-4" />
          </IconButton>

          {/* Clear In/Out */}
          {(inPoint !== null || outPoint !== null) && (
            <button
              onClick={() => {
                setInPoint(null)
                setOutPoint(null)
              }}
              className="px-2 py-1 text-xs bg-surface-sunken text-text-secondary hover:bg-surface-elevated rounded transition-colors"
              title="Clear In/Out Points"
            >
              CLR
            </button>
          )}

          {/* Loop toggle */}
          <IconButton
            onClick={() => setIsLooping(!isLooping)}
            title="Toggle Loop (Shift+L)"
            size="sm"
            variant={isLooping ? 'active' : 'ghost'}
          >
            <Repeat2 className="w-4 h-4" />
          </IconButton>

          {/* Divider */}
          <div className="w-px h-5 bg-border-subtle mx-1.5" />

          {/* Volume control */}
          <div
            ref={volumeRef}
            className="relative"
            onMouseEnter={() => {
              clearTimeout(volumeHideTimer.current)
              setShowVolumeSlider(true)
            }}
            onMouseLeave={() => {
              volumeHideTimer.current = window.setTimeout(() => setShowVolumeSlider(false), 200)
            }}
          >
            <IconButton
              onClick={toggleMute}
              title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
              size="sm"
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="w-4 h-4" />
              ) : volume < 0.5 ? (
                <Volume1 className="w-4 h-4" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </IconButton>
            {showVolumeSlider && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 pb-1">
                <div className="p-2 bg-surface-elevated rounded-lg shadow-lg border border-border-subtle">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.01"
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className="w-24 h-1 accent-[var(--color-accent)]"
                    style={{ writingMode: 'horizontal-tb' }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Fullscreen toggle */}
          <IconButton onClick={toggleFullscreen} title="Fullscreen (F)" size="sm">
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </IconButton>
        </div>
      </div>
    </div>
  )
}
