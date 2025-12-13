import { useVideoStore } from '@/stores/videoStore'
import { useState, useRef, useEffect } from 'react'

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
  const volumeRef = useRef<HTMLDivElement>(null)

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
    <div className="bg-gray-800 px-4 py-3 border-t border-gray-700 relative z-50">
      {/* Timeline */}
      <div className="relative mb-3 group">
        {/* In/Out point markers */}
        {inPoint !== null && (
          <div
            className="absolute top-0 h-full w-1 bg-green-500 z-10 cursor-pointer"
            style={{ left: `${(inPoint / duration) * 100}%` }}
            onClick={() => goToInPoint()}
            title={`In Point: ${formatTime(inPoint)}`}
          />
        )}
        {outPoint !== null && (
          <div
            className="absolute top-0 h-full w-1 bg-red-500 z-10 cursor-pointer"
            style={{ left: `${(outPoint / duration) * 100}%` }}
            onClick={() => goToOutPoint()}
            title={`Out Point: ${formatTime(outPoint)}`}
          />
        )}
        {/* Loop region highlight */}
        {inPoint !== null && outPoint !== null && (
          <div
            className="absolute top-0 h-full bg-blue-500/20"
            style={{
              left: `${(inPoint / duration) * 100}%`,
              width: `${((outPoint - inPoint) / duration) * 100}%`,
            }}
          />
        )}
        <input
          type="range"
          min="0"
          max="100"
          step="0.01"
          value={progress}
          onChange={handleSeek}
          className="video-timeline w-full"
        />
      </div>

      <div className="flex items-center justify-between gap-4">
        {/* Left controls - Transport */}
        <div className="flex items-center gap-1">
          {/* Jump to start */}
          <button
            onClick={jumpToStart}
            className="p-2 hover:bg-gray-700 rounded text-gray-300 hover:text-white transition-colors"
            title="Jump to Start (Home)"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
            </svg>
          </button>

          {/* Skip backward 10s */}
          <button
            onClick={() => skip(-10)}
            className="p-2 hover:bg-gray-700 rounded text-gray-300 hover:text-white transition-colors"
            title="Skip Back 10s (J)"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
              <text x="12" y="14" fontSize="6" textAnchor="middle" fill="currentColor">10</text>
            </svg>
          </button>

          {/* Frame backward */}
          <button
            onClick={() => stepFrame('backward')}
            className="p-2 hover:bg-gray-700 rounded text-gray-300 hover:text-white transition-colors"
            title="Previous Frame (Left Arrow)"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z"/>
            </svg>
          </button>

          {/* Play/Pause */}
          <button
            onClick={togglePlay}
            className="p-3 bg-blue-600 hover:bg-blue-700 rounded-full text-white transition-colors mx-1"
            title="Play/Pause (Space)"
          >
            {isPlaying ? (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
            )}
          </button>

          {/* Frame forward */}
          <button
            onClick={() => stepFrame('forward')}
            className="p-2 hover:bg-gray-700 rounded text-gray-300 hover:text-white transition-colors"
            title="Next Frame (Right Arrow)"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/>
            </svg>
          </button>

          {/* Skip forward 10s */}
          <button
            onClick={() => skip(10)}
            className="p-2 hover:bg-gray-700 rounded text-gray-300 hover:text-white transition-colors"
            title="Skip Forward 10s (L)"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z"/>
              <text x="12" y="14" fontSize="6" textAnchor="middle" fill="currentColor">10</text>
            </svg>
          </button>

          {/* Jump to end */}
          <button
            onClick={jumpToEnd}
            className="p-2 hover:bg-gray-700 rounded text-gray-300 hover:text-white transition-colors"
            title="Jump to End (End)"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
            </svg>
          </button>

          {/* Divider */}
          <div className="w-px h-6 bg-gray-600 mx-2" />

          {/* Playback speed */}
          <select
            value={playbackRate}
            onChange={(e) => setPlaybackRate(parseFloat(e.target.value))}
            className="bg-gray-700 text-gray-200 text-sm rounded px-2 py-1.5 border border-gray-600 hover:border-gray-500 cursor-pointer"
          >
            {PLAYBACK_RATES.map((rate) => (
              <option key={rate} value={rate}>
                {rate}x
              </option>
            ))}
          </select>
        </div>

        {/* Center - Time display */}
        <div className="text-sm font-mono text-gray-300 tabular-nums">
          <span className="text-white">{formatTime(currentTime)}</span>
          <span className="text-gray-500 mx-1">/</span>
          <span>{formatTime(duration)}</span>
        </div>

        {/* Right controls - In/Out, Volume, Fullscreen */}
        <div className="flex items-center gap-1">
          {/* Go to In Point */}
          <button
            onClick={goToInPoint}
            disabled={inPoint === null}
            className={`p-2 rounded transition-colors ${
              inPoint !== null
                ? 'hover:bg-gray-700 text-green-400 hover:text-green-300'
                : 'text-gray-600 cursor-not-allowed'
            }`}
            title="Go to In Point ([)"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M11 18V6l-8.5 6 8.5 6zm.5-6l8.5 6V6l-8.5 6z"/>
            </svg>
          </button>

          {/* Set In Point */}
          <button
            onClick={() => setInPoint(currentTime)}
            className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
              inPoint !== null ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
            title="Set In Point (I)"
          >
            I
          </button>

          {/* Set Out Point */}
          <button
            onClick={() => setOutPoint(currentTime)}
            className={`px-2 py-1 text-xs font-medium rounded transition-colors ${
              outPoint !== null ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
            title="Set Out Point (O)"
          >
            O
          </button>

          {/* Go to Out Point */}
          <button
            onClick={goToOutPoint}
            disabled={outPoint === null}
            className={`p-2 rounded transition-colors ${
              outPoint !== null
                ? 'hover:bg-gray-700 text-red-400 hover:text-red-300'
                : 'text-gray-600 cursor-not-allowed'
            }`}
            title="Go to Out Point (])"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z"/>
            </svg>
          </button>

          {/* Clear In/Out */}
          {(inPoint !== null || outPoint !== null) && (
            <button
              onClick={() => {
                setInPoint(null)
                setOutPoint(null)
              }}
              className="px-2 py-1 text-xs bg-gray-700 text-gray-300 hover:bg-gray-600 rounded transition-colors"
              title="Clear In/Out Points"
            >
              CLR
            </button>
          )}

          {/* Loop toggle */}
          <button
            onClick={() => setIsLooping(!isLooping)}
            className={`p-2 rounded transition-colors ${
              isLooping ? 'bg-blue-600 text-white' : 'hover:bg-gray-700 text-gray-300 hover:text-white'
            }`}
            title="Toggle Loop (Shift+L)"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/>
            </svg>
          </button>

          {/* Divider */}
          <div className="w-px h-6 bg-gray-600 mx-2" />

          {/* Volume control */}
          <div ref={volumeRef} className="relative">
            <button
              onClick={toggleMute}
              onMouseEnter={() => setShowVolumeSlider(true)}
              className="p-2 hover:bg-gray-700 rounded text-gray-300 hover:text-white transition-colors"
              title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
            >
              {isMuted || volume === 0 ? (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
                </svg>
              ) : volume < 0.5 ? (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/>
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                </svg>
              )}
            </button>
            {showVolumeSlider && (
              <div
                className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 p-2 bg-gray-700 rounded shadow-lg"
                onMouseLeave={() => setShowVolumeSlider(false)}
              >
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-24 h-1 accent-blue-500"
                  style={{ writingMode: 'horizontal-tb' }}
                />
              </div>
            )}
          </div>

          {/* Fullscreen toggle */}
          <button
            onClick={toggleFullscreen}
            className="p-2 hover:bg-gray-700 rounded text-gray-300 hover:text-white transition-colors"
            title="Fullscreen (F)"
          >
            {isFullscreen ? (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
