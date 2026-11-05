import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ExportDialog from './ExportDialog'
import { renderClip } from '@/export/clipRenderer'
import { useVideoStore } from '@/stores/videoStore'
import { useDrawingStore, type Annotation } from '@/stores/drawingStore'

vi.mock('@/export/clipRenderer', () => ({ renderClip: vi.fn() }))

describe('Export Video annotation wiring', () => {
  let root: Root
  let container: HTMLDivElement
  const close = vi.fn()
  const annotation = { id: 'a', startTime: 12, endTime: 15, freezeDuration: 2 } as Annotation

  beforeEach(async () => {
    vi.clearAllMocks()
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    useVideoStore.setState({ inPoint: 10, outPoint: 20, duration: 30 })
    useDrawingStore.setState({ annotations: [annotation] })
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: {
        saveFile: vi.fn().mockResolvedValue('/exports/video.mp4'),
        resolveVideoPath: vi.fn().mockResolvedValue('/videos/source.mp4'),
        probeVideo: vi.fn().mockResolvedValue({ width: 1920, height: 1080, fps: 60, duration: 30, hasAudio: true }),
        getFFmpegVersion: vi.fn().mockResolvedValue('test'),
      },
    })
    vi.mocked(renderClip).mockResolvedValue({ success: true })
    container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    await act(async () => root.render(createElement(ExportDialog, { onClose: close, videoSrc: 'local-video://test' })))
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    useDrawingStore.setState({ annotations: [] })
    vi.restoreAllMocks()
  })

  async function clickButton(text: string) {
    const button = [...container.querySelectorAll('button')].find((el) => el.textContent === text)
    expect(button).toBeDefined()
    await act(async () => button!.click())
  }

  it('defaults to burning live annotations into the selected in/out range and reports progress', async () => {
    expect(container.querySelector<HTMLInputElement>('#includeAnnotations')?.checked).toBe(true)
    expect(container.textContent).toContain('0:12') // includes the 2s freeze
    vi.mocked(renderClip).mockImplementation(async (opts) => {
      opts.onProgress(80)
      return { success: true }
    })
    await clickButton('Export')
    expect(renderClip).toHaveBeenCalledWith(expect.objectContaining({
      annotations: [annotation], includeDrawings: true,
      clip: { start: 10, end: 20 }, fps: 30, format: 'mp4',
      outputPath: '/exports/video.mp4', sourcePath: '/videos/source.mp4',
    }))
    expect(close).toHaveBeenCalledOnce()
  })

  it('can export a clean full-length video without drawings or annotation freezes', async () => {
    await act(async () => {
      container.querySelector<HTMLInputElement>('#includeAnnotations')!.click()
      container.querySelector<HTMLInputElement>('#useInOut')!.click()
    })
    await clickButton('Export')
    expect(renderClip).toHaveBeenCalledWith(expect.objectContaining({
      annotations: [], includeDrawings: false, clip: { start: 0, end: 30 },
    }))
  })

  it('routes GIF exports through the annotation renderer too', async () => {
    await clickButton('GIF Animation')
    await clickButton('Export')
    expect(window.electronAPI.saveFile).toHaveBeenCalledWith(expect.stringMatching(/\.gif$/))
    expect(renderClip).toHaveBeenCalledWith(expect.objectContaining({ annotations: [annotation], format: 'gif' }))
  })

  it('keeps the dialog open and shows probe errors instead of silently exporting without drawings', async () => {
    vi.mocked(window.electronAPI.probeVideo).mockResolvedValue({ error: 'Could not read video' })
    await clickButton('Export')
    expect(renderClip).not.toHaveBeenCalled()
    expect(close).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Could not read video')
  })

  it('aborts the renderer when the export dialog unmounts', async () => {
    await clickButton('Export')
    const { signal } = vi.mocked(renderClip).mock.calls[0][0]
    // Keep an export in flight so unmount exercises cancellation.
    vi.mocked(renderClip).mockImplementation(() => new Promise(() => {}))
    await clickButton('Export')
    const pendingSignal = vi.mocked(renderClip).mock.calls[1][0].signal
    await act(async () => root.unmount())
    expect(pendingSignal.aborted).toBe(true)
    expect(signal.aborted).toBe(false)
  })
})
