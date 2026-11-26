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

/** The playing clip to start on a timeupdate going prevTime → curTime. A hold firing at holdTime on the same tick cuts the window there: the video goes back to it. skipId is a clip already started when playback began on its frame. */
export function voiceToStart(
  clips: VoiceClip[],
  prevTime: number,
  curTime: number,
  holdTime: number | null,
  skipId: string | null,
): VoiceClip | undefined {
  const end = holdTime ?? curTime
  return clips.find((clip) => !clip.frozen && clip.id !== skipId && clip.startTime > prevTime && clip.startTime <= end)
}

/** Every playing clip voiceToStart's rule admits (start in (prevTime, holdTime ?? curTime], not skipId), earliest first. */
export function voicesToStart(
  clips: VoiceClip[],
  prevTime: number,
  curTime: number,
  holdTime: number | null,
  skipId: string | null,
): VoiceClip[] {
  const end = holdTime ?? curTime
  return clips
    .filter((clip) => !clip.frozen && clip.id !== skipId && clip.startTime > prevTime && clip.startTime <= end)
    .sort((a, b) => a.startTime - b.startTime)
}

export interface VoiceAdvance {
  start: VoiceClip[]
  cursor: number
  clearSkip: boolean
}

/** Moves the voice cursor (playing clips at or before it are dealt with) on to `end`: the clips to start, the new cursor, and whether the clip started on playback's first frame (skip) is now behind. Never moves back, so each clip starts once whichever check (timeupdate or a frame) gets there first. */
export function advanceVoice(clips: VoiceClip[], cursor: number, end: number, skip: VoiceClip | null): VoiceAdvance {
  const clearSkip = skip !== null && end >= skip.startTime
  if (end <= cursor) return { start: [], cursor, clearSkip }
  return { start: voicesToStart(clips, cursor, end, null, skip?.id ?? null), cursor: end, clearSkip }
}

/** True when a playing clip starts after `time`: only then does the player watch every frame for its start. */
export function hasVoiceAhead(clips: VoiceClip[], time: number): boolean {
  return clips.some((clip) => !clip.frozen && clip.startTime > time)
}

/** How far a frame check may start voices, from `from` to `curTime`: no further than the first hold not yet fired, which timeupdate fires (clips past it start after the hold, as voiceToStart has it). */
export function voiceFrameEnd(holds: EffectiveHold[], triggered: ReadonlySet<string>, from: number, curTime: number): number {
  let end = curTime
  for (const hold of holds) {
    if (!triggered.has(hold.id) && hold.time >= from && hold.time < end) end = hold.time
  }
  return end
}

interface FrameSource {
  requestVideoFrameCallback?: (callback: () => void) => number
  cancelVideoFrameCallback?: (handle: number) => void
}

/** Runs `onFrame` on every video frame (requestVideoFrameCallback, else requestAnimationFrame) from start() until it returns false or stop() is called. */
export function createFrameLoop(video: FrameSource, onFrame: () => boolean) {
  let handle: number | null = null
  let byVideo = false
  const tick = () => {
    handle = null
    if (onFrame()) schedule()
  }
  const schedule = () => {
    if (typeof video.requestVideoFrameCallback === 'function') {
      byVideo = true
      handle = video.requestVideoFrameCallback(tick)
    } else if (typeof requestAnimationFrame === 'function') {
      byVideo = false
      handle = requestAnimationFrame(tick)
    }
  }
  return {
    start() {
      if (handle === null) schedule()
    },
    stop() {
      if (handle === null) return
      if (byVideo) video.cancelVideoFrameCallback?.(handle)
      else cancelAnimationFrame(handle)
      handle = null
    },
    get running() {
      return handle !== null
    },
  }
}

/** The playing clip whose start is on `time`'s frame: playback that begins there starts it. */
export function voiceOnFrame(clips: VoiceClip[], time: number, fps: number): VoiceClip | undefined {
  const frame = frameIndexAt(time, fps)
  return clips.find((clip) => !clip.frozen && frameIndexAt(clip.startTime, fps) === frame)
}

type PlayerFactory = (url: string) => HTMLAudioElement
const defaultFactory: PlayerFactory = (url) => new Audio(url)
let playerFactory: PlayerFactory = defaultFactory

/** Test seam: replaces how clip audio elements are made; null restores it. */
export function setVoicePlayerFactory(factory: PlayerFactory | null): void {
  playerFactory = factory ?? defaultFactory
}

/** 'play': clips over moving video, several may overlap. 'hold': the frame's voice during a hold, one at a time. 'preview': click-to-hear, one at a time. */
export type VoiceChannel = 'play' | 'hold' | 'preview'

const playing = new Set<{ channel: VoiceChannel; stop: () => void }>()

/** Plays a clip's audio from the start on `channel`; returns a stop function. Starting a 'hold' or 'preview' clip stops the one already on that channel; 'play' clips overlap. `onEnd` runs once, when the clip ends, fails or is stopped. */
export function playVoice(id: string, onEnd?: () => void, channel: VoiceChannel = 'preview'): () => void {
  if (channel !== 'play') stopVoice(channel)
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
    playing.delete(entry)
    onEnd?.()
  }
  const stop = () => {
    if (done) return
    audio.pause()
    finish()
  }
  const entry = { channel, stop }
  audio.addEventListener('ended', finish)
  audio.addEventListener('error', finish)
  playing.add(entry)
  const played = audio.play()
  if (played) played.catch(finish)
  return stop
}

/** Stops the clips on `channel`, or every clip when no channel is given. */
export function stopVoice(channel?: VoiceChannel): void {
  for (const entry of [...playing]) if (!channel || entry.channel === channel) entry.stop()
}

/** Plays 'play' clips with `target`'s volume lowered while any of them is sounding; the volume comes back when the last one ends or is stopped. */
export function createPlayingVoiceDuck(target: { volume: number }, volume: () => number, gain: () => number) {
  let sounding = 0
  let duckGain: number | null = null
  return {
    play(id: string) {
      duckGain = gain()
      target.volume = volume() * duckGain
      sounding += 1
      playVoice(id, () => {
        sounding -= 1
        if (sounding > 0) return
        duckGain = null
        target.volume = volume()
      }, 'play')
    },
    /** The store's volume changed (and was written to the element as is): lower it again while ducked. */
    volumeChanged() {
      if (duckGain !== null) target.volume = volume() * duckGain
    },
  }
}
