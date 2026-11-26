import type { Annotation } from '@/stores/drawingStore'
import type { VoiceClip } from '@/types/voice'
import { frameIndexAt } from '@/utils/frames'
import { voiceAudioUrl } from './voiceAudio'

export interface EffectiveHold {
  id: string
  time: number
  seconds: number
  voiceId?: string
}

/** The stable id of the hold on `time`'s frame. */
export function holdIdAt(time: number, fps: number): string {
  return `hold-${frameIndexAt(time, fps)}`
}

/** Every frame that holds: one entry per freeze carrier with freezeDuration > 0 and per frozen voice clip, merged per frame (seconds = the longer; time = the carrier's startTime when there is one). id is stable per frame. */
export function effectiveHolds(annotations: Annotation[], clips: VoiceClip[], fps: number): EffectiveHold[] {
  const holds: EffectiveHold[] = []
  const byFrame = new Map<number, EffectiveHold>()
  // Annotation order first: it is the order the player has always checked freezes in.
  for (const a of annotations) {
    if (!a.freezeDuration || a.freezeDuration <= 0) continue
    const frame = frameIndexAt(a.startTime, fps)
    const existing = byFrame.get(frame)
    if (existing) {
      existing.seconds = Math.max(existing.seconds, a.freezeDuration)
      continue
    }
    const hold: EffectiveHold = { id: holdIdAt(a.startTime, fps), time: a.startTime, seconds: a.freezeDuration }
    byFrame.set(frame, hold)
    holds.push(hold)
  }
  for (const clip of clips) {
    if (!clip.frozen) continue
    const frame = frameIndexAt(clip.startTime, fps)
    const existing = byFrame.get(frame)
    if (existing) {
      existing.seconds = Math.max(existing.seconds, clip.duration)
      existing.voiceId = clip.id
      continue
    }
    // Same rule as findFreezeCarrierAt; a carrier set to 0 still owns the frame's time.
    const carriers = annotations.filter((a) => typeof a.freezeDuration === 'number' && frameIndexAt(a.startTime, fps) === frame)
    const carrier = carriers.find((a) => a.toolType === 'freeze') ?? carriers[0]
    const time = carrier?.startTime ?? clip.startTime
    const hold: EffectiveHold = { id: holdIdAt(time, fps), time, seconds: clip.duration, voiceId: clip.id }
    byFrame.set(frame, hold)
    holds.push(hold)
  }
  return holds
}

/** The playing (non-frozen) clip whose start lies in (prevTime, curTime]. */
export function voiceCrossed(clips: VoiceClip[], prevTime: number, curTime: number): VoiceClip | undefined {
  return clips.find((clip) => !clip.frozen && clip.startTime > prevTime && clip.startTime <= curTime)
}

type PlayerFactory = (url: string) => HTMLAudioElement
const defaultFactory: PlayerFactory = (url) => new Audio(url)
let playerFactory: PlayerFactory = defaultFactory

/** Test seam: replaces how clip audio elements are made; null restores it. */
export function setVoicePlayerFactory(factory: PlayerFactory | null): void {
  playerFactory = factory ?? defaultFactory
}

let stopCurrent: (() => void) | null = null

/** Plays a clip's audio from the start; returns a stop function. One clip at a time: starting another stops the first. `onEnd` runs once, when the clip ends, fails or is stopped. */
export function playVoice(id: string, onEnd?: () => void): () => void {
  stopVoice()
  const url = voiceAudioUrl(id)
  if (!url) {
    onEnd?.()
    return () => {}
  }
  const audio = playerFactory(url)
  let done = false
  const finish = () => {
    if (done) return
    done = true
    audio.removeEventListener('ended', finish)
    audio.removeEventListener('error', finish)
    if (stopCurrent === stop) stopCurrent = null
    onEnd?.()
  }
  const stop = () => {
    if (done) return
    audio.pause()
    finish()
  }
  audio.addEventListener('ended', finish)
  audio.addEventListener('error', finish)
  stopCurrent = stop
  const played = audio.play()
  if (played) played.catch(finish)
  return stop
}

export function stopVoice(): void {
  stopCurrent?.()
}
