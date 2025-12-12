import { useVideoStore } from '@/stores/videoStore'

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
    inPoint,
    outPoint,
    isLooping,
    togglePlay,
    seek,
    stepFrame,
    setPlaybackRate,
    setInPoint,
    setOutPoint,
    setIsLooping,
  } = useVideoStore()

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = (parseFloat(e.target.value) / 100) * duration
    seek(time)
  }

  return (
    <div className="bg-gray-800 px-4 py-3 border-t border-gray-700">
      {/* Timeline */}
      <div className="relative mb-3">
        {/* In/Out point markers */}
        {inPoint !== null && (
          <div
            className="absolute top-0 h-full w-0.5 bg-green-500 z-10"
            style={{ left: `${(inPoint / duration) * 100}%` }}
          />
        )}
        {outPoint !== null && (
          <div
            className="absolute top-0 h-full w-0.5 bg-red-500 z-10"
            style={{ left: `${(outPoint / duration) * 100}%` }}
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

      <div className="flex items-center justify-between">
        {/* Left controls */}
        <div className="flex items-center gap-2">
          {/* Frame backward */}
          <button
            onClick={() => stepFrame('backward')}
            className="p-2 hover:bg-gray-700 rounded text-gray-300 hover:text-white transition-colors"
            title="Previous frame (Left Arrow)"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/>
            </svg>
          </button>

          {/* Play/Pause */}
          <button
            onClick={togglePlay}
            className="p-2 bg-blue-600 hover:bg-blue-700 rounded text-white transition-colors"
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
            title="Next frame (Right Arrow)"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/>
            </svg>
          </button>

          {/* Playback speed */}
          <select
            value={playbackRate}
            onChange={(e) => setPlaybackRate(parseFloat(e.target.value))}
            className="ml-2 bg-gray-700 text-gray-200 text-sm rounded px-2 py-1 border border-gray-600"
          >
            {PLAYBACK_RATES.map((rate) => (
              <option key={rate} value={rate}>
                {rate}x
              </option>
            ))}
          </select>
        </div>

        {/* Time display */}
        <div className="text-sm font-mono text-gray-300">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-2">
          {/* Set In Point */}
          <button
            onClick={() => setInPoint(currentTime)}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              inPoint !== null ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
            title="Set In Point (I)"
          >
            IN
          </button>

          {/* Set Out Point */}
          <button
            onClick={() => setOutPoint(currentTime)}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              outPoint !== null ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
            title="Set Out Point (O)"
          >
            OUT
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
              CLEAR
            </button>
          )}

          {/* Loop toggle */}
          <button
            onClick={() => setIsLooping(!isLooping)}
            className={`p-2 rounded transition-colors ${
              isLooping ? 'bg-blue-600 text-white' : 'hover:bg-gray-700 text-gray-300 hover:text-white'
            }`}
            title="Toggle Loop"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
