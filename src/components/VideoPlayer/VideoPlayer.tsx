import { useRef, useEffect, useState, useCallback } from 'react'
import { useVideoStore } from '@/stores/videoStore'
import { useDrawingStore } from '@/stores/drawingStore'
import VideoControls from './VideoControls'
import { toast } from '@/components/ui'
import { formatTimecode } from '@/utils/frames'
import { MAX_PAUSE_DRIFT_SECONDS, recordedHold, setFreezeAt } from '@/utils/freezeMarkers'

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
  const lastTimeRef = useRef<number>(0)
  // True only while a freeze-triggered video.pause() is in flight, so the
  // 'pause' event handler can tell that apart from a user-initiated pause.
  const isFreezePauseRef = useRef(false)
  // True while the freeze logic's own snap-to-frame seek is in flight, so
  // 'seeking' doesn't treat it as a user seek (which cancels the resume timer).
  const isFreezeSeekRef = useRef(false)

  // Reset triggered freezes when user seeks or pauses
  const resetFreezes = useCallback(() => {
    triggeredFreezesRef.current.clear()
    lastTimeRef.current = 0
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
      const { inPoint, outPoint, isLooping } = useVideoStore.getState()

      // Enforce out point: when playback reaches the out point, loop or pause
      if (outPoint !== null && video.currentTime >= outPoint) {
        if (isLooping) {
          video.currentTime = inPoint ?? 0
        } else {
          video.currentTime = outPoint
          video.pause()
        }
      }

      setCurrentTime(video.currentTime)

      // Freeze frame logic: detect when playback crosses a freeze annotation's startTime
      if (!video.paused) {
        const prevTime = lastTimeRef.current
        const curTime = video.currentTime
        const annotations = useDrawingStore.getState().annotations
        for (const ann of annotations) {
          if (!ann.freezeDuration || ann.freezeDuration <= 0) continue
          if (triggeredFreezesRef.current.has(ann.id)) continue

          // Trigger if we crossed the startTime between the last update and now
          if (prevTime <= ann.startTime && curTime >= ann.startTime) {
            triggeredFreezesRef.current.add(ann.id)
            isFreezePauseRef.current = true
            if (video.currentTime !== ann.startTime) {
              isFreezeSeekRef.current = true
              video.currentTime = ann.startTime
            }
            video.pause()
            freezeTimeoutRef.current = setTimeout(() => {
              freezeTimeoutRef.current = null
              // Don't auto-resume past the out point; respect looping instead.
              const { outPoint, isLooping, inPoint } = useVideoStore.getState()
              if (outPoint !== null && video.currentTime >= outPoint) {
                if (isLooping) {
                  video.currentTime = inPoint ?? 0
                  video.play()
                }
                return
              }
              video.play()
            }, ann.freezeDuration * 1000)
            break
          }
        }
      }
      lastTimeRef.current = video.currentTime
    }

    // Enforce looping when no out point is set — loop from start on video end
    const handleEnding = () => {
      const { isLooping, inPoint } = useVideoStore.getState()
      if (isLooping) {
        video.currentTime = inPoint ?? 0
        video.play()
      }
    }

    // Reset freeze tracking on seek. Start crossing-detection from the seek
    // target, not 0 — otherwise the first timeupdate after a seek "crosses"
    // every earlier freeze and yanks playback back to it.
    const handleSeeking = () => {
      if (isFreezeSeekRef.current) {
        isFreezeSeekRef.current = false
        return
      }
      resetFreezes()
      lastTimeRef.current = video.currentTime
      // Stepping a few frames while timing a freeze picks the exact frame;
      // seeking away means the coach moved on.
      const timing = useVideoStore.getState().freezeTiming
      if (timing && Math.abs(video.currentTime - timing.time) > MAX_PAUSE_DRIFT_SECONDS) {
        useVideoStore.getState().cancelFreezeTiming()
        toast('info', 'Freeze cancelled: the playhead moved')
      }
    }

    const handlePlay = () => {
      setIsPlaying(true)
      const timing = useVideoStore.getState().freezeTiming
      if (!timing) return
      useVideoStore.getState().cancelFreezeTiming()
      const hold = recordedHold(timing.time, video.currentTime, (performance.now() - timing.at) / 1000)
      if (!hold.record) {
        if (hold.reason === 'too-short') toast('info', 'Freeze too short: nothing recorded')
        return
      }
      const { fps } = useVideoStore.getState()
      const id = setFreezeAt(video.currentTime, hold.seconds, fps)
      if (!id) return
      // Playback is resuming from this very frame; the coach already held it
      // live, so don't let the new freeze fire again right now.
      triggeredFreezesRef.current.add(id)
      const stamp = formatTimecode(video.currentTime, fps)
      toast('success', hold.capped ? `Freeze recorded at ${stamp} (capped at ${hold.seconds}s)` : `${hold.seconds}s freeze recorded at ${stamp}`)
    }
    const handlePause = () => {
      setIsPlaying(false)
      if (isFreezePauseRef.current) {
        // This pause was triggered by the freeze-frame logic itself — leave
        // the pending resume timer alone.
        isFreezePauseRef.current = false
      } else if (freezeTimeoutRef.current) {
        // A real user/manual pause during a freeze hold — cancel the
        // scheduled auto-resume so playback stays paused.
        clearTimeout(freezeTimeoutRef.current)
        freezeTimeoutRef.current = null
      }
    }
    const handleEnded = () => {
      handleEnding()
      if (!useVideoStore.getState().isLooping) {
        setIsPlaying(false)
      }
    }
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
    // Pressing Freeze while an existing freeze is playing out takes it over:
    // stop the auto-resume so the coach's own timing replaces its length.
    const unsubscribeFreeze = useVideoStore.subscribe((state, prev) => {
      if (state.freezeTiming && !prev.freezeTiming && freezeTimeoutRef.current) {
        clearTimeout(freezeTimeoutRef.current)
        freezeTimeoutRef.current = null
      }
    })

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata)
      video.removeEventListener('timeupdate', handleTimeUpdate)
      video.removeEventListener('play', handlePlay)
      video.removeEventListener('pause', handlePause)
      video.removeEventListener('ended', handleEnded)
      video.removeEventListener('error', handleError)
      video.removeEventListener('canplay', handleCanPlay)
      video.removeEventListener('seeking', handleSeeking)
      unsubscribeFreeze()
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
          // CORS mode keeps canvases that draw this video readable (audience
          // stream, magnifier, trackers). local-video:// is a standard scheme
          // that answers with access-control-allow-origin: *.
          crossOrigin="anonymous"
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
