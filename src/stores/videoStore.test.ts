import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useVideoStore } from './videoStore'
import { snapToFrame, frameStart, frameIndexAt, timeForFrame } from '@/utils/frames'
import { stayTiming } from '@/utils/stayPreset'
import { annotationStateAt } from '@/export/annotationTiming'

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

  it('stops a playing video on its current frame and returns the exact frame start', () => {
    const video = fakeVideo(false, 3.0569)
    useVideoStore.setState({ videoElement: video as unknown as HTMLVideoElement })
    const time = useVideoStore.getState().captureDrawFrame()
    expect(time).toBe(frameStart(91, 30))
    expect(video.pause).toHaveBeenCalledOnce()
    expect(video.currentTime).toBe(snapToFrame(3.0569, 30))
    expect(useVideoStore.getState().currentTime).toBe(snapToFrame(3.0569, 30))
  })

  it('a drawing made on a frame is visible at every time the browser reports for it', () => {
    for (const fps of [30, 30000 / 1001, 25, 60]) {
      for (const k of [1, 7, 91, 300, 1799]) {
        // Chromium reports currentTime in whole microseconds, truncated.
        let reported = (k + 0.5) / fps
        const video = fakeVideo(true, 0)
        Object.defineProperty(video, 'currentTime', {
          get: () => reported,
          set: (target: number) => { reported = Math.floor(target * 1e6) / 1e6 },
        })
        useVideoStore.setState({ videoElement: video as unknown as HTMLVideoElement, fps })
        const startTime = useVideoStore.getState().captureDrawFrame()
        expect(frameIndexAt(startTime, fps)).toBe(k)
        const t = video.currentTime
        for (const preset of ['freeze', 2] as const) {
          const timing = stayTiming(preset, startTime, 120, fps, { fadeIn: 0, fadeOut: 0 })
          const drawing = { startTime, ...timing }
          expect(annotationStateAt(drawing, t).visible, `fps ${fps} frame ${k} ${preset}`).toBe(true)
          expect(annotationStateAt(drawing, useVideoStore.getState().currentTime).visible).toBe(true)
          // The hold seeks to the frame's marker time.
          expect(annotationStateAt(drawing, Math.floor(timeForFrame(k, fps) * 1e6) / 1e6).visible).toBe(true)
        }
      }
    }
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
    expect(useVideoStore.getState().captureDrawFrame()).toBe(frameStart(91, 30))
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

describe('interceptPlay', () => {
  beforeEach(() => {
    useVideoStore.setState({ videoElement: null, isPlaying: false, freezeTiming: null, reverseRate: 0, shuttleBaseRate: null, interceptPlay: null })
  })

  it('does not start the video when the interceptor takes over', () => {
    const video = fakeVideo(true, 3)
    const intercept = vi.fn(() => true)
    useVideoStore.setState({ videoElement: video as unknown as HTMLVideoElement, interceptPlay: intercept })
    useVideoStore.getState().togglePlay()
    useVideoStore.getState().play()
    expect(intercept).toHaveBeenCalledTimes(2)
    expect(video.play).not.toHaveBeenCalled()
  })

  it('starts the video when the interceptor declines', () => {
    const video = fakeVideo(true, 3)
    const intercept = vi.fn(() => false)
    useVideoStore.setState({ videoElement: video as unknown as HTMLVideoElement, interceptPlay: intercept })
    useVideoStore.getState().togglePlay()
    expect(intercept).toHaveBeenCalledOnce()
    expect(video.play).toHaveBeenCalledOnce()
  })

  it('asks before resuming from a timed freeze', () => {
    const video = fakeVideo(true, 3)
    const intercept = vi.fn(() => true)
    useVideoStore.setState({
      videoElement: video as unknown as HTMLVideoElement,
      interceptPlay: intercept,
      freezeTiming: { time: 3, at: 0, resumeTime: 3 },
    })
    useVideoStore.getState().toggleFreeze()
    expect(intercept).toHaveBeenCalledOnce()
    expect(video.play).not.toHaveBeenCalled()
  })

  it('is not asked when pausing', () => {
    const video = fakeVideo(false, 3)
    const intercept = vi.fn(() => true)
    useVideoStore.setState({ videoElement: video as unknown as HTMLVideoElement, isPlaying: true, interceptPlay: intercept })
    useVideoStore.getState().togglePlay()
    expect(intercept).not.toHaveBeenCalled()
    expect(video.pause).toHaveBeenCalledOnce()
  })
})
