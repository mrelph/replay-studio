import type { Annotation } from '@/stores/drawingStore'
import type { VoiceClip } from '@/types/voice'
import { frameIndexAt } from '@/utils/frames'
import { findFreezeAt, findFreezeCarrierAt } from '@/utils/freezeMarkers'
import { frozenVoiceAt } from '@/utils/voiceClips'
import { holdIdAt, type EffectiveHold } from '@/voice/voicePlayback'

/** The hold to play when Play is pressed, or null. Requires a pending preview on the current frame and a carrier with freezeDuration > 0 or a frozen voice clip. */
export function previewHoldFor(
  annotations: Annotation[],
  clips: VoiceClip[],
  pendingPreview: number | null,
  currentTime: number,
  fps: number,
): EffectiveHold | null {
  if (pendingPreview === null) return null
  if (frameIndexAt(pendingPreview, fps) !== frameIndexAt(currentTime, fps)) return null
  const carrier = findFreezeAt(annotations, currentTime, fps)
  const voice = frozenVoiceAt(clips, currentTime, fps)
  if (!carrier && !voice) return null
  const time = (findFreezeCarrierAt(annotations, currentTime, fps) ?? voice!).startTime
  const seconds = Math.max(carrier?.freezeDuration ?? 0, voice?.duration ?? 0)
  return voice ? { id: holdIdAt(time, fps), time, seconds, voiceId: voice.id } : { id: holdIdAt(time, fps), time, seconds }
}
