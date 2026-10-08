import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderReel, type ReelProgress, type ReelRenderDeps } from './reelRenderer'
import { buildReelPlan } from './reelPlan'
import type { Clip, VideoProbe } from '@/types/clip'

const clip = (id: string, start: number, end: number): Clip => ({ id, name: id.toUpperCase(), start, end, color: '#000', tags: [], notes: '' })
const probe: VideoProbe = { width: 64, height: 36, fps: 30, duration: 100, hasAudio: true }
const clips = [clip('a', 0, 2), clip('b', 10, 11)]

function mockApi(overrides: Partial<Record<string, unknown>> = {}) {
  let job = 0
  const calls: string[] = []
  const api = {
    reelStart: vi.fn(async () => ({ ok: true, reelId: 'R', freeBytes: 1e12 })),
    reelAssemble: vi.fn(async () => {
      calls.push('assemble')
      return { success: true }
    }),
    reelCancel: vi.fn(async () => {
      calls.push('cancel')
    }),
    onReelProgress: vi.fn(),
    removeReelProgressListener: vi.fn(),
    clipEncodeStart: vi.fn(async (opts: { segments: unknown[]; reel?: unknown }) => {
      calls.push(`start:${JSON.stringify(opts.reel)}`)
      return { ok: true, jobId: `j${++job}` }
    }),
    clipEncodeAddOverlay: vi.fn(async () => ({ ok: true, index: 0 })),
    clipEncodeRun: vi.fn(async () => ({ success: true })),
    clipEncodeCancel: vi.fn(async () => {}),
    onClipEncodeProgress: vi.fn(),
    removeClipEncodeProgressListener: vi.fn(),
    ...overrides,
  }
  ;(window as unknown as { electronAPI: unknown }).electronAPI = api
  return { api, calls }
}

function deps(result: (id: string) => { success: boolean; error?: string } = () => ({ success: true })): ReelRenderDeps & { clipCalls: { id: string; reel: unknown; outputPath: string }[] } {
  const clipCalls: { id: string; reel: unknown; outputPath: string }[] = []
  return {
    clipCalls,
    renderCardRgba: vi.fn(async () => new Uint8Array(64 * 36 * 4)),
    renderClip: vi.fn(async (opts) => {
      clipCalls.push({ id: opts.clip.id, reel: opts.reel, outputPath: opts.outputPath })
      opts.onProgress(100)
      return result(opts.clip.id)
    }),
  }
}

const baseOpts = (plan = buildReelPlan(clips, [], 30, { titleCards: true, cardSeconds: 2 })) => ({
  plan,
  probe,
  annotations: [],
  quality: 'high' as const,
  sourcePath: '/v/game.mp4',
  outputPath: '/out/Reel - Test.mp4',
  keptClipPaths: null,
  onProgress: vi.fn(),
  signal: new AbortController().signal,
})

describe('renderReel', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('encodes cards and clips in order as temp reel parts, then joins with the plan\'s chapters', async () => {
    const { api, calls } = mockApi()
    const d = deps()
    const opts = baseOpts()
    const progress: ReelProgress[] = []
    opts.onProgress = vi.fn((p: ReelProgress) => progress.push(p))
    const result = await renderReel(opts, d)

    expect(result).toEqual({ success: true, keptClips: {} })
    // Card a, clip a, card b, clip b.
    expect(d.renderCardRgba).toHaveBeenCalledTimes(2)
    expect(d.clipCalls.map((c) => c.id)).toEqual(['a', 'b'])
    for (const c of d.clipCalls) expect(c.reel).toEqual({ reelId: 'R', keep: false })
    const cardStart = api.clipEncodeStart.mock.calls[0][0] as { segments: unknown; frameCount: number; reel: unknown }
    expect(cardStart.segments).toEqual([{ kind: 'hold', srcTime: 0, duration: 2 }])
    expect(cardStart.frameCount).toBe(60)
    expect((api.clipEncodeRun.mock.calls[0] as unknown[])[1]).toEqual({ spans: [{ overlayIndex: 0, frameStart: 0, frameCount: 60 }], magnifiers: [] })
    expect(api.reelAssemble).toHaveBeenCalledWith('R', { chapters: opts.plan.chapters })
    expect(calls).not.toContain('cancel')
    // Progress only moves forward and ends at 100.
    for (let i = 1; i < progress.length; i++) expect(progress[i].percent).toBeGreaterThanOrEqual(progress[i - 1].percent)
    expect(progress[progress.length - 1]).toMatchObject({ step: 'join', percent: 100 })
  })

  it('writes kept clips to their export paths and reports each one', async () => {
    mockApi()
    const d = deps()
    const opts = { ...baseOpts(), keptClipPaths: { a: '/out/01 - A.mp4', b: '/out/02 - B.mp4' } }
    const result = await renderReel(opts, d)
    expect(result.success).toBe(true)
    expect(result.keptClips).toEqual({ a: 'exported', b: 'exported' })
    expect(d.clipCalls[0]).toMatchObject({ outputPath: '/out/01 - A.mp4', reel: { reelId: 'R', keep: true } })
  })

  it('stops at a failed clip, cancels the reel and names the clip', async () => {
    const { api } = mockApi()
    const d = deps((id) => (id === 'b' ? { success: false, error: 'ffmpeg exited with code 1' } : { success: true }))
    const opts = { ...baseOpts(), keptClipPaths: { a: '/out/01 - A.mp4', b: '/out/02 - B.mp4' } }
    const result = await renderReel(opts, d)
    expect(result.success).toBe(false)
    expect(result.error).toBe('Clip 2 (B): ffmpeg exited with code 1')
    expect(result.keptClips).toEqual({ a: 'exported', b: 'failed' })
    expect(api.reelCancel).toHaveBeenCalledWith('R')
    expect(api.reelAssemble).not.toHaveBeenCalled()
  })

  it('cancels cleanly when aborted mid-way', async () => {
    const { api } = mockApi()
    const controller = new AbortController()
    const d = deps()
    d.renderClip = vi.fn(async () => {
      controller.abort()
      return { success: false, error: 'Cancelled' }
    })
    const result = await renderReel({ ...baseOpts(), signal: controller.signal }, d)
    expect(result).toMatchObject({ success: false, error: 'Cancelled' })
    expect(api.reelCancel).toHaveBeenCalledWith('R')
    expect(api.reelAssemble).not.toHaveBeenCalled()
  })

  it('warns when temp space looks too small, but still runs', async () => {
    mockApi({ reelStart: vi.fn(async () => ({ ok: true, reelId: 'R', freeBytes: 10 })) })
    const onLowSpace = vi.fn()
    const result = await renderReel({ ...baseOpts(), onLowSpace }, deps())
    expect(onLowSpace).toHaveBeenCalledOnce()
    expect(result.success).toBe(true)
  })

  it('reports a refused reel start without encoding anything', async () => {
    mockApi({ reelStart: vi.fn(async () => ({ ok: false, error: 'Reel denied: invalid destination' })) })
    const d = deps()
    const result = await renderReel(baseOpts(), d)
    expect(result).toMatchObject({ success: false, error: 'Reel denied: invalid destination' })
    expect(d.renderClip).not.toHaveBeenCalled()
  })
})
