import { create } from 'zustand'
import { toast } from '@/components/ui/Toast'
import { useVideoStore } from '@/stores/videoStore'
import { useDrawingStore } from '@/stores/drawingStore'
import { useVoiceStore } from '@/stores/voiceStore'
import { findFreezeCarrierAt } from '@/utils/freezeFrame'
import { MAX_VOICE_SECONDS, MIN_VOICE_SECONDS, newVoiceClipId } from '@/utils/voiceClips'
import { frameIndexAt } from '@/utils/frames'
import { startVoiceRecorder, type VoiceRecorder } from './recorder'

interface RecordingState {
  startedAt: number
  startTime: number
  frozen: boolean
}

export const useVoiceRecording = create<{ recording: RecordingState | null }>(() => ({ recording: null }))

type RecorderFactory = () => Promise<VoiceRecorder>
let recorderFactory: RecorderFactory = () => startVoiceRecorder()

/** Test seam: replaces the microphone recorder; null restores it. */
export function setVoiceRecorderFactory(factory: RecorderFactory | null): void {
  recorderFactory = factory ?? (() => startVoiceRecorder())
}

let active: VoiceRecorder | null = null
let starting = false
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

export async function beginVoiceRecording(): Promise<void> {
  if (starting || active) return
  const video = useVideoStore.getState()
  const { videoElement, reverseRate, slowRecording, fps } = video
  if (!videoElement || reverseRate > 0 || slowRecording) return

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
  endRequested = false
  let recorder: VoiceRecorder
  try {
    const granted = await window.electronAPI?.requestMicrophone?.()
    if (granted === false) throw new Error('Microphone access denied')
    recorder = await recorderFactory()
  } catch {
    starting = false
    toast('error', 'Microphone not available')
    return
  }
  starting = false

  if (endRequested || useVideoStore.getState().videoElement !== videoElement) {
    recorder.cancel()
    return
  }
  active = recorder
  useVoiceRecording.setState({ recording: { startedAt: Date.now(), startTime, frozen } })
  attach(videoElement, frozen, startTime)
  limitTimer = setTimeout(() => void endVoiceRecording(), MAX_VOICE_SECONDS * 1000)
}

export async function endVoiceRecording(): Promise<void> {
  const recording = useVoiceRecording.getState().recording
  const recorder = active
  if (starting) endRequested = true
  if (!recording || !recorder) return
  const elapsed = (Date.now() - recording.startedAt) / 1000
  active = null
  teardown()
  useVoiceRecording.setState({ recording: null })

  const result = await recorder.stop()
  if (!result) return
  const duration = Math.round(Math.min(elapsed, MAX_VOICE_SECONDS) * 100) / 100
  if (duration < MIN_VOICE_SECONDS) {
    toast('info', 'Voice clip too short: nothing recorded')
    return
  }
  useVoiceStore.getState().add(
    { id: newVoiceClipId(), startTime: recording.startTime, duration, frozen: recording.frozen, mime: result.mime },
    result.blob,
  )
}

export function cancelVoiceRecording(): void {
  if (starting) endRequested = true
  const recorder = active
  active = null
  teardown()
  useVoiceRecording.setState({ recording: null })
  recorder?.cancel()
}
