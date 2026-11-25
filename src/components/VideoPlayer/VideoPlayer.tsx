import { useRef, useEffect, useState, useCallback } from 'react'
import { useVideoStore } from '@/stores/videoStore'
import { useDrawingStore } from '@/stores/drawingStore'
import VideoControls from './VideoControls'
import { toast } from '@/components/ui'
import { formatTimecode, frameIndexAt, snapToFrame } from '@/utils/frames'
import { MAX_PAUSE_DRIFT_SECONDS, autoFreezeOwnsFrame, frameHasDrawings, recordedHold, setFrameFreeze } from '@/utils/freezeMarkers'
import { previewHoldFor } from '@/utils/holdPreview'
import { useSpeedPlayback } from '@/hooks/useSpeedPlayback'
import type { Annotation } from '@/stores/drawingStore'

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
    videoElement,
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
    useVideoStore.getState().clearAutoHold()
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

    // Holds the video on a freeze's frame, then resumes once its time is up.
    const startHold = (ann: Annotation) => {
      if (!video.paused) isFreezePauseRef.current = true
      useVideoStore.getState().beginAutoHold(ann.startTime)
      if (video.currentTime !== ann.startTime) {
        isFreezeSeekRef.current = true
        video.currentTime = ann.startTime
      }
      if (!video.paused) video.pause()
      freezeTimeoutRef.current = setTimeout(() => {
        freezeTimeoutRef.current = null
        useVideoStore.getState().endAutoHold()
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
      }, (ann.freezeDuration ?? 0) * 1000)
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
            startHold(ann)
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
      const { freezeTiming: timing, pendingPreview, fps } = useVideoStore.getState()
      if (timing && Math.abs(video.currentTime - timing.time) > MAX_PAUSE_DRIFT_SECONDS) {
        useVideoStore.getState().cancelFreezeTiming()
        toast('info', 'Freeze cancelled: the playhead moved')
      } else if (timing) {
        useVideoStore.getState().noteFreezeFrame(video.currentTime)
      }
      if (pendingPreview !== null && frameIndexAt(video.currentTime, fps) !== frameIndexAt(pendingPreview, fps)) {
        useVideoStore.getState().setPendingPreview(null)
      }
    }

    // The first Play after drawing holds the frame for its freeze, revealing
    // the drawings in order, then plays on: what the export will show.
    const interceptPlay = () => {
      if (!video.paused) return false
      const { pendingPreview, fps } = useVideoStore.getState()
      const freeze = previewHoldFor(useDrawingStore.getState().annotations, pendingPreview, video.currentTime, fps)
      if (!freeze) return false
      useVideoStore.getState().setPendingPreview(null)
      // The frame's hold is calculated from its drawings; nothing to record.
      useVideoStore.getState().cancelFreezeTiming()
      triggeredFreezesRef.current.add(freeze.id)
      startHold(freeze)
      return true
    }

    const handlePlay = () => {
      setIsPlaying(true)
      useVideoStore.getState().setPendingPreview(null)
      if (freezeTimeoutRef.current) {
        // Play during a hold cuts it short and plays on, as a pause during
        // a hold stops it.
        clearTimeout(freezeTimeoutRef.current)
        freezeTimeoutRef.current = null
        useVideoStore.getState().endAutoHold()
      }
      const timing = useVideoStore.getState().freezeTiming
      if (!timing) return
      useVideoStore.getState().cancelFreezeTiming()
      // video.currentTime has already moved on by now; record on the frame
      // the pause was resumed from.
      const { fps } = useVideoStore.getState()
      const time = snapToFrame(timing.resumeTime, fps)
      // A drawn-on frame's freeze is calculated or typed, not timed: leave it alone.
      if (autoFreezeOwnsFrame(useDrawingStore.getState().annotations, time, fps)) {
        toast('info', "This frame's freeze is set from its drawings")
        return
      }
      const hold = recordedHold(timing.time, time, (performance.now() - timing.at) / 1000)
      if (!hold.record) {
        if (hold.reason === 'too-short') toast('info', 'Freeze too short: nothing recorded')
        return
      }
      const id = setFrameFreeze(time, hold.seconds, fps, { auto: false })
      if (!id) return
      // Drawings already on the frame (a 1.7.0 project) reveal in order in the new hold.
      if (frameHasDrawings(useDrawingStore.getState().annotations, time, fps)) useDrawingStore.getState().syncFrames([time])
      // Playback is resuming from this very frame; the coach already held it
      // live, so don't let the new freeze fire again right now.
      triggeredFreezesRef.current.add(id)
      const stamp = formatTimecode(time, fps)
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
        useVideoStore.getState().clearAutoHold()
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
    useVideoStore.getState().setInterceptPlay(interceptPlay)
    // Pressing Freeze while an existing freeze is playing out takes it over:
    // stop the auto-resume so the coach's own timing replaces its length.
    // Starting a drawing clears the hold, which stops the auto-resume too.
    const unsubscribeFreeze = useVideoStore.subscribe((state, prev) => {
      const takenOver = state.freezeTiming && !prev.freezeTiming
      const holdCleared = prev.autoHold && !state.autoHold
      if ((takenOver || holdCleared) && freezeTimeoutRef.current) {
        clearTimeout(freezeTimeoutRef.current)
        freezeTimeoutRef.current = null
        useVideoStore.getState().clearAutoHold()
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
      useVideoStore.getState().setInterceptPlay(null)
      unsubscribeFreeze()
    }
  }, [setCurrentTime, setDuration, setIsPlaying, resetFreezes])

  useSpeedPlayback(videoElement)

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
              else useVideoStore.getState().play()
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
