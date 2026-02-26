import { create } from 'zustand'

interface WaveformState {
  amplitudes: Float32Array | null
  isLoading: boolean
  error: string | null
  decodeAudio: (videoUrl: string) => Promise<void>
  reset: () => void
}

const SLICE_COUNT = 2000

export const useWaveformStore = create<WaveformState>((set, get) => ({
  amplitudes: null,
  isLoading: false,
  error: null,

  decodeAudio: async (videoUrl: string) => {
    set({ isLoading: true, error: null, amplitudes: null })

    try {
      // Use a hidden video element + Web Audio API to sample waveform
      // without loading the entire file into memory
      const video = document.createElement('video')
      video.crossOrigin = 'anonymous'
      video.muted = true
      video.preload = 'auto'
      video.src = videoUrl

      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve()
        video.onerror = () => reject(new Error('Failed to load video'))
        setTimeout(() => reject(new Error('Timeout')), 10000)
      })

      const duration = video.duration
      if (!duration || !isFinite(duration) || duration === 0) {
        set({ amplitudes: null, isLoading: false })
        video.remove()
        return
      }

      const audioCtx = new AudioContext()
      const source = audioCtx.createMediaElementSource(video)
      const analyser = audioCtx.createAnalyser()
      analyser.fftSize = 2048
      source.connect(analyser)
      // Don't connect to destination — we don't want to hear it
      // analyser needs to be connected to something to process, use a silent gain
      const gain = audioCtx.createGain()
      gain.gain.value = 0
      analyser.connect(gain)
      gain.connect(audioCtx.destination)

      const bufferLength = analyser.frequencyBinCount
      const dataArray = new Uint8Array(bufferLength)
      const amplitudes = new Float32Array(SLICE_COUNT)
      const timeStep = duration / SLICE_COUNT

      // Sample the waveform by seeking through the video
      for (let i = 0; i < SLICE_COUNT; i++) {
        // Check if component unmounted / reset called
        if (get().amplitudes !== null && !get().isLoading) break

        const targetTime = i * timeStep
        video.currentTime = targetTime

        await new Promise<void>((resolve) => {
          video.onseeked = () => resolve()
          setTimeout(resolve, 50) // Fallback timeout
        })

        // Small delay to let analyser update
        await new Promise((r) => setTimeout(r, 10))

        analyser.getByteTimeDomainData(dataArray)

        // Compute RMS from time domain data (centered around 128)
        let sum = 0
        for (let j = 0; j < bufferLength; j++) {
          const v = (dataArray[j] - 128) / 128
          sum += v * v
        }
        amplitudes[i] = Math.sqrt(sum / bufferLength)
      }

      // Cleanup
      source.disconnect()
      analyser.disconnect()
      gain.disconnect()
      await audioCtx.close()
      video.remove()

      set({ amplitudes, isLoading: false })
    } catch {
      set({ amplitudes: null, isLoading: false, error: null })
    }
  },

  reset: () => set({ amplitudes: null, isLoading: false, error: null }),
}))
