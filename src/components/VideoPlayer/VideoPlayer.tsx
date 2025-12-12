import { useRef, useEffect, useCallback, useState } from 'react'
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
    duration,
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

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const video = videoRef.current
    if (!video) return

    // Don't handle if typing in an input
    if ((e.target as HTMLElement).tagName === 'INPUT') return

    switch (e.key) {
      case ' ':
        e.preventDefault()
        if (isPlaying) {
          video.pause()
        } else {
          video.play()
        }
        break
      case 'ArrowLeft':
        e.preventDefault()
        // Step back one frame (assuming 30fps)
        video.currentTime = Math.max(0, video.currentTime - 1/30)
        break
      case 'ArrowRight':
        e.preventDefault()
        // Step forward one frame
        video.currentTime = Math.min(duration, video.currentTime + 1/30)
        break
      case 'j':
        // Reverse playback (step back)
        e.preventDefault()
        video.currentTime = Math.max(0, video.currentTime - 1/10)
        break
      case 'k':
        // Pause
        e.preventDefault()
        video.pause()
        break
      case 'l':
        // Forward (step forward or play)
        e.preventDefault()
        if (!isPlaying) {
          video.currentTime = Math.min(duration, video.currentTime + 1/10)
        }
        break
      case 'Home':
        e.preventDefault()
        video.currentTime = 0
        break
      case 'End':
        e.preventDefault()
        video.currentTime = duration
        break
    }
  }, [isPlaying, duration])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div ref={containerRef} className="flex flex-col h-full w-full">
      <div className="flex-1 relative flex items-center justify-center bg-black">
        {videoError && (
          <div className="absolute top-4 left-4 right-4 bg-red-600/90 text-white p-3 rounded z-10">
            <p className="font-bold">Error loading video</p>
            <p className="text-sm">{videoError}</p>
          </div>
        )}
        <video
          ref={videoRef}
          src={src}
          className="max-h-full max-w-full"
          onClick={() => {
            const video = videoRef.current
            if (video) {
              if (isPlaying) video.pause()
              else video.play()
            }
          }}
        />
      </div>
      <VideoControls />
    </div>
  )
}
