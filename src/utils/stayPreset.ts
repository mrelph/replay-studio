export type StayPreset = 'freeze' | 1 | 2 | 4 | 'end'

export const STAY_PRESETS: { value: StayPreset; label: string }[] = [
  { value: 'freeze', label: 'Freeze only' },
  { value: 1, label: '1s' },
  { value: 2, label: '2s' },
  { value: 4, label: '4s' },
  { value: 'end', label: 'To end' },
]

export const STAY_TOOL_TYPES: ReadonlySet<string> = new Set([
  'pen', 'path', 'line', 'arrow', 'arc-arrow', 'rectangle', 'circle', 'text', 'spotlight', 'magnifier',
])

export interface StayTiming {
  endTime: number
  fadeIn: number
  fadeOut: number
}

export function stayTiming(
  preset: StayPreset,
  startTime: number,
  videoDuration: number,
  fps: number,
  defaults: { fadeIn: number; fadeOut: number },
): StayTiming {
  if (preset === 'freeze') {
    return { endTime: startTime + 0.5 / fps, fadeIn: 0, fadeOut: 0 }
  }
  const target = preset === 'end' ? videoDuration : startTime + preset
  const endTime = videoDuration > 0 ? Math.min(target, videoDuration) : target
  return { endTime, fadeIn: defaults.fadeIn, fadeOut: defaults.fadeOut }
}
