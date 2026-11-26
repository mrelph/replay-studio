import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { toast } from '@/components/ui/Toast'
import { useVideoStore } from '@/stores/videoStore'
import { useDrawingStore } from '@/stores/drawingStore'
import { useVoiceStore } from '@/stores/voiceStore'
import { useAppStore } from '@/stores/appStore'
import type { VoiceRecorder } from './recorder'
import {
  beginVoiceRecording,
  endVoiceRecording,
  cancelVoiceRecording,
  useVoiceRecording,
  setVoiceRecorderFactory,
} from './voiceRecording'

vi.mock('@/components/ui/Toast', () => ({ toast: vi.fn() }))

class FakeVideo extends EventTarget {
  paused: boolean
  currentTime: number
  constructor(paused: boolean, currentTime: number) {
    super()
    this.paused = paused
    this.currentTime = currentTime
  }
  pause() {
    this.paused = true
  }
}

function setup(video: FakeVideo) {
  useVideoStore.setState({
    videoElement: video as unknown as HTMLVideoElement,
    fps: 30,
    reverseRate: 0,
    shuttleBaseRate: null,
    slowRecording: null,
    currentTime: video.currentTime,
  })
}

let recorders: { stop: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn> }[]
let started: number
let endedCallbacks: (() => void)[]
let stopResult: { blob: Blob; mime: string } | null

beforeEach(() => {
  vi.useFakeTimers()
  vi.mocked(toast).mockClear()
  recorders = []
  started = 0
  endedCallbacks = []
  stopResult = { blob: new Blob(['x']), mime: 'audio/webm' }
  setVoiceRecorderFactory(async (onEnded) => {
    started += 1
    endedCallbacks.push(onEnded)
    const recorder = { stop: vi.fn(async () => stopResult), cancel: vi.fn() }
    recorders.push(recorder)
    return recorder as unknown as VoiceRecorder
  })
  useVoiceStore.setState({ clips: [], selectedId: null })
  useDrawingStore.setState({ annotations: [] })
  useVoiceRecording.setState({ recording: null })
})

afterEach(() => {
  cancelVoiceRecording()
  setVoiceRecorderFactory(null)
  useVideoStore.setState({ videoElement: null })
  vi.useRealTimers()
})

