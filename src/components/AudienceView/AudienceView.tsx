import { useEffect, useRef, useCallback } from 'react'

export default function AudienceView() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const laserRef = useRef<{ x: number; y: number; visible: boolean }>({ x: 0, y: 0, visible: false })
  const frameImageRef = useRef<HTMLImageElement | null>(null)
  const rafRef = useRef<number>(0)
  const imageDimsRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 })

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const cw = canvas.width
    const ch = canvas.height

    // Clear to black
    ctx.fillStyle = '#000000'
    ctx.fillRect(0, 0, cw, ch)

    // Draw the composited frame with letterbox/pillarbox
    const img = frameImageRef.current
    if (img && imageDimsRef.current.width > 0) {
      const iw = imageDimsRef.current.width
      const ih = imageDimsRef.current.height
      const scale = Math.min(cw / iw, ch / ih)
      const dw = iw * scale
      const dh = ih * scale
      const dx = (cw - dw) / 2
      const dy = (ch - dh) / 2

      ctx.drawImage(img, dx, dy, dw, dh)

      // Draw laser pointer
      const laser = laserRef.current
      if (laser.visible) {
        const lx = dx + laser.x * dw
        const ly = dy + laser.y * dh

        // Outer glow
        ctx.save()
        ctx.beginPath()
        ctx.arc(lx, ly, 16, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255, 0, 0, 0.25)'
        ctx.fill()

        // Inner dot
        ctx.beginPath()
        ctx.arc(lx, ly, 8, 0, Math.PI * 2)
        ctx.fillStyle = '#ff0000'
        ctx.shadowColor = '#ff0000'
        ctx.shadowBlur = 20
        ctx.fill()
        ctx.restore()
      }
    }
  }, [])

  // Resize canvas to fill viewport
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      drawFrame()
    }

    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [drawFrame])

  // Listen for frames from main window
  useEffect(() => {
    if (!window.electronAPI) return

    const img = new Image()
    frameImageRef.current = img

    img.onload = () => {
      imageDimsRef.current = { width: img.naturalWidth, height: img.naturalHeight }
      drawFrame()
    }

    window.electronAPI.onAudienceFrame((frameData: string) => {
      img.src = frameData
    })

    window.electronAPI.onAudienceLaser((pos) => {
      laserRef.current = pos
      drawFrame()
    })

    return () => {
      window.electronAPI.removeAudienceFrameListener()
      window.electronAPI.removeAudienceLaserListener()
    }
  }, [drawFrame])

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000', overflow: 'hidden', cursor: 'none' }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%' }}
      />
    </div>
  )
}
