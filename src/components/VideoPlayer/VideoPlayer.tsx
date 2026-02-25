import { useRef, useEffect, useState } from 'react'
import { useVideoStore } from '@/stores/videoStore'
import VideoControls from './VideoControls'

interface VideoPlayerProps {
  src: string
  onVideoRef?: (video: HTMLVideoElement | null) => void
}

export default function VideoPlayer({ src, onVideoRef }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [videoError, setVideoError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const {
    isPlaying,
    playbackRate,
    setIsPlaying,
    setCurrentTime,
    setDuration,
    setVideoElement,
  } = useVideoStore()

  // Initialize video element in store
  useEffect(() => {
    if (videoRef.current) {
      setVideoElement(videoRef.current)
      onVideoRef?.(videoRef.current)
    }
    return () => {
      setVideoElement(null)
      onVideoRef?.(null)
    }
  }, [setVideoElement, onVideoRef])

  // Handle video events
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handleLoadedMetadata = () => {
      setDuration(video.duration)
    }

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime)
    }

    const handlePlay = () => setIsPlaying(true)
    const handlePause = () => setIsPlaying(false)
    const handleEnded = () => setIsPlaying(false)
    const handleError = (e: Event) => {
      const video = e.target as HTMLVideoElement
      const errorMsg = `Video error: ${video.error?.message || 'Unknown'} (code: ${video.error?.code})`
      console.error(errorMsg)
      setVideoError(errorMsg)
    }
    const handleCanPlay = () => {
      setVideoError(null)
    }

    video.addEventListener('loadedmetadata', handleLoadedMetadata)
    video.addEventListener('timeupdate', handleTimeUpdate)
    video.addEventListener('play', handlePlay)
    video.addEventListener('pause', handlePause)
    video.addEventListener('ended', handleEnded)
    video.addEventListener('error', handleError)
    video.addEventListener('canplay', handleCanPlay)

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata)
      video.removeEventListener('timeupdate', handleTimeUpdate)
      video.removeEventListener('play', handlePlay)
      video.removeEventListener('pause', handlePause)
      video.removeEventListener('ended', handleEnded)
      video.removeEventListener('error', handleError)
      video.removeEventListener('canplay', handleCanPlay)
    }
  }, [setCurrentTime, setDuration, setIsPlaying])

  // Sync playback rate
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackRate
    }
  }, [playbackRate])

  return (
    <div ref={containerRef} className="flex flex-col h-full w-full overflow-hidden">
      <div className="flex-1 min-h-0 relative flex items-center justify-center bg-black overflow-hidden">
        {videoError && (
          <div className="absolute top-4 left-4 right-4 bg-error/90 text-white p-3 rounded-lg z-10">
            <p className="font-bold">Error loading video</p>
            <p className="text-sm">{videoError}</p>
          </div>
        )}
        <video
          ref={videoRef}
          src={src}
          className="max-h-full max-w-full object-contain"
          onClick={() => {
            const video = videoRef.current
            if (video) {
              if (isPlaying) video.pause()
              else video.play()
            }
          }}
        />
      </div>
      <div className="shrink-0 relative z-50">
        <VideoControls />
      </div>
    </div>
  )
}
