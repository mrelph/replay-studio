import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import { fabric } from '@/lib/fabric'
import type { Annotation } from '@/stores/drawingStore'
import type { VideoProbe } from '@/types/clip'
import { computeMagnifierSampleRect, renderClip } from './clipRenderer'
import { applyReveal } from './reveal'
import { setVoiceAudio } from '@/voice/voiceAudio'

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

  async function overlayCallsFor(drawIn: number | undefined, preReveal = false, revealDelay?: number): Promise<number> {
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
      revealDelay,
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
    expect(await overlayCallsFor(undefined, false, 1)).toBe(2)
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

describe('renderClip speed regions', () => {
  it('fails before encoding when more than 40 regions fall in the clip', async () => {
    const clipEncodeStart = vi.fn().mockResolvedValue({ ok: true, jobId: 'job' })
    Object.defineProperty(window, 'electronAPI', { configurable: true, value: { clipEncodeStart } })
    const speedRegions = Array.from({ length: 41 }, (_, i) => ({ start: i * 0.2, end: i * 0.2 + 0.15, speed: 0.5 }))
    const result = await renderClip({
      clip: { start: 0, end: 10 },
      probe: { width: 64, height: 36, fps: 30, duration: 10, hasAudio: false },
      annotations: [],
      speedRegions,
      includeDrawings: false,
      quality: 'high',
      outputPath: '/out.mp4',
      sourcePath: '/src.mp4',
      onProgress: () => {},
      signal: new AbortController().signal,
    })
    expect(result).toEqual({ success: false, error: 'Too many speed regions in this clip (max 40)' })
    expect(clipEncodeStart).not.toHaveBeenCalled()
  })
})

describe('renderClip voice', () => {
  const probe = { width: 64, height: 36, fps: 30, duration: 10, hasAudio: true }
  const setup = () => {
    const clipEncodeStart = vi.fn().mockResolvedValue({ ok: true, jobId: 'job' })
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        clipEncodeStart,
        clipEncodeRun: vi.fn().mockResolvedValue({ success: true }),
        clipEncodeCancel: vi.fn(),
        onClipEncodeProgress: vi.fn(),
        removeClipEncodeProgressListener: vi.fn(),
      },
    })
    return clipEncodeStart
  }
  const run = (over: Partial<Parameters<typeof renderClip>[0]> = {}) =>
    renderClip({
      clip: { start: 0, end: 10 },
      probe,
      annotations: [],
      includeDrawings: false,
      quality: 'high',
      outputPath: '/out.mp4',
      sourcePath: '/src.mp4',
      onProgress: () => {},
      signal: new AbortController().signal,
      ...over,
    })
  setVoiceAudio('frozen', { arrayBuffer: async () => new Uint8Array([7, 7]).buffer } as unknown as Blob)
  const frozen = { id: 'frozen', startTime: 3.01, duration: 3, frozen: true, mime: 'audio/webm' }
  const carrier = { id: 'f', startTime: 3, freezeDuration: 1, toolType: 'freeze' } as unknown as Annotation

  it('lengthens the carrier\'s hold and sends the voice for MP4', async () => {
    const start = setup()
    expect(await run({ annotations: [carrier], voiceClips: [frozen], voiceDuck: 'off' })).toEqual({ success: true })
    const sent = start.mock.calls[0][0]
    expect(sent.segments).toEqual([
      { kind: 'play', srcStart: 0, srcEnd: 3 },
      { kind: 'hold', srcTime: 3, duration: 3 },
      { kind: 'play', srcStart: 3, srcEnd: 10 },
    ])
    expect(sent.voice).toEqual({ tracks: [{ data: new Uint8Array([7, 7]), outStart: 3, duration: 3 }], duckWindows: [], duckGain: 0 })
    expect(sent).not.toHaveProperty('forceAudio')
  })

  it('keeps the hold but sends no voice for GIF', async () => {
    const start = setup()
    await run({ voiceClips: [frozen], format: 'gif' })
    const sent = start.mock.calls[0][0]
    expect(sent.segments).toContainEqual({ kind: 'hold', srcTime: 3.01, duration: 3 })
    expect(sent).not.toHaveProperty('voice')
  })

  it('sends neither voice nor forceAudio with no voice clips, and forceAudio only when asked', async () => {
    const start = setup()
    await run({ voiceClips: [] })
    expect(start.mock.calls[0][0]).not.toHaveProperty('voice')
    expect(start.mock.calls[0][0]).not.toHaveProperty('forceAudio')
    await run({ forceAudio: true })
    expect(start.mock.calls[1][0].forceAudio).toBe(true)
  })

  it('fails before encoding with more than 40 voice clips in the clip', async () => {
    const start = setup()
    const many = Array.from({ length: 41 }, (_, i) => ({ id: `v${i}`, startTime: i * 0.2, duration: 0.3, frozen: false, mime: 'audio/webm' }))
    expect(await run({ voiceClips: many })).toEqual({ success: false, error: 'Too many voice clips in this clip (max 40)' })
    expect(start).not.toHaveBeenCalled()
  })
})
