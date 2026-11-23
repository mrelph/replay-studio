import { useEffect, useRef, type RefObject } from 'react'
import { useVideoStore } from '@/stores/videoStore'
import { useDrawingStore } from '@/stores/drawingStore'
import { annotationStateAt } from '@/export/annotationTiming'
import { applyReveal, stripReveal } from '@/export/reveal'
import { stepLiveReveal } from '@/export/liveReveal'

/**
 * Draws annotations on in the live canvas while the video plays or an
 * automatic freeze hold is active. The loop owns visibility, opacity and
 * reveal while it runs and reads the video element directly each frame; on
 * stop it strips every reveal so a paused user sees finished shapes.
 */
export function useLiveReveal(canvasRef: RefObject<fabric.Canvas | null>, videoElement: HTMLVideoElement | null): void {
  const isPlaying = useVideoStore((s) => s.isPlaying)
  const holdActive = useVideoStore((s) => s.autoHold !== null && s.autoHold.endedAt === null)
  const stopRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    return () => stopRef.current?.()
  }, [videoElement])

  useEffect(() => {
    if (!videoElement || stopRef.current) return
    if (!isPlaying && !holdActive) return

    const video = videoElement
    const armed = new Set<string>()
    // Annotations created while the loop runs (drawn during playback or a
    // hold) stay finished until playback leaves them.
    const known = new Set(useDrawingStore.getState().annotations.map((a) => a.id))
    const fresh = new Set<string>()
    let prevTime = video.currentTime
    let frame = 0

    const stop = () => {
      cancelAnimationFrame(frame)
      stopRef.current = null
      for (const annotation of useDrawingStore.getState().annotations) stripReveal(annotation.object)
      canvasRef.current?.requestRenderAll()
    }

    const tick = () => {
      const { autoHold, fps } = useVideoStore.getState()
      const playing = !video.paused
      if (!playing && !(autoHold !== null && autoHold.endedAt === null)) {
        stop()
        return
      }

      const time = video.currentTime
      const annotations = useDrawingStore.getState().annotations
      for (const annotation of annotations) {
        if (!known.has(annotation.id)) {
          known.add(annotation.id)
          fresh.add(annotation.id)
        } else if (fresh.has(annotation.id) && (time < annotation.startTime - 1 / fps || time > annotation.endTime)) {
          fresh.delete(annotation.id)
        }
      }

      const fractions = stepLiveReveal({
        annotations: annotations.filter((a) => !fresh.has(a.id)),
        prevTime,
        time,
        playing,
        autoHold,
        now: performance.now(),
        fps,
        armed,
      })

      for (const annotation of annotations) {
        const { visible, opacity } = annotationStateAt(annotation, time)
        annotation.object.visible = visible
        annotation.object.opacity = opacity
        applyReveal(annotation.object, annotation.toolType, fractions.get(annotation.id) ?? 1)
      }
      canvasRef.current?.requestRenderAll()

      prevTime = time
      frame = requestAnimationFrame(tick)
    }

    stopRef.current = stop
    frame = requestAnimationFrame(tick)
  }, [canvasRef, videoElement, isPlaying, holdActive])
}
