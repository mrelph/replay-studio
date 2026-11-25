import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useVideoStore } from './videoStore'
import { snapToFrame } from '@/utils/frames'

/** Just enough of an HTMLVideoElement for toggleFreeze. */
function fakeVideo(paused: boolean, currentTime: number) {
  const video = {
    paused,
    currentTime,
    play: vi.fn(() => {
      video.paused = false
      return Promise.resolve()
    }),
    pause: vi.fn(() => {
      video.paused = true
    }),
  }
  return video
}

describe('toggleFreeze', () => {
  beforeEach(() => {
    useVideoStore.setState({ videoElement: null, freezeTiming: null, reverseRate: 0, shuttleBaseRate: null })
  })

  it('stops a playing video on the current frame and starts timing', () => {
    const video = fakeVideo(false, 12.5)
    useVideoStore.getState().setVideoElement(video as unknown as HTMLVideoElement)
    useVideoStore.getState().toggleFreeze()
    expect(video.pause).toHaveBeenCalledOnce()
    expect(useVideoStore.getState().freezeTiming?.time).toBe(12.5)
  })

  it('starts timing on an already paused frame without touching playback', () => {
    const video = fakeVideo(true, 3)
    useVideoStore.getState().setVideoElement(video as unknown as HTMLVideoElement)
    useVideoStore.getState().toggleFreeze()
    expect(video.pause).not.toHaveBeenCalled()
    expect(video.play).not.toHaveBeenCalled()
    expect(useVideoStore.getState().freezeTiming?.time).toBe(3)
  })

  it('resumes when pressed again, leaving the timing for the play handler to record', () => {
    const video = fakeVideo(false, 7)
    useVideoStore.getState().setVideoElement(video as unknown as HTMLVideoElement)
    useVideoStore.getState().toggleFreeze()
    useVideoStore.getState().toggleFreeze()
    expect(video.play).toHaveBeenCalledOnce()
    expect(useVideoStore.getState().freezeTiming).not.toBeNull()
  })

  it('does nothing without a video, and a new video clears any timing', () => {
    useVideoStore.getState().toggleFreeze()
    expect(useVideoStore.getState().freezeTiming).toBeNull()
    const video = fakeVideo(true, 1)
    useVideoStore.getState().setVideoElement(video as unknown as HTMLVideoElement)
    useVideoStore.getState().toggleFreeze()
    useVideoStore.getState().setVideoElement(fakeVideo(true, 0) as unknown as HTMLVideoElement)
    expect(useVideoStore.getState().freezeTiming).toBeNull()
  })

  it('remembers the frame it started on as the resume frame, and follows frame steps', () => {
    const video = fakeVideo(false, 3.0569)
    useVideoStore.getState().setVideoElement(video as unknown as HTMLVideoElement)
    useVideoStore.getState().toggleFreeze()
    expect(useVideoStore.getState().freezeTiming).toMatchObject({ time: 3.0569, resumeTime: 3.0569 })
    useVideoStore.getState().noteFreezeFrame(3.1)
    expect(useVideoStore.getState().freezeTiming).toMatchObject({ time: 3.0569, resumeTime: 3.1 })
  })

  it('noteFreezeFrame does nothing when not timing', () => {
    const before = useVideoStore.getState()
    useVideoStore.getState().noteFreezeFrame(3.1)
    expect(useVideoStore.getState().freezeTiming).toBeNull()
    expect(useVideoStore.getState()).toBe(before)
  })
})

describe('captureDrawFrame', () => {
  beforeEach(() => {
    useVideoStore.setState({ videoElement: null, currentTime: 0, fps: 30, reverseRate: 0, shuttleBaseRate: null })
  })

  it('stops a playing video on the start of its current frame', () => {
    const video = fakeVideo(false, 3.0569)
    useVideoStore.setState({ videoElement: video as unknown as HTMLVideoElement })
    const time = useVideoStore.getState().captureDrawFrame()
    expect(time).toBe(snapToFrame(3.0569, 30))
    expect(video.pause).toHaveBeenCalledOnce()
    expect(video.currentTime).toBe(time)
    expect(useVideoStore.getState().currentTime).toBe(time)
  })

  it('leaves a paused video on an already snapped frame alone', () => {
    const snapped = snapToFrame(3.0569, 30)
    const video = fakeVideo(true, snapped)
    let assigned = false
    Object.defineProperty(video, 'currentTime', {
      get: () => snapped,
      set: () => { assigned = true },
    })
    useVideoStore.setState({ videoElement: video as unknown as HTMLVideoElement })
    expect(useVideoStore.getState().captureDrawFrame()).toBe(snapped)
    expect(video.pause).not.toHaveBeenCalled()
    expect(assigned).toBe(false)
    expect(useVideoStore.getState().currentTime).toBe(snapped)
  })

  it('ends an automatic hold it lands on, so the player drops its auto-resume', () => {
    const snapped = snapToFrame(3.0569, 30)
    const video = fakeVideo(true, snapped)
    useVideoStore.setState({ videoElement: video as unknown as HTMLVideoElement })
    useVideoStore.getState().beginAutoHold(snapped)
    const seen: Array<unknown> = []
    const unsubscribe = useVideoStore.subscribe((state, prev) => {
      if (prev.autoHold && !state.autoHold) seen.push(prev.autoHold)
    })
    useVideoStore.getState().captureDrawFrame()
    unsubscribe()
    expect(useVideoStore.getState().autoHold).toBeNull()
    expect(seen).toHaveLength(1)
    expect(video.pause).not.toHaveBeenCalled()
  })

  it('returns the store time when there is no video', () => {
    useVideoStore.setState({ currentTime: 4.2 })
    expect(useVideoStore.getState().captureDrawFrame()).toBe(4.2)
  })
})

describe('pendingPreview', () => {
  it('holds the frame just drawn on until cleared', () => {
    useVideoStore.getState().setPendingPreview(2.5)
    expect(useVideoStore.getState().pendingPreview).toBe(2.5)
    useVideoStore.getState().setPendingPreview(null)
    expect(useVideoStore.getState().pendingPreview).toBeNull()
  })
})

describe('autoHold', () => {
  beforeEach(() => {
    useVideoStore.setState({ videoElement: null, autoHold: null })
  })

  it('tracks an automatic hold', () => {
    const s = useVideoStore.getState()
    expect(s.autoHold).toBeNull()
    s.beginAutoHold(3.2)
    expect(useVideoStore.getState().autoHold).toMatchObject({ time: 3.2, endedAt: null })
    useVideoStore.getState().endAutoHold()
    expect(useVideoStore.getState().autoHold!.endedAt).not.toBeNull()
    useVideoStore.getState().clearAutoHold()
    expect(useVideoStore.getState().autoHold).toBeNull()
  })

  it('endAutoHold with no hold is a no-op', () => {
    useVideoStore.getState().clearAutoHold()
    useVideoStore.getState().endAutoHold()
    expect(useVideoStore.getState().autoHold).toBeNull()
  })

  it('setVideoElement clears a hold', () => {
    useVideoStore.getState().beginAutoHold(1)
    useVideoStore.getState().setVideoElement(null)
    expect(useVideoStore.getState().autoHold).toBeNull()
  })
})
