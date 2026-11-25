import { useEffect, useRef } from 'react'
import { useVideoStore } from '@/stores/videoStore'
import { liveOutput } from '@/utils/liveRate'
import { useSpeedSteps } from './useLiveReveal'

/**
 * The single writer of `video.playbackRate` and `video.muted`. The store keeps
 * the user's rate and mute setting; this applies them to the element, the rate
 * multiplied by the speed under the playhead: at once on any store change, seek or
 * play, and from a per-frame loop while playing so rate changes land on the
 * step edges.
 */
export function useSpeedPlayback(video: HTMLVideoElement | null): void {
  const steps = useSpeedSteps()
  const stepsRef = useRef(steps)
  const applyRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    stepsRef.current = steps
    applyRef.current?.()
  }, [steps])

  useEffect(() => {
    if (!video) return
    let frame = 0

    const apply = () => {
      const { playbackRate, isMuted, reverseRate, slowRecording } = useVideoStore.getState()
      const { rate, muted } = liveOutput({
        userRate: playbackRate,
        userMuted: isMuted,
        reversing: reverseRate > 0,
        steps: stepsRef.current,
        time: video.currentTime,
        recordingSpeed: slowRecording?.speed ?? null,
      })
      if (rate !== null && video.playbackRate !== rate) video.playbackRate = rate
      if (video.muted !== muted) video.muted = muted
    }

    const tick = () => {
      frame = 0
      if (video.paused) return
      apply()
      frame = requestAnimationFrame(tick)
    }

    const onPlay = () => {
      apply()
      if (!frame) frame = requestAnimationFrame(tick)
    }

    applyRef.current = apply
    apply()
    if (!video.paused) onPlay()
    video.addEventListener('play', onPlay)
    video.addEventListener('seeking', apply)
    const unsubscribe = useVideoStore.subscribe((state, prev) => {
      if (
        state.playbackRate !== prev.playbackRate ||
        state.isMuted !== prev.isMuted ||
        state.reverseRate !== prev.reverseRate ||
        state.slowRecording !== prev.slowRecording
      ) {
        apply()
      }
    })
    return () => {
      unsubscribe()
      video.removeEventListener('play', onPlay)
      video.removeEventListener('seeking', apply)
      cancelAnimationFrame(frame)
      applyRef.current = null
    }
  }, [video])
}
