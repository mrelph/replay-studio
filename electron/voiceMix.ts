// Voice clips mixed over an encode job's audio (pure: argv pieces and validation).
// The renderer places each recording on the output timeline (src/export/voiceMix.ts);
// here the base audio is ducked under the playing clips and the recordings are
// delayed into place and summed with it.

export const MAX_VOICE_TRACKS = 40
export const MAX_VOICE_BYTES = 64 * 1024 * 1024
/** Seconds the duck takes to ramp down (and back up) inside each window's edges. */
export const DUCK_RAMP_SECONDS = 0.15
// Same rate as AUDIO_SAMPLE_RATE in clipExport.ts, so every amix input matches.
const SAMPLE_RATE = 48000

export interface VoiceGraphInput {
  tracks: { inputIndex: number; outStart: number; duration: number }[]
  duckWindows: { start: number; end: number }[]
  duckGain: number
  totalDuration: number
}

function num(value: number): string {
  return String(Number(value.toFixed(6)))
}

/** volume expression: 1 outside the windows, duckGain inside, linear over 0.15 s at each edge. */
export function duckVolumeExpr(windows: { start: number; end: number }[], duckGain: number): string {
  if (windows.length === 0) return '1'
  const ramp = num(DUCK_RAMP_SECONDS)
  const envelopes = windows.map(
    (w) => `min(clip((t-${num(w.start)})/${ramp},0,1),clip((${num(w.end)}-t)/${ramp},0,1))`
  )
  return `1-${num(1 - duckGain)}*min(1,${envelopes.join('+')})`
}

/** Filter parts that turn `[baseLabel]` plus the voice inputs into `[outLabel]`. */
export function voiceFilterParts(baseLabel: string, outLabel: string, input: VoiceGraphInput): string[] {
  const parts: string[] = []
  let base = baseLabel
  if (input.duckWindows.length > 0 && input.duckGain !== 1) {
    const expr = duckVolumeExpr(input.duckWindows, input.duckGain).replace(/,/g, '\\,')
    parts.push(`[${baseLabel}]volume=volume='${expr}':eval=frame[${baseLabel}_duck]`)
    base = `${baseLabel}_duck`
  }
  const voiceLabels = input.tracks.map((track, k) => {
    const label = `voice${k}`
    // atrim treats 0 as "no limit"; amix's duration=first drops anything past the end anyway.
    const duration = Math.max(0.001, Math.min(track.duration, input.totalDuration - track.outStart))
    parts.push(
      `[${track.inputIndex}:a]aresample=${SAMPLE_RATE},aformat=sample_fmts=fltp:channel_layouts=stereo,` +
        `asetpts=PTS-STARTPTS,atrim=duration=${num(duration)},adelay=delays=${Math.round(track.outStart * 1000)}:all=1[${label}]`
    )
    return `[${label}]`
  })
  parts.push(`[${base}]${voiceLabels.join('')}amix=inputs=${voiceLabels.length + 1}:normalize=0:duration=first[${outLabel}]`)
  return parts
}

function isNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

export function validateVoiceMix(voice: unknown): string | null {
  if (!voice || typeof voice !== 'object') return 'Invalid voice mix'
  const { tracks, duckWindows, duckGain } = voice as Record<string, unknown>
  if (!Array.isArray(tracks) || tracks.length === 0) return 'Invalid voice mix: no tracks'
  if (tracks.length > MAX_VOICE_TRACKS) return `Too many voice clips (max ${MAX_VOICE_TRACKS})`
  let bytes = 0
  for (const track of tracks) {
    if (!track || typeof track !== 'object') return 'Invalid voice track'
    const { data, outStart, duration } = track as Record<string, unknown>
    // A tag check rather than instanceof: IPC may deliver a Uint8Array or a Buffer, possibly from another realm.
    if (Object.prototype.toString.call(data) !== '[object Uint8Array]' || (data as Uint8Array).byteLength === 0) {
      return 'Invalid voice track data'
    }
    if (!isNonNegative(outStart) || !isNonNegative(duration) || duration === 0) return 'Invalid voice track timing'
    bytes += (data as Uint8Array).byteLength
  }
  if (bytes > MAX_VOICE_BYTES) return 'Voice audio is too large for one export (max 64 MB)'
  if (!Array.isArray(duckWindows) || duckWindows.length > MAX_VOICE_TRACKS) return 'Invalid voice duck windows'
  for (const w of duckWindows) {
    if (!w || typeof w !== 'object') return 'Invalid voice duck window'
    const { start, end } = w as Record<string, unknown>
    if (!isNonNegative(start) || !isNonNegative(end) || end < start) return 'Invalid voice duck window'
  }
  if (!isNonNegative(duckGain) || duckGain > 1) return 'Invalid voice duck gain'
  return null
}
