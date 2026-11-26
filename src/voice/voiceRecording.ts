import { create } from 'zustand'
import { toast } from '@/components/ui/Toast'
import { useVideoStore, setVoiceRecordingProbe } from '@/stores/videoStore'
import { useDrawingStore } from '@/stores/drawingStore'
import { useVoiceStore, voiceGeneration } from '@/stores/voiceStore'
import { useAppStore } from '@/stores/appStore'
import { findFreezeCarrierAt } from '@/utils/freezeFrame'
import { MAX_VOICE_SECONDS, MIN_VOICE_SECONDS, newVoiceClipId } from '@/utils/voiceClips'
import { frameIndexAt, timeForFrame } from '@/utils/frames'
import { useShortcutsStore, bindingToString } from '@/stores/shortcutsStore'
import { startVoiceRecorder, type VoiceRecorder } from './recorder'

interface RecordingState {
  startedAt: number
  startTime: number
  frozen: boolean
}

const PERMISSION_WAIT_MS = 500
const PERMISSION_TIMEOUT_MS = 15_000
const RECORDER_TIMEOUT_MS = 10_000
const NO_RESPONSE = 'Microphone did not respond. Try again.'
const MAC_MICROPHONE_OFF = 'Microphone access is off. Allow Replay Studio in System Settings > Privacy & Security > Microphone.'

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
let releasedWhileStarting = false
let activeSource: VoiceRecordingSource = 'key'
let startingSource: VoiceRecordingSource = 'key'
let endRequested = false
let detach: (() => void) | null = null
let limitTimer: ReturnType<typeof setTimeout> | null = null

setVoiceRecordingProbe(() => starting || active !== null)

class NoResponse extends Error {}

/** Rejects with NoResponse after `ms`; a value that arrives later goes to `onLate`. */
function withTimeout<T>(promise: Promise<T>, ms: number, onLate?: (value: T) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      reject(new NoResponse())
    }, ms)
    promise.then(
      (value) => {
        if (timedOut) onLate?.(value)
        else {
          clearTimeout(timer)
          resolve(value)
        }
      },
      (error) => {
        if (timedOut) return
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

function isMac(): boolean {
  return typeof navigator !== 'undefined' && /mac/i.test(navigator.platform ?? '')
}

/** A frozen clip's time on `time`'s frame: its freeze carrier's startTime, else the time a freeze marker on that frame gets. */
function frozenStartTime(time: number, fps: number): number {
  const carrier = findFreezeCarrierAt(useDrawingStore.getState().annotations as never, time, fps)
  return carrier ? carrier.startTime : timeForFrame(frameIndexAt(time, fps), fps)
}

/** True while the player holds a freeze frame by itself (its own pause and seek). */
function inAutoHold(): boolean {
  const hold = useVideoStore.getState().autoHold
  return hold !== null && hold.endedAt === null
}

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
    const { fps: rate, autoHold } = useVideoStore.getState()
    const frame = frameIndexAt(video.currentTime, rate)
    if (frozen) {
      if (frame !== startFrame) end()
      return
    }
    // A playing recording runs on through the player's own hold, as the export's voice does.
    if (autoHold && inAutoHold() && frame === frameIndexAt(autoHold.time, rate)) return
    end()
  }
  const onPause = () => {
    if (!inAutoHold()) end()
  }
  const unsubscribeStore = useVideoStore.subscribe((state, previous) => {
    if (state.videoElement !== previous.videoElement) {
      cancelVoiceRecording()
      return
    }
    const reverseBegan = state.reverseRate > 0 && previous.reverseRate === 0
    const shuttleBegan = state.shuttleBaseRate !== null && previous.shuttleBaseRate === null
    // Drawing or Freeze on the held frame clears the hold with no pause event: the video now stays paused.
    const holdTakenOver = previous.autoHold?.endedAt === null && state.autoHold === null && video.paused
    if (!frozen && (reverseBegan || shuttleBegan || holdTakenOver)) end()
  })
  if (frozen) {
    video.addEventListener('play', end)
  } else {
    video.addEventListener('pause', onPause)
    video.addEventListener('ended', end)
  }
  video.addEventListener('seeking', onSeeking)
  detach = () => {
    unsubscribeStore()
    video.removeEventListener('play', end)
    video.removeEventListener('seeking', onSeeking)
    video.removeEventListener('pause', onPause)
    video.removeEventListener('ended', end)
  }
}

export async function beginVoiceRecording(source: VoiceRecordingSource = 'key'): Promise<void> {
  if (starting || active) return
  const video = useVideoStore.getState()
  const { videoElement, reverseRate, shuttleBaseRate, slowRecording } = video
  if (!videoElement || reverseRate > 0 || shuttleBaseRate !== null || slowRecording || useAppStore.getState().exportRunning) return

  const frozen = videoElement.paused
  // Taking the frame ends any automatic hold, so the player does not resume while the microphone starts.
  if (frozen) video.captureDrawFrame()

  starting = true
  startingSource = source
  endRequested = false
  releasedWhileStarting = false
  let recorder: VoiceRecorder
  let waitedForPermission = false
  let denied = false
  try {
    const askedAt = Date.now()
    const asking = window.electronAPI?.requestMicrophone?.()
    const granted = asking ? await withTimeout(asking, PERMISSION_TIMEOUT_MS) : undefined
    waitedForPermission = Date.now() - askedAt > PERMISSION_WAIT_MS
    if (granted === false) {
      denied = true
      throw new Error('Microphone access denied')
    }
    recorder = await withTimeout(
      recorderFactory(() => {
        if (active === recorder) void endVoiceRecording(undefined, true)
      }),
      RECORDER_TIMEOUT_MS,
      (late) => late.cancel(),
    )
  } catch (error) {
    starting = false
    if (error instanceof NoResponse) toast('error', NO_RESPONSE)
    else toast('error', denied && isMac() ? MAC_MICROPHONE_OFF : 'Microphone not available')
    return
  }
  starting = false

  if (endRequested || useVideoStore.getState().videoElement !== videoElement) {
    recorder.cancel()
    if (releasedWhileStarting && waitedForPermission) {
      const binding = useShortcutsStore.getState().getShortcut('video.voice')?.binding
      toast('info', binding ? `Microphone ready. Hold ${bindingToString(binding)} to record.` : 'Microphone ready.')
    }
    return
  }
  // The player's own hold may have paused a playing recording during the wait: it carries on from the hold's frame.
  if (frozen ? !videoElement.paused : videoElement.paused && !inAutoHold()) {
    recorder.cancel()
    toast('info', 'Recording cancelled: playback changed while the microphone was starting')
    return
  }
  // Read now, not before the wait: the clip starts where the microphone did (the frame may also have been stepped).
  const startTime = frozen ? frozenStartTime(videoElement.currentTime, useVideoStore.getState().fps) : videoElement.currentTime
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
  if (starting && (!source || source === startingSource)) {
    endRequested = true
    releasedWhileStarting = true
  }
  if (!recording || !recorder) return
  if (source && source !== activeSource) return
  const elapsed = (Date.now() - recording.startedAt) / 1000
  active = null
  teardown()
  useVoiceRecording.setState({ recording: null })

  const generation = voiceGeneration()
  const result = await recorder.stop()
  // A new video or project was loaded while the audio was being collected.
  if (generation !== voiceGeneration()) return
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
