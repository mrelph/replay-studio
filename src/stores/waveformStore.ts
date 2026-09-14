import { create } from 'zustand'

interface WaveformState {
  amplitudes: Float32Array | null
  isLoading: boolean
  error: string | null
  decodeAudio: (videoUrl: string) => Promise<void>
  reset: () => void
}

export const useWaveformStore = create<WaveformState>((set) => ({
  amplitudes: null,
  isLoading: false,
  error: null,

  // No-op: the previous implementation sampled the waveform by seeking a
  // hidden <video> element 2000 times via the Web Audio API, which never
  // reliably produced data. Peak generation is planned to move to the main
  // process via ffmpeg instead. Until then this leaves amplitudes null so
  // WaveformDisplay simply renders nothing.
  decodeAudio: async () => {
    set({ amplitudes: null, isLoading: false, error: null })
  },

  reset: () => set({ amplitudes: null, isLoading: false, error: null }),
}))
