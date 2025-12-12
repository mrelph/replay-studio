import { create } from 'zustand'

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
  play: () => void
  pause: () => void
  togglePlay: () => void
  seek: (time: number) => void
  stepFrame: (direction: 'forward' | 'backward') => void
  reset: () => void
}

const FRAME_DURATION = 1 / 30 // Assuming 30fps

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

  setVideoElement: (element) => set({ videoElement: element }),
  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setCurrentTime: (time) => set({ currentTime: time }),
  setDuration: (duration) => set({ duration }),
  setPlaybackRate: (rate) => {
    const { videoElement } = get()
    if (videoElement) {
      videoElement.playbackRate = rate
    }
    set({ playbackRate: rate })
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

  play: () => {
    const { videoElement } = get()
    videoElement?.play()
  },
  pause: () => {
    const { videoElement } = get()
    videoElement?.pause()
  },
  togglePlay: () => {
    const { videoElement, isPlaying } = get()
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
    const { videoElement, duration, currentTime } = get()
    if (videoElement) {
      const delta = direction === 'forward' ? FRAME_DURATION : -FRAME_DURATION
      videoElement.currentTime = Math.max(0, Math.min(duration, currentTime + delta))
    }
  },
  reset: () => set({
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    inPoint: null,
    outPoint: null,
  }),
}))
