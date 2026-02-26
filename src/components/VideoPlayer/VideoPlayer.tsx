import { useRef, useEffect, useState, useCallback } from 'react'
import { useVideoStore } from '@/stores/videoStore'
import { useDrawingStore } from '@/stores/drawingStore'
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

  // Freeze frame tracking: which freeze annotations have fired this playback session
  const triggeredFreezesRef = useRef<Set<string>>(new Set())
  const freezeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reset triggered freezes when user seeks or pauses
  const resetFreezes = useCallback(() => {
    triggeredFreezesRef.current.clear()
    if (freezeTimeoutRef.current) {
      clearTimeout(freezeTimeoutRef.current)
      freezeTimeoutRef.current = null
    }
  }, [])

  // Initialize video element in store
  useEffect(() => {
    if (videoRef.current) {
      setVideoElement(videoRef.current)
      onVideoRef?.(videoRef.current)
    }
    return () => {
      setVideoElement(null)
      onVideoRef?.(null)
      resetFreezes()
    }
  }, [setVideoElement, onVideoRef, resetFreezes])

  // Handle video events
  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const handleLoadedMetadata = () => {
      setDuration(video.duration)
    }

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime)

      // Freeze frame logic: check if we've crossed a freeze-frame annotation
      if (!video.paused) {
        const annotations = useDrawingStore.getState().annotations
        for (const ann of annotations) {
          if (!ann.freezeDuration || ann.freezeDuration <= 0) continue
          if (triggeredFreezesRef.current.has(ann.id)) continue

          // Check if current time is within a small window around the annotation's startTime
          const dt = video.currentTime - ann.startTime
          if (dt >= 0 && dt < 0.15) {
            triggeredFreezesRef.current.add(ann.id)
            video.pause()
            freezeTimeoutRef.current = setTimeout(() => {
              freezeTimeoutRef.current = null
              video.play()
            }, ann.freezeDuration * 1000)
            break  // Only trigger one freeze per timeupdate
          }
        }
      }
    }

    // Reset freeze tracking on seek
    const handleSeeking = () => resetFreezes()

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
    video.addEventListener('seeking', handleSeeking)

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata)
      video.removeEventListener('timeupdate', handleTimeUpdate)
      video.removeEventListener('play', handlePlay)
      video.removeEventListener('pause', handlePause)
      video.removeEventListener('ended', handleEnded)
      video.removeEventListener('error', handleError)
      video.removeEventListener('canplay', handleCanPlay)
      video.removeEventListener('seeking', handleSeeking)
    }
  }, [setCurrentTime, setDuration, setIsPlaying, resetFreezes])

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