describe('voice recording', () => {
  it('a microphone lost mid-recording saves the time up to the loss', async () => {
    setup(new FakeVideo(false, 1))
    await beginVoiceRecording()
    vi.advanceTimersByTime(1000)
    endedCallbacks[0]()
    expect(useVoiceRecording.getState().recording).toBeNull()
    await vi.advanceTimersByTimeAsync(4000)
    await endVoiceRecording()
    const clips = useVoiceStore.getState().clips
    expect(clips).toHaveLength(1)
    expect(clips[0].duration).toBe(1)
  })

  it('a microphone lost within 0.3 s saves nothing and shows an error', async () => {
    setup(new FakeVideo(false, 1))
    await beginVoiceRecording()
    vi.advanceTimersByTime(100)
    endedCallbacks[0]()
    await vi.advanceTimersByTimeAsync(0)
    expect(useVoiceStore.getState().clips).toHaveLength(0)
    expect(toast).toHaveBeenCalledWith('error', expect.stringContaining('microphone stopped'))
  })

  it('a lost recording whose stop yields nothing shows an error', async () => {
    setup(new FakeVideo(false, 1))
    stopResult = null
    await beginVoiceRecording()
    vi.advanceTimersByTime(2000)
    await endVoiceRecording()
    expect(toast).toHaveBeenCalledWith('error', expect.stringContaining('lost'))
  })

  it('releasing the key while the recorder is still starting cancels it', async () => {
    setup(new FakeVideo(false, 1))
    const pending = beginVoiceRecording('key')
    await endVoiceRecording('key')
    await pending
    expect(useVoiceRecording.getState().recording).toBeNull()
    expect(recorders[0].cancel).toHaveBeenCalled()
    expect(useVoiceStore.getState().clips).toHaveLength(0)
  })

  it('says the microphone is ready when a permission wait outlasted the key hold', async () => {
    setup(new FakeVideo(false, 1))
    window.electronAPI = { requestMicrophone: () => new Promise((r) => setTimeout(() => r(true), 1500)) } as never
    const pending = beginVoiceRecording('key')
    await endVoiceRecording('key')
    await vi.advanceTimersByTimeAsync(1500)
    await pending
    delete (window as { electronAPI?: unknown }).electronAPI
    expect(toast).toHaveBeenCalledWith('info', 'Microphone ready. Hold N to record.')
    expect(useVoiceStore.getState().clips).toHaveLength(0)
  })

  it('a key release or blur does not end a button-started recording; a key-started one ends', async () => {
    setup(new FakeVideo(false, 1))
    await beginVoiceRecording('button')
    vi.advanceTimersByTime(1000)
    await endVoiceRecording('key')
    expect(useVoiceRecording.getState().recording).not.toBeNull()
    await endVoiceRecording()
    expect(useVoiceStore.getState().clips).toHaveLength(1)

    await beginVoiceRecording('key')
    vi.advanceTimersByTime(1000)
    await endVoiceRecording('key')
    expect(useVoiceRecording.getState().recording).toBeNull()
    expect(useVoiceStore.getState().clips).toHaveLength(2)
  })

  it('begin while paused freezes on the exact frame start', async () => {
    setup(new FakeVideo(true, 1.0005))
    await beginVoiceRecording()
    const rec = useVoiceRecording.getState().recording!
    expect(rec.frozen).toBe(true)
    expect(rec.startTime).toBeCloseTo(1, 1)
    expect(rec.startTime).toBeLessThanOrEqual(1.0005)
  })

  it('begin while paused uses the frame freeze carrier start time', async () => {
    setup(new FakeVideo(true, 2))
    const carrierStart = 2.001
    useDrawingStore.setState({
      annotations: [{ id: 'f', startTime: carrierStart, endTime: 2.1, freezeDuration: 1, toolType: 'freeze' }] as never,
    })
    await beginVoiceRecording()
    expect(useVoiceRecording.getState().recording!.startTime).toBe(carrierStart)
  })

  it('begin while playing is not frozen and starts at the current time', async () => {
    setup(new FakeVideo(false, 4.2))
    await beginVoiceRecording()
    const rec = useVoiceRecording.getState().recording!
    expect(rec).toMatchObject({ frozen: false, startTime: 4.2 })
  })

  it('ending after 0.2 s adds nothing and shows the too-short toast', async () => {
    setup(new FakeVideo(false, 1))
    await beginVoiceRecording()
    vi.advanceTimersByTime(200)
    await endVoiceRecording()
    expect(useVoiceStore.getState().clips).toHaveLength(0)
    expect(toast).toHaveBeenCalledWith('info', expect.stringContaining('too short'))
    expect(useVoiceRecording.getState().recording).toBeNull()
  })

  it('ending after 2 s adds one clip of 2 s', async () => {
    setup(new FakeVideo(false, 1))
    await beginVoiceRecording()
    vi.advanceTimersByTime(2004)
    await endVoiceRecording()
    const clips = useVoiceStore.getState().clips
    expect(clips).toHaveLength(1)
    expect(clips[0]).toMatchObject({ duration: 2, frozen: false, startTime: 1, mime: 'audio/webm' })
  })

  it('saving a frozen clip asks the first Play to preview its hold', async () => {
    useVideoStore.setState({ pendingPreview: null })
    setup(new FakeVideo(true, 2))
    await beginVoiceRecording()
    vi.advanceTimersByTime(1000)
    await endVoiceRecording()
    expect(useVideoStore.getState().pendingPreview).toBe(useVoiceStore.getState().clips[0].startTime)
  })

  it('saving a playing clip leaves the preview alone', async () => {
    useVideoStore.setState({ pendingPreview: null })
    setup(new FakeVideo(false, 2))
    await beginVoiceRecording()
    vi.advanceTimersByTime(1000)
    await endVoiceRecording()
    expect(useVideoStore.getState().pendingPreview).toBeNull()
  })

  it.each([
    ['reversing', { reverseRate: 2 }],
    ['recording slow motion', { slowRecording: { startSrc: 1, at: 0, speed: 0.5 } }],
  ])('is refused while %s', async (_name, patch) => {
    setup(new FakeVideo(false, 1))
    useVideoStore.setState(patch)
    await beginVoiceRecording()
    expect(started).toBe(0)
    expect(useVoiceRecording.getState().recording).toBeNull()
  })

  it('is refused while an export runs', async () => {
    setup(new FakeVideo(false, 1))
    useAppStore.setState({ exportRunning: true })
    try {
      await beginVoiceRecording()
    } finally {
      useAppStore.setState({ exportRunning: false })
    }
    expect(started).toBe(0)
    expect(useVoiceRecording.getState().recording).toBeNull()
  })

  it('is refused without a video', async () => {
    useVideoStore.setState({ videoElement: null })
    await beginVoiceRecording()
    expect(started).toBe(0)
  })

  it('reaching 120 s ends the recording and saves a 120 s clip', async () => {
    setup(new FakeVideo(false, 1))
    await beginVoiceRecording()
    await vi.advanceTimersByTimeAsync(120_000)
    expect(useVoiceRecording.getState().recording).toBeNull()
    expect(useVoiceStore.getState().clips[0]?.duration).toBe(120)
  })

  it('a recorder that yields nothing adds no clip and clears recording', async () => {
    setup(new FakeVideo(false, 1))
    stopResult = null
    await beginVoiceRecording()
    vi.advanceTimersByTime(2000)
    await endVoiceRecording()
    expect(useVoiceStore.getState().clips).toHaveLength(0)
    expect(useVoiceRecording.getState().recording).toBeNull()
  })

  it('shows "Microphone not available" when the recorder cannot start', async () => {
    setup(new FakeVideo(false, 1))
    setVoiceRecorderFactory(async () => {
      throw new Error('denied')
    })
    await beginVoiceRecording()
    expect(toast).toHaveBeenCalledWith('error', 'Microphone not available')
    expect(useVoiceRecording.getState().recording).toBeNull()
  })

  it('begin twice starts one recorder', async () => {
    setup(new FakeVideo(false, 1))
    await Promise.all([beginVoiceRecording(), beginVoiceRecording()])
    await beginVoiceRecording()
    expect(started).toBe(1)
  })

  it('a playing recording ends when the video pauses', async () => {
    const video = new FakeVideo(false, 1)
    setup(video)
    await beginVoiceRecording()
    vi.advanceTimersByTime(1500)
    video.dispatchEvent(new Event('pause'))
    await vi.advanceTimersByTimeAsync(0)
    expect(useVoiceRecording.getState().recording).toBeNull()
    expect(useVoiceStore.getState().clips).toHaveLength(1)
  })

  it('a frozen recording ends on play, and on a seek to another frame only', async () => {
    const video = new FakeVideo(true, 3)
    setup(video)
    await beginVoiceRecording()
    video.dispatchEvent(new Event('seeking'))
    expect(useVoiceRecording.getState().recording).not.toBeNull()
    video.currentTime = 5
    video.dispatchEvent(new Event('seeking'))
    expect(useVoiceRecording.getState().recording).toBeNull()
  })

  it('unloading the video cancels the recording', async () => {
    setup(new FakeVideo(false, 1))
    await beginVoiceRecording()
    useVideoStore.getState().setVideoElement(null)
    expect(useVoiceRecording.getState().recording).toBeNull()
    expect(recorders[0].cancel).toHaveBeenCalled()
    expect(useVoiceStore.getState().clips).toHaveLength(0)
  })
})
