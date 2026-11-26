import { create } from 'zustand'
import { toast } from '@/components/ui/Toast'
import { useVideoStore } from '@/stores/videoStore'
import { useDrawingStore } from '@/stores/drawingStore'
import { useVoiceStore } from '@/stores/voiceStore'
import { useAppStore } from '@/stores/appStore'
import { findFreezeCarrierAt } from '@/utils/freezeFrame'
import { MAX_VOICE_SECONDS, MIN_VOICE_SECONDS, newVoiceClipId } from '@/utils/voiceClips'
import { frameIndexAt } from '@/utils/frames'
import { startVoiceRecorder, type VoiceRecorder } from './recorder'

interface RecordingState {
  startedAt: number
  startTime: number
  frozen: boolean
}

const PERMISSION_WAIT_MS = 500

export const useVoiceRecording = create<{ recording: RecordingState | null }>(() => ({ recording: null }))

type RecorderFactory = (onEnded: () => void) => Promise<VoiceRecorder>
let recorderFactory: RecorderFactory = (onEnded) => startVoiceRecorder({ onEnded })

export type VoiceRecordingSource = 'key' | 'button'

/** Test seam: replaces the microphone recorder; null restores it. */
export function setVoiceRecorderFactory(factory: RecorderFactory | null): void {
  recorderFactory = factory ?? ((onEnded) => startVoiceRecorder({ onEnded }))
}

let active: VoiceRecorder | null = null
let starting = false
let activeSource: VoiceRecordingSource = 'key'
let startingSource: VoiceRecordingSource = 'key'
let endRequested = false
let detach: (() => void) | null = null
let limitTimer: ReturnType<typeof setTimeout> | null = null

function teardown() {
  detach?.()
  detach = null
  if (limitTimer !== null) clearTimeout(limitTimer)
  limitTimer = null
}

function attach(video: HTMLVideoElement, frozen: boolean, startTime: number) {
  const { fps } = useVideoStore.getState()
  const startFrame = frameIndexAt(startTime, fps)
  const end = () => void endVoiceRecording()
  const onSeeking = () => {
    if (frameIndexAt(video.currentTime, useVideoStore.getState().fps) !== startFrame) end()
  }
  const unsubscribeStore = useVideoStore.subscribe((state, previous) => {
    if (state.videoElement !== previous.videoElement) cancelVoiceRecording()
  })
  if (frozen) {
    video.addEventListener('play', end)
    video.addEventListener('seeking', onSeeking)
  } else {
    video.addEventListener('pause', end)
    video.addEventListener('ended', end)
  }
  detach = () => {
    unsubscribeStore()
    video.removeEventListener('play', end)
    video.removeEventListener('seeking', onSeeking)
    video.removeEventListener('pause', end)
    video.removeEventListener('ended', end)
  }
}

export async function beginVoiceRecording(source: VoiceRecordingSource = 'key'): Promise<void> {
  if (starting || active) return
  const video = useVideoStore.getState()
  const { videoElement, reverseRate, slowRecording, fps } = video
  if (!videoElement || reverseRate > 0 || slowRecording || useAppStore.getState().exportRunning) return

  const frozen = videoElement.paused
  let startTime: number
  if (frozen) {
    const captured = video.captureDrawFrame()
    const carrier = findFreezeCarrierAt(useDrawingStore.getState().annotations as never, captured, fps)
    startTime = carrier ? carrier.startTime : captured
  } else {
    startTime = videoElement.currentTime
  }

  starting = true
  startingSource = source
  endRequested = false
  let recorder: VoiceRecorder
  let waitedForPermission = false
  try {
    const askedAt = Date.now()
    const granted = await window.electronAPI?.requestMicrophone?.()
    waitedForPermission = Date.now() - askedAt > PERMISSION_WAIT_MS
    if (granted === false) throw new Error('Microphone access denied')
    recorder = await recorderFactory(() => {
      if (active === recorder) void endVoiceRecording(undefined, true)
    })
  } catch {
    starting = false
    toast('error', 'Microphone not available')
    return
  }
  starting = false

  if (endRequested || useVideoStore.getState().videoElement !== videoElement) {
    recorder.cancel()
    if (endRequested && waitedForPermission) toast('info', 'Microphone ready. Hold N to record.')
    return
  }
  active = recorder
  activeSource = source
  useVoiceRecording.setState({ recording: { startedAt: Date.now(), startTime, frozen } })
  attach(videoElement, frozen, startTime)
  limitTimer = setTimeout(() => void endVoiceRecording(), MAX_VOICE_SECONDS * 1000)
}

/** `source` limits the call to recordings that source started (the key must not end a button recording). `lost` marks a microphone that stopped by itself. */
export async function endVoiceRecording(source?: VoiceRecordingSource, lost = false): Promise<void> {
  const recording = useVoiceRecording.getState().recording
  const recorder = active
  if (starting && (!source || source === startingSource)) endRequested = true
  if (!recording || !recorder) return
  if (source && source !== activeSource) return
  const elapsed = (Date.now() - recording.startedAt) / 1000
  active = null
  teardown()
  useVoiceRecording.setState({ recording: null })

  const result = await recorder.stop()
  if (!result) {
    toast('error', lost ? 'The microphone stopped: nothing recorded' : 'The recording was lost: nothing saved')
    return
  }
  const duration = Math.round(Math.min(elapsed, MAX_VOICE_SECONDS) * 100) / 100
  if (duration < MIN_VOICE_SECONDS) {
    if (lost) toast('error', 'The microphone stopped: nothing recorded')
    else toast('info', 'Voice clip too short: nothing recorded')
    return
  }
  if (lost) toast('error', 'The microphone stopped: the clip was cut short')
  useVoiceStore.getState().add(
    { id: newVoiceClipId(), startTime: recording.startTime, duration, frozen: recording.frozen, mime: result.mime },
    result.blob,
  )
  // As after drawing: the first Play previews the frame's new hold.
  const { videoElement, setPendingPreview } = useVideoStore.getState()
  if (recording.frozen && videoElement?.paused) setPendingPreview(recording.startTime)
}

export function cancelVoiceRecording(): void {
  if (starting) endRequested = true
  const recorder = active
  active = null
  teardown()
  useVoiceRecording.setState({ recording: null })
  recorder?.cancel()
}
