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
