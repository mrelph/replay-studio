import { useEffect, useRef } from 'react'
import { useAudienceStore } from '@/stores/audienceStore'

interface UseAudienceStreamOptions {
  videoElement: HTMLVideoElement | null
  fabricCanvas: fabric.Canvas | null
}

export function useAudienceStream({ videoElement, fabricCanvas }: UseAudienceStreamOptions) {
  const isAudienceOpen = useAudienceStore((s) => s.isAudienceOpen)
  const rafRef = useRef<number>(0)
  const lastFrameTimeRef = useRef<number>(0)
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    if (!isAudienceOpen || !videoElement || !fabricCanvas || !window.electronAPI) {
      return
    }

    if (!offscreenCanvasRef.current) {
      offscreenCanvasRef.current = document.createElement('canvas')
    }
    const offscreen = offscreenCanvasRef.current

    const targetFps = 30
    const frameInterval = 1000 / targetFps
    let stopped = false

    const captureFrame = (timestamp: number) => {
      if (stopped) return

      const elapsed = timestamp - lastFrameTimeRef.current
      if (elapsed >= frameInterval) {
        lastFrameTimeRef.current = timestamp - (elapsed % frameInterval)

        const vw = videoElement.videoWidth
        const vh = videoElement.videoHeight
        if (vw > 0 && vh > 0) {
          // Only resize when dimensions change
          if (offscreen.width !== vw || offscreen.height !== vh) {
            offscreen.width = vw
            offscreen.height = vh
          }
          const ctx = offscreen.getContext('2d')
          if (ctx) {
            try {
              // Draw video frame
              ctx.drawImage(videoElement, 0, 0, vw, vh)

              // Draw fabric canvas (annotations) on top, scaled to match video
              const fabricEl = fabricCanvas.getElement()
              if (fabricEl) {
                ctx.drawImage(fabricEl, 0, 0, vw, vh)
              }

              // Convert to JPEG and send
              const dataUrl = offscreen.toDataURL('image/jpeg', 0.85)
              window.electronAPI.sendFrameToAudience(dataUrl)
            } catch (err) {
              // Tainted canvas or other error - try without toDataURL
              // Fall back to sending just the fabric canvas
              console.warn('Frame capture error:', err)
            }
          }
        }
      }

      rafRef.current = requestAnimationFrame(captureFrame)
    }

    rafRef.current = requestAnimationFrame(captureFrame)

    return () => {
      stopped = true
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = 0
      }
    }
  }, [isAudienceOpen, videoElement, fabricCanvas])
}
