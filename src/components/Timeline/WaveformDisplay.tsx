import { useRef, useEffect } from 'react'
import { useWaveformStore } from '@/stores/waveformStore'

interface WaveformDisplayProps {
  width: number
  height: number
}

export default function WaveformDisplay({ width, height }: WaveformDisplayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const amplitudes = useWaveformStore((s) => s.amplitudes)
  const isLoading = useWaveformStore((s) => s.isLoading)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !amplitudes || width === 0 || height === 0) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = height * dpr
    ctx.scale(dpr, dpr)

    ctx.clearRect(0, 0, width, height)

    // Find max amplitude for normalization
    let maxAmp = 0
    for (let i = 0; i < amplitudes.length; i++) {
      if (amplitudes[i] > maxAmp) maxAmp = amplitudes[i]
    }
    if (maxAmp === 0) return

    const barWidth = width / amplitudes.length
    const midY = height / 2

    ctx.fillStyle = 'rgba(99, 102, 241, 0.12)' // accent-ish subtle color

    for (let i = 0; i < amplitudes.length; i++) {
      const normalized = amplitudes[i] / maxAmp
      const barHeight = normalized * midY * 0.9
      const x = i * barWidth

      // Draw mirrored bars
      ctx.fillRect(x, midY - barHeight, Math.max(barWidth - 0.5, 0.5), barHeight * 2)
    }
  }, [amplitudes, width, height])

  if (!amplitudes && !isLoading) return null

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-0 pointer-events-none"
      style={{ width, height }}
    />
  )
}
