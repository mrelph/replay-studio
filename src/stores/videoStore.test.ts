import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useVideoStore } from './videoStore'

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
