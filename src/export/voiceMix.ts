import type { Clip, OutputSegment, VoiceMix, VoiceTrack } from '@/types/clip'
import type { VoiceClip, VoiceDuck } from '@/types/voice'
import { frameIndexAt } from '@/utils/frames'
import { DUCK_GAIN, voiceFreezes } from '@/utils/voiceClips'
import { getVoiceAudio } from '@/voice/voiceAudio'
import { segmentOutputDuration, type FreezeAnnotationLike } from './outputTimeline'

export const MAX_VOICE_CLIPS_PER_CLIP = 40
const MIN_PLACED_SECONDS = 0.05

export interface VoicePlacement {
  id: string
  outStart: number
  duration: number
  duck: boolean
}

type CarrierLike = FreezeAnnotationLike & { toolType?: string }

/**
 * Frozen voice clips moved onto the startTime of their frame's freeze carrier
 * (same rule as frameHoldSeconds), so buildOutputTimeline merges the two into
 * one hold instead of two holds back to back. Other clips are returned as is.
 */
export function alignVoiceToCarriers(annotations: CarrierLike[], voiceClips: VoiceClip[], fps: number): VoiceClip[] {
  return voiceClips.map((clip) => {
    if (!clip.frozen) return clip
    const frame = frameIndexAt(clip.startTime, fps)
    const carriers = annotations.filter(
      (a) => typeof a.freezeDuration === 'number' && a.freezeDuration > 0 && frameIndexAt(a.startTime, fps) === frame,
    )
    const carrier = carriers.find((a) => a.toolType === 'freeze') ?? carriers[0]
    return carrier && carrier.startTime !== clip.startTime ? { ...clip, startTime: carrier.startTime } : clip
  })
}

/** Freeze entries for buildOutputTimeline: the annotations plus the frozen voice clips, aligned to their carriers. */
export function withVoiceFreezes(annotations: CarrierLike[], voiceClips: VoiceClip[], fps: number): FreezeAnnotationLike[] {
  return [...annotations, ...voiceFreezes(alignVoiceToCarriers(annotations, voiceClips, fps))]
}

function inClip(clip: Pick<Clip, 'start' | 'end'>, voice: VoiceClip): boolean {
  return voice.startTime >= clip.start && voice.startTime < clip.end
}

/** Places clips whose startTime is in [clip.start, clip.end) on the output timeline. Frozen: the output start of the hold segment whose srcTime is on the clip's frame. Playing: output time of its source time (through play segments' speed). duration is cut at the output's end; a clip left with < 0.05 s is dropped. duck is true for playing clips. */
export function placeVoice(segments: OutputSegment[], clip: Pick<Clip, 'start' | 'end'>, voiceClips: VoiceClip[], fps: number): VoicePlacement[] {
  const starts: number[] = []
  let total = 0
  for (const segment of segments) {
    starts.push(total)
    total += segmentOutputDuration(segment)
  }

  const outStartOf = (voice: VoiceClip): number | null => {
    if (voice.frozen) {
      const frame = frameIndexAt(voice.startTime, fps)
      const index = segments.findIndex((s) => s.kind === 'hold' && frameIndexAt(s.srcTime, fps) === frame)
      return index < 0 ? null : starts[index]
    }
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i]
      if (segment.kind !== 'play' || voice.startTime >= segment.srcEnd) continue
      if (voice.startTime < segment.srcStart) return starts[i]
      return starts[i] + (voice.startTime - segment.srcStart) / (segment.speed ?? 1)
    }
    return null
  }

  const placements: VoicePlacement[] = []
  for (const voice of voiceClips) {
    if (!inClip(clip, voice)) continue
    const outStart = outStartOf(voice)
    if (outStart === null) continue
    const duration = Math.min(voice.duration, total - outStart)
    if (duration < MIN_PLACED_SECONDS) continue
    placements.push({ id: voice.id, outStart, duration, duck: !voice.frozen })
  }
  return placements
}

export function voiceLimitError(clip: Pick<Clip, 'start' | 'end'>, voiceClips: VoiceClip[]): string | null {
  const count = voiceClips.filter((voice) => inClip(clip, voice)).length
  return count > MAX_VOICE_CLIPS_PER_CLIP ? `Too many voice clips in this clip (max ${MAX_VOICE_CLIPS_PER_CLIP})` : null
}

/** Overlapping or touching windows joined, in time order. */
function mergeWindows(windows: { start: number; end: number }[]): { start: number; end: number }[] {
  const sorted = [...windows].sort((a, b) => a.start - b.start)
  const merged: { start: number; end: number }[] = []
  for (const w of sorted) {
    const last = merged[merged.length - 1]
    if (last && w.start <= last.end) last.end = Math.max(last.end, w.end)
    else merged.push({ ...w })
  }
  return merged
}

export async function buildVoiceMix(
  placements: VoicePlacement[],
  duck: VoiceDuck,
  getAudio: (id: string) => Blob | undefined = getVoiceAudio,
): Promise<VoiceMix | undefined> {
  const tracks: VoiceTrack[] = []
  const windows: { start: number; end: number }[] = []
  for (const placement of placements) {
    const blob = getAudio(placement.id)
    if (!blob) continue
    const data = new Uint8Array(await blob.arrayBuffer())
    if (data.byteLength === 0) continue
    tracks.push({ data, outStart: placement.outStart, duration: placement.duration })
    if (placement.duck) windows.push({ start: placement.outStart, end: placement.outStart + placement.duration })
  }
  if (tracks.length === 0) return undefined
  return { tracks, duckWindows: mergeWindows(windows), duckGain: DUCK_GAIN[duck] }
}
