import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useVideoStore } from '@/stores/videoStore'
import { useDrawingStore } from '@/stores/drawingStore'
import { useSpeedStore } from '@/stores/speedStore'
import { annotationStateAt, type ElapsedBetween } from '@/export/annotationTiming'
import { applyReveal, stripReveal } from '@/export/reveal'
import { stepLiveReveal, type ArmedReveal } from '@/export/liveReveal'
import { buildSpeedSteps, presentationOffset, type SpeedStep } from '@/export/speedMap'

/** The loaded video's speed steps, or undefined when it has no speed regions (source time is on-screen time). */
export function useSpeedSteps(): SpeedStep[] | undefined {
  const regions = useSpeedStore((s) => s.regions)
  const duration = useVideoStore((s) => s.duration)
  const fps = useVideoStore((s) => s.fps)
  return useMemo(() => (regions.length > 0 ? buildSpeedSteps(regions, duration, fps) : undefined), [regions, duration, fps])
}

/** Presentation-time elapsed function for `steps`; undefined means source-time difference. */
export function elapsedFor(steps: SpeedStep[] | undefined): ElapsedBetween | undefined {
  return steps ? (fromSrc, toSrc) => presentationOffset(steps, fromSrc, toSrc) : undefined
}

/**
 * Draws annotations on in the live canvas while the video plays or an
 * automatic freeze hold is active. The loop owns visibility, opacity and
 * reveal while it runs and reads the video element directly each frame; on
 * stop it strips every reveal so a paused user sees finished shapes.
 */
export function useLiveReveal(canvasRef: RefObject<fabric.Canvas | null>, videoElement: HTMLVideoElement | null): void {
  const isPlaying = useVideoStore((s) => s.isPlaying)
  const holdActive = useVideoStore((s) => s.autoHold !== null && s.autoHold.endedAt === null)
  const startRef = useRef<(() => void) | null>(null)
  const speedSteps = useSpeedSteps()
  const speedStepsRef = useRef(speedSteps)

  useEffect(() => {
    speedStepsRef.current = speedSteps
  }, [speedSteps])

  useEffect(() => {
    if (!videoElement) return
    const video = videoElement
    let stop: (() => void) | null = null

    const start = () => {
      if (stop) return
      const armed = new Map<string, ArmedReveal>()
      let applied = new Map<string, { object: unknown; visible: boolean; opacity: number; fraction: number }>()
      // Annotations created while the loop runs (drawn during playback or a
      // hold) stay finished until playback leaves them.
      const known = new Set(useDrawingStore.getState().annotations.map((a) => a.id))
      const fresh = new Set<string>()
      let prevTime = video.currentTime
      let frame = 0

      stop = () => {
        cancelAnimationFrame(frame)
        stop = null
        const time = video.currentTime
        const elapsed = elapsedFor(speedStepsRef.current)
        for (const annotation of useDrawingStore.getState().annotations) {
          const { visible, opacity } = annotationStateAt(annotation, time, elapsed)
          annotation.object.visible = visible
          annotation.object.opacity = opacity
          stripReveal(annotation.object)
        }
        canvasRef.current?.requestRenderAll()
      }

      const tick = () => {
        const { autoHold, fps } = useVideoStore.getState()
        const playing = !video.paused
        if (!playing && !(autoHold !== null && autoHold.endedAt === null)) {
          stop?.()
          return
        }

        const time = video.currentTime
        const annotations = useDrawingStore.getState().annotations
        const speedSteps = speedStepsRef.current
        const elapsed = elapsedFor(speedSteps)
        for (const annotation of annotations) {
          if (!known.has(annotation.id)) {
            known.add(annotation.id)
            fresh.add(annotation.id)
          } else if (fresh.has(annotation.id) && (time < annotation.startTime - 1 / fps || time > annotation.endTime)) {
            fresh.delete(annotation.id)
          }
        }

        const reveals = stepLiveReveal({
          annotations: annotations.filter((a) => !fresh.has(a.id)),
          prevTime,
          time,
          playing,
          autoHold,
          now: performance.now(),
          fps,
          armed,
          speedSteps,
        })

        const next = new Map<string, { object: unknown; visible: boolean; opacity: number; fraction: number }>()
        let changed = applied.size !== annotations.length
        for (const annotation of annotations) {
          const state = annotationStateAt(annotation, time, elapsed)
          const { fraction, due } = reveals.get(annotation.id) ?? { fraction: 1, due: true }
          const visible = state.visible && due
          const opacity = state.opacity
          annotation.object.visible = visible
          annotation.object.opacity = opacity
          applyReveal(annotation.object, annotation.toolType, fraction, { dashed: annotation.dashed })
          const last = applied.get(annotation.id)
          if (!last || last.object !== annotation.object || last.visible !== visible || last.opacity !== opacity || last.fraction !== fraction || fraction < 1) {
            changed = true
          }
          next.set(annotation.id, { object: annotation.object, visible, opacity, fraction })
        }
        applied = next
        if (changed) canvasRef.current?.requestRenderAll()

        prevTime = time
        frame = requestAnimationFrame(tick)
      }

      frame = requestAnimationFrame(tick)
    }

    startRef.current = start
    // The play event restarts the loop even if a batched pause/play left the
    // store's isPlaying unchanged.
    video.addEventListener('play', start)
    return () => {
      video.removeEventListener('play', start)
      startRef.current = null
      stop?.()
    }
  }, [canvasRef, videoElement])

  useEffect(() => {
    if (isPlaying || holdActive) startRef.current?.()
  }, [isPlaying, holdActive])
}
