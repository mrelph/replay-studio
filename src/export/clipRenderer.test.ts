import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { fabric } from '@/lib/fabric'
import type { Annotation } from '@/stores/drawingStore'
import type { VideoProbe } from '@/types/clip'
import { computeMagnifierSampleRect, renderClip } from './clipRenderer'
import { applyReveal } from './reveal'

describe('computeMagnifierSampleRect', () => {
  it('matches updateMagnifierContent\'s math when ref and video dims are equal (1:1, no scaling)', () => {
    // radius 60, zoom 2.5: size=120, sourceSize=48, centered on (200,150).
    const rect = computeMagnifierSampleRect(
      { left: 140, top: 90, radius: 60 },
      2.5,
      { width: 1920, height: 1080 },
      { width: 1920, height: 1080 }
    )
    expect(rect.size).toBe(120)
    expect(rect.sourceX).toBeCloseTo(200 - 24, 5) // centerX - sourceSize/2
    expect(rect.sourceY).toBeCloseTo(150 - 24, 5)
    expect(rect.sourceWidth).toBeCloseTo(48, 5)
    expect(rect.sourceHeight).toBeCloseTo(48, 5)
  })

  it('scales the sample rect when video dims differ from ref dims', () => {
    const rect = computeMagnifierSampleRect(
      { left: 0, top: 0, radius: 50 },
      2.5,
      { width: 100, height: 100 },
      { width: 200, height: 100 } // 2x scale on X only
    )
    // centerX=50, centerY=50, size=100, sourceSize=40
    // rawSourceX = (50 - 20) * scaleX(2) = 60; rawSourceY = (50-20)*1 = 30
    expect(rect.sourceX).toBeCloseTo(60, 5)
    expect(rect.sourceY).toBeCloseTo(30, 5)
    expect(rect.sourceWidth).toBeCloseTo(40 * 2, 5)
    expect(rect.sourceHeight).toBeCloseTo(40, 5)
  })

  it('clamps the source rect to stay within the video bounds near the top-left edge', () => {
    // Circle centered near (0,0) so the naive source rect would go negative.
    const rect = computeMagnifierSampleRect(
      { left: -50, top: -50, radius: 50 },
      2.5,
      { width: 1000, height: 1000 },
      { width: 1000, height: 1000 }
    )
    expect(rect.sourceX).toBe(0)
    expect(rect.sourceY).toBe(0)
    expect(rect.sourceWidth).toBeGreaterThan(0)
    expect(rect.sourceHeight).toBeGreaterThan(0)
  })

  it('clamps the source rect to stay within the video bounds near the bottom-right edge', () => {
    const videoDims = { width: 200, height: 200 }
    // Circle centered near the bottom-right corner.
    const rect = computeMagnifierSampleRect(
      { left: 170, top: 170, radius: 50 },
      1, // zoom 1 -> sourceSize == size == 100, definitely overflows a 200x200 frame
      { width: 200, height: 200 },
      videoDims
    )
    expect(rect.sourceX + rect.sourceWidth).toBeLessThanOrEqual(videoDims.width)
    expect(rect.sourceY + rect.sourceHeight).toBeLessThanOrEqual(videoDims.height)
  })
})

describe('renderClip draw-on', () => {
  const probe: VideoProbe = { width: 64, height: 36, fps: 30, duration: 10, hasAudio: false }
  const originalGetContext = HTMLCanvasElement.prototype.getContext

  // jsdom has no 2D canvas; stub a permissive context whose readback is an empty frame.
  beforeAll(() => {
    const mockContext = new Proxy({} as Record<string, unknown>, {
      get(target, prop: string) {
        if (prop in target) return target[prop]
        if (prop === 'getImageData') return (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4) })
        if (prop === 'measureText') return (text: string) => ({ width: (text?.length || 0) * 8 })
        if (prop === 'canvas') return { width: 0, height: 0 }
        if (prop === 'getContextAttributes') return () => ({})
        return () => undefined
      },
      set(target, prop: string, value) {
        target[prop] = value
        return true
      },
    })
    HTMLCanvasElement.prototype.getContext = (() => mockContext) as unknown as HTMLCanvasElement['getContext']
  })
  afterAll(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext
  })

  async function overlayCallsFor(drawIn: number | undefined, preReveal = false): Promise<number> {
    const clipEncodeAddOverlay = vi.fn().mockImplementation(async () => ({ ok: true, index: clipEncodeAddOverlay.mock.calls.length - 1 }))
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        clipEncodeStart: vi.fn().mockResolvedValue({ ok: true, jobId: 'job' }),
        clipEncodeAddOverlay,
        clipEncodeRun: vi.fn().mockResolvedValue({ success: true }),
        clipEncodeCancel: vi.fn().mockResolvedValue(undefined),
        onClipEncodeProgress: vi.fn(),
        removeClipEncodeProgressListener: vi.fn(),
      },
    })
    const object = new fabric.Line([0, 0, 40, 20], { stroke: '#f00', strokeWidth: 4 })
    if (preReveal) applyReveal(object, 'line', 0.4)
    const annotation = {
      id: 'a',
      toolType: 'line',
      startTime: 0,
      endTime: 2,
      drawIn,
      object,
    } as unknown as Annotation
    const result = await renderClip({
      clip: { start: 0, end: 2 },
      probe,
      annotations: [annotation],
      includeDrawings: true,
      quality: 'high',
      outputPath: '/out.mp4',
      sourcePath: '/src.mp4',
      onProgress: () => {},
      signal: new AbortController().signal,
    })
    expect(result).toEqual({ success: true })
    return clipEncodeAddOverlay.mock.calls.length
  }

  it('burns a draw-on into several overlays, and a static drawing into one', async () => {
    expect(await overlayCallsFor(0.4)).toBeGreaterThan(2)
    expect(await overlayCallsFor(undefined)).toBe(1)
  })

  it('does not bake a mid-reveal live object into the export', async () => {
    const rendered: Array<number[] | null | undefined> = []
    const original = fabric.Line.prototype.render
    fabric.Line.prototype.render = function (this: fabric.Line, ctx: CanvasRenderingContext2D) {
      rendered.push(this.strokeDashArray)
      return original.call(this, ctx)
    }
    try {
      await overlayCallsFor(undefined, true)
    } finally {
      fabric.Line.prototype.render = original
    }
    expect(rendered.length).toBeGreaterThan(0)
    expect(rendered.every((d) => !d)).toBe(true)
  })
})
