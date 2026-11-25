import { speedAt, type SpeedRegionLike, type SpeedStep } from '@/export/speedMap'
import { formatSpeed } from '@/utils/speedRegions'

export const MIN_LIVE_RATE = 0.0625
export const MAX_LIVE_RATE = 16

// Chromium truncates currentTime to whole microseconds, just below a frame start.
const START_TOLERANCE = 5e-6

/** userRate × region speed, clamped. `recordingSpeed` (Task 7) overrides the map while a region is being recorded. */
export function liveRate(userRate: number, regionSpeed: number, recordingSpeed: number | null): number {
  const rate = userRate * (recordingSpeed ?? regionSpeed)
  return Math.min(MAX_LIVE_RATE, Math.max(MIN_LIVE_RATE, rate))
}

/** Whether region audio muting applies: true when the effective region speed is not 1. */
export function regionMutes(regionSpeed: number, recordingSpeed: number | null): boolean {
  return (recordingSpeed ?? regionSpeed) !== 1
}

export interface LiveInput {
  userRate: number
  userMuted: boolean
  /** Reverse shuttle is a seek loop on a paused element: regions are ignored and the rate left alone. */
  reversing: boolean
  steps: SpeedStep[] | undefined
  time: number
  recordingSpeed: number | null
}

/** What the video element should be set to; `rate` null means leave playbackRate as it is. */
export function liveOutput(input: LiveInput): { rate: number | null; muted: boolean } {
  if (input.reversing) return { rate: null, muted: input.userMuted }
  const regionSpeed = input.steps ? speedAt(input.steps, input.time) : 1
  return {
    rate: liveRate(input.userRate, regionSpeed, input.recordingSpeed),
    muted: input.userMuted || regionMutes(regionSpeed, input.recordingSpeed),
  }
}

/** The speed badge for the region under the playhead (e.g. "50%"), or null outside regions. */
export function regionBadge(regions: SpeedRegionLike[], time: number): string | null {
  const region = regions.find((r) => r.start <= time + START_TOLERANCE && time + START_TOLERANCE < r.end)
  return region ? formatSpeed(region.speed) : null
}
