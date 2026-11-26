import type { VoiceClip, VoiceDuck } from '@/types/voice'
import { frameIndexAt } from '@/utils/frames'

export const MIN_VOICE_SECONDS = 0.3
export const MAX_VOICE_SECONDS = 120
export const DUCK_GAIN: Record<VoiceDuck, number> = { low: 0.25, off: 0, full: 1 }

let counter = 0

export function newVoiceClipId(): string {
  counter += 1
  return `voice-${Date.now().toString(36)}-${counter}-${Math.random().toString(36).slice(2, 8)}`
}

/** The frozen clip on `time`'s frame, if any. */
export function frozenVoiceAt(clips: VoiceClip[], time: number, fps: number): VoiceClip | undefined {
  const frame = frameIndexAt(time, fps)
  return clips.find((clip) => clip.frozen && frameIndexAt(clip.startTime, fps) === frame)
}

/** Frozen clips as freeze entries for buildOutputTimeline. */
export function voiceFreezes(clips: VoiceClip[]): { startTime: number; freezeDuration: number }[] {
  return clips.filter((clip) => clip.frozen).map((clip) => ({ startTime: clip.startTime, freezeDuration: clip.duration }))
}

// Same rule as findFreezeCarrierAt; not imported because freezeFrame.ts pulls in fabric.
/** Longer of the frame's freeze carrier (freezeDuration, 0 if none) and its frozen voice clip. */
export function frameHoldSeconds(
  annotations: { startTime: number; freezeDuration?: number; toolType?: string }[],
  clips: VoiceClip[],
  time: number,
  fps: number,
): number {
  const frame = frameIndexAt(time, fps)
  const carriers = annotations.filter(
    (a) => typeof a.freezeDuration === 'number' && frameIndexAt(a.startTime, fps) === frame,
  )
  const carrier = carriers.find((a) => a.toolType === 'freeze') ?? carriers[0]
  const carrierSeconds = carrier?.freezeDuration ?? 0
  const voiceSeconds = frozenVoiceAt(clips, time, fps)?.duration ?? 0
  return Math.max(carrierSeconds, voiceSeconds)
}

/** Keeps well-formed entries only; used on project load. */
export function sanitizeVoiceClips(value: unknown): VoiceClip[] {
  if (!Array.isArray(value)) return []
  const clips: VoiceClip[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue
    const { id, startTime, duration, frozen, mime } = entry as Record<string, unknown>
    if (typeof id !== 'string' || id === '' || typeof mime !== 'string' || typeof frozen !== 'boolean') continue
    if (typeof startTime !== 'number' || !Number.isFinite(startTime) || startTime < 0) continue
    if (typeof duration !== 'number' || !Number.isFinite(duration)) continue
    if (duration < MIN_VOICE_SECONDS || duration > MAX_VOICE_SECONDS + 1) continue
    clips.push({ id, startTime, duration, frozen, mime })
  }
  return clips
}
