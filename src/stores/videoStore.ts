import { create } from 'zustand'
import { DEFAULT_FPS, stepFrames, nextForwardRate, nextReverseRate } from '@/utils/frames'

interface VideoState {
  videoElement: HTMLVideoElement | null
  isPlaying: boolean
  currentTime: number
  duration: number
  playbackRate: number
  volume: number
  isMuted: boolean
  inPoint: number | null
  outPoint: number | null
  isLooping: boolean
  /** Source frame rate (probed on load; DEFAULT_FPS until then). */
  fps: number
  /** Reverse shuttle speed (J); 0 when not playing backwards. */
  reverseRate: number
  /** playbackRate to restore when a forward shuttle (L L…) is stopped; null when not shuttling. */
  shuttleBaseRate: number | null
  /** Set while Freeze is timing a freeze on the stopped frame (where and when it started); resuming records it. */
  freezeTiming: { time: number; at: number } | null

  // Actions
  setVideoElement: (element: HTMLVideoElement | null) => void
  setIsPlaying: (playing: boolean) => void
  setCurrentTime: (time: number) => void
  setDuration: (duration: number) => void
  setPlaybackRate: (rate: number) => void
  setVolume: (volume: number) => void
  setIsMuted: (muted: boolean) => void
  setInPoint: (time: number | null) => void
  setOutPoint: (time: number | null) => void
  setIsLooping: (looping: boolean) => void
  setFps: (fps: number) => void
  /** Play | Freeze: stop on this frame and start timing a freeze, or resume (which records it). */
  toggleFreeze: () => void
  /** Stops timing without recording anything. */
  cancelFreezeTiming: () => void
  play: () => void
  pause: () => void
  togglePlay: () => void
  seek: (time: number) => void
  stepFrame: (direction: 'forward' | 'backward') => void
  /** L: play forward, or double speed if already going forward (max 8x). */
  shuttleForward: () => void
  /** J: play backward, or double reverse speed (max 8x). */
  shuttleReverse: () => void
  /** K: stop any shuttle/playback and restore the pre-shuttle speed. */
  shuttleStop: () => void
  skip: (seconds: number) => void
  jumpToStart: () => void
  jumpToEnd: () => void
  goToInPoint: () => void
  goToOutPoint: () => void
  toggleMute: () => void
  reset: () => void
}

// HTMLVideoElement can't play backwards, so reverse shuttle is a seek loop:
// each animation frame, once the previous seek has landed, jump back by the
// wall-clock time elapsed × rate. Choppy on long-GOP footage but real-time.
let reverseLoop: { raf: number; cleanup: () => void } | null = null

function stopReverseLoop() {
  if (!reverseLoop) return
  cancelAnimationFrame(reverseLoop.raf)
  reverseLoop.cleanup()
  reverseLoop = null
}

