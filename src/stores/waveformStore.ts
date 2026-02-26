import { create } from 'zustand'

interface WaveformState {
  amplitudes: Float32Array | null
  isLoading: boolean
  error: string | null
  decodeAudio: (videoUrl: string) => Promise<void>
  reset: () => void
}

const SLICE_COUNT = 2000
const SAMPLE_RATE = 8000

export const useWaveformStore = create<WaveformState>((set) => ({
  amplitudes: null,
  isLoading: false,
  error: null,

  decodeAudio: async (videoUrl: string) => {
    set({ isLoading: true, error: null, amplitudes: null })

    try {
      const response = await fetch(videoUrl)
      const arrayBuffer = await response.arrayBuffer()

      const audioCtx = new OfflineAudioContext(1, SAMPLE_RATE, SAMPLE_RATE)
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)

      const channelData = audioBuffer.getChannelData(0)
      const samplesPerSlice = Math.floor(channelData.length / SLICE_COUNT)
      const amplitudes = new Float32Array(SLICE_COUNT)

      for (let i = 0; i < SLICE_COUNT; i++) {
        const start = i * samplesPerSlice
        const end = Math.min(start + samplesPerSlice, channelData.length)
        let sum = 0
        for (let j = start; j < end; j++) {
          sum += channelData[j] * channelData[j]
        }
        amplitudes[i] = Math.sqrt(sum / (end - start))
      }

      set({ amplitudes, isLoading: false })
    } catch {
      // Video may not have audio — this is not an error to surface
      set({ amplitudes: null, isLoading: false, error: null })
    }
  },

  reset: () => set({ amplitudes: null, isLoading: false, error: null }),
}))
