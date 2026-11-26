import { frameIndexAt, lastTimeInFrame } from '@/utils/frames'

export type StayPreset = 'freeze' | 1 | 1.5 | 2 | 4 | 'end'

export const STAY_PRESETS: { value: StayPreset; label: string }[] = [
  { value: 'freeze', label: 'Freeze only' },
  { value: 1, label: '1s' },
  { value: 1.5, label: '1.5s' },
  { value: 2, label: '2s' },
  { value: 4, label: '4s' },
  { value: 'end', label: 'To end' },
]

export const STAY_TOOL_TYPES: ReadonlySet<string> = new Set([
  'pen', 'path', 'line', 'arrow', 'arc-arrow', 'rectangle', 'circle', 'text', 'spotlight', 'magnifier',
  'ring', 'zone', 'callout',
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
    // The whole frame, whatever time a hold on it shows, and never the next one.
    const frameEnd = lastTimeInFrame(frameIndexAt(startTime, fps), fps)
    const clamped = videoDuration > 0 ? Math.min(frameEnd, videoDuration) : frameEnd
    return { endTime: clamped > startTime ? clamped : frameEnd, fadeIn: 0, fadeOut: 0 }
  }
  const target = preset === 'end' ? videoDuration : startTime + preset
  const endTime = videoDuration > 0 ? Math.min(target, videoDuration) : target
  return { endTime, fadeIn: defaults.fadeIn, fadeOut: defaults.fadeOut }
}