export const useVideoStore = create<VideoState>((set, get) => ({
  videoElement: null,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  playbackRate: 1,
  volume: 1,
  isMuted: false,
  inPoint: null,
  outPoint: null,
  isLooping: false,
  fps: DEFAULT_FPS,
  reverseRate: 0,
  shuttleBaseRate: null,
  freezeTiming: null,

  setVideoElement: (element) => set({ videoElement: element, freezeTiming: null }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setCurrentTime: (time) => set({ currentTime: time }),
  setDuration: (duration) => set({ duration }),
  setPlaybackRate: (rate) => {
    const { videoElement } = get()
    if (videoElement) {
      videoElement.playbackRate = rate
    }
    // An explicit speed choice replaces whatever a shuttle would restore.
    set({ playbackRate: rate, shuttleBaseRate: null })
  },
  setVolume: (volume) => {
    const { videoElement } = get()
    if (videoElement) {
      videoElement.volume = volume
    }
    set({ volume })
  },
  setIsMuted: (muted) => {
    const { videoElement } = get()
    if (videoElement) {
      videoElement.muted = muted
    }
    set({ isMuted: muted })
  },
  setInPoint: (time) => set({ inPoint: time }),
  setOutPoint: (time) => set({ outPoint: time }),
  setIsLooping: (looping) => set({ isLooping: looping }),
  toggleFreeze: () => {
    const { videoElement, freezeTiming, reverseRate, shuttleBaseRate } = get()
    if (!videoElement) return
    if (freezeTiming) {
      // The 'play' handler in VideoPlayer records the freeze.
      videoElement.play()
      return
    }
    if (reverseRate > 0 || shuttleBaseRate !== null) get().shuttleStop()
    else if (!videoElement.paused) videoElement.pause()
    set({ freezeTiming: { time: videoElement.currentTime, at: performance.now() } })
  },
  cancelFreezeTiming: () => set({ freezeTiming: null }),
  setFps: (fps) => set({ fps: Number.isFinite(fps) && fps > 0 ? fps : DEFAULT_FPS }),

  play: () => {
    const { videoElement } = get()
    videoElement?.play()
  },
  pause: () => {
    const { videoElement } = get()
    videoElement?.pause()
  },
  togglePlay: () => {
    const { videoElement, isPlaying, reverseRate, shuttleBaseRate } = get()
    if (reverseRate > 0 || shuttleBaseRate !== null) {
      get().shuttleStop()
      return
    }
    if (videoElement) {
      if (isPlaying) videoElement.pause()
      else videoElement.play()
    }
  },
  seek: (time) => {
    const { videoElement, duration } = get()
    if (videoElement) {
      videoElement.currentTime = Math.max(0, Math.min(duration, time))
    }
  },
  stepFrame: (direction) => {
    const { videoElement, duration, fps } = get()
    if (videoElement) {
      if (get().reverseRate > 0) get().shuttleStop()
      else videoElement.pause()
      // Read the element, not the store: repeated steps (key auto-repeat)
      // must build on the pending seek, not a stale timeupdate value.
      videoElement.currentTime = stepFrames(videoElement.currentTime, direction === 'forward' ? 1 : -1, fps, duration)
    }
  },
  shuttleForward: () => {
    const { videoElement, isPlaying, playbackRate, reverseRate, shuttleBaseRate } = get()
    if (!videoElement) return
    const direction = reverseRate > 0 ? 'reverse' : isPlaying ? 'forward' : 'stopped'
    stopReverseLoop()
    const base = shuttleBaseRate ?? playbackRate
    const rate = nextForwardRate(direction, playbackRate, base)
    videoElement.playbackRate = rate
    set({ reverseRate: 0, playbackRate: rate, shuttleBaseRate: rate === base ? null : base })
    if (videoElement.paused) void videoElement.play()
  },
  shuttleReverse: () => {
    const { videoElement, isPlaying, reverseRate } = get()
    if (!videoElement) return
    const rate = nextReverseRate(reverseRate > 0 ? 'reverse' : isPlaying ? 'forward' : 'stopped', reverseRate)
    if (!videoElement.paused) videoElement.pause()
    const { shuttleBaseRate } = get()
    if (shuttleBaseRate !== null) {
      videoElement.playbackRate = shuttleBaseRate
      set({ playbackRate: shuttleBaseRate, shuttleBaseRate: null })
    }
    set({ reverseRate: rate })
    if (reverseLoop) return

    const video = videoElement
    let seeking = false
    let last = performance.now()
    const onSeeked = () => { seeking = false }
    // Any real play (space, click) cancels reverse.
    const onPlay = () => get().shuttleStop()
    video.addEventListener('seeked', onSeeked)
    video.addEventListener('play', onPlay)
    const tick = (now: number) => {
      const state = get()
      if (state.reverseRate <= 0 || state.videoElement !== video) {
        stopReverseLoop()
        return
      }
      if (!seeking) {
        const target = Math.max(0, video.currentTime - ((now - last) / 1000) * state.reverseRate)
        last = now
        seeking = true
        video.currentTime = target
        if (target <= 0) {
          state.shuttleStop()
          return
        }
      }
      if (reverseLoop) reverseLoop.raf = requestAnimationFrame(tick)
    }
    reverseLoop = {
      raf: requestAnimationFrame(tick),
      cleanup: () => {
        video.removeEventListener('seeked', onSeeked)
        video.removeEventListener('play', onPlay)
      },
    }
  },
  shuttleStop: () => {
    const { videoElement, shuttleBaseRate } = get()
    stopReverseLoop()
    if (videoElement) {
      videoElement.pause()
      if (shuttleBaseRate !== null) videoElement.playbackRate = shuttleBaseRate
    }
    set((state) => ({
      reverseRate: 0,
      shuttleBaseRate: null,
      playbackRate: shuttleBaseRate ?? state.playbackRate,
    }))
  },
  skip: (seconds) => {
    const { videoElement, duration, currentTime } = get()
    if (videoElement) {
      videoElement.currentTime = Math.max(0, Math.min(duration, currentTime + seconds))
    }
  },
  jumpToStart: () => {
    const { videoElement } = get()
    if (videoElement) {
      videoElement.currentTime = 0
    }
  },
  jumpToEnd: () => {
    const { videoElement, duration } = get()
    if (videoElement) {
      videoElement.currentTime = duration
    }
  },
  goToInPoint: () => {
    const { videoElement, inPoint } = get()
    if (videoElement && inPoint !== null) {
      videoElement.currentTime = inPoint
    }
  },
  goToOutPoint: () => {
    const { videoElement, outPoint } = get()
    if (videoElement && outPoint !== null) {
      videoElement.currentTime = outPoint
    }
  },
  toggleMute: () => {
    const { videoElement, isMuted } = get()
    if (videoElement) {
      videoElement.muted = !isMuted
    }
    set({ isMuted: !isMuted })
  },
  reset: () => {
    stopReverseLoop()
    set({
      isPlaying: false,
      fps: DEFAULT_FPS,
      reverseRate: 0,
      shuttleBaseRate: null,
      currentTime: 0,
      duration: 0,
      inPoint: null,
      outPoint: null,
    })
  },
}))
