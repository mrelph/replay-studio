import { frameIndexAt, frameStart } from './frames'

export interface SpeedRegion {
  id: string
  start: number
  end: number
  speed: number
}

export const SPEED_CHIPS = [0.25, 0.5, 0.75, 2] as const
export const DEFAULT_REGION_SPEED = 0.5
export const MIN_SPEED = 0.1
export const MAX_SPEED = 4
export const MIN_REGION_FRAMES = 4
export const MIN_REMNANT_SECONDS = 0.1

let regionIdCounter = 0
export function newSpeedRegionId(): string {
  regionIdCounter += 1
  return `speed-${Date.now().toString(36)}-${regionIdCounter}`
}

/** "50%" for slow speeds, "2x" for faster ones. */
export function formatSpeed(speed: number): string {
  return speed >= 1 ? `${+speed.toFixed(2)}x` : `${Math.round(speed * 100)}%`
}

export function clampSpeed(speed: number): number {
  return Math.min(MAX_SPEED, Math.max(MIN_SPEED, speed))
}

/** Snaps to frame starts, clamps to [0, duration]; null when shorter than MIN_REGION_FRAMES. */
export function normalizeRegion(region: SpeedRegion, duration: number, fps: number): SpeedRegion | null {
  const startIndex = frameIndexAt(Math.min(duration, Math.max(0, region.start)), fps)
  const endIndex = frameIndexAt(Math.min(duration, Math.max(0, region.end)), fps)
  if (endIndex - startIndex < MIN_REGION_FRAMES) return null
  return { ...region, start: frameStart(startIndex, fps), end: frameStart(endIndex, fps) }
}

/** Adds or replaces (same id) `region`: trims or splits every other region it covers, drops remnants < MIN_REMNANT_SECONDS, returns the list sorted by start. */
export function placeSpeedRegion(regions: SpeedRegion[], region: SpeedRegion, duration: number, fps: number): SpeedRegion[] {
  const placed = normalizeRegion(region, duration, fps)
  if (!placed) return regions

  const result: SpeedRegion[] = [placed]
  for (const other of regions) {
    if (other.id === placed.id) continue
    if (other.end <= placed.start || other.start >= placed.end) {
      result.push(other)
      continue
    }
    if (placed.start - other.start >= MIN_REMNANT_SECONDS) {
      result.push({ ...other, end: placed.start })
    }
    if (other.end - placed.end >= MIN_REMNANT_SECONDS) {
      const keepsId = placed.start - other.start < MIN_REMNANT_SECONDS
      result.push({ ...other, id: keepsId ? other.id : newSpeedRegionId(), start: placed.end })
    }
  }
  return result.sort((a, b) => a.start - b.start)
}

/** Load-time cleanup of untrusted data: non-arrays → []; malformed entries dropped; speeds clamped; earlier entries win overlaps. */
export function sanitizeSpeedRegions(raw: unknown, duration: number, fps: number): SpeedRegion[] {
  if (!Array.isArray(raw)) return []

  const kept: SpeedRegion[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const { id, start, end, speed } = entry as Partial<SpeedRegion>
    if (typeof start !== 'number' || !Number.isFinite(start)) continue
    if (typeof end !== 'number' || !Number.isFinite(end) || end <= start) continue
    if (typeof speed !== 'number' || !Number.isFinite(speed)) continue

    const candidate = normalizeRegion(
      {
        id: typeof id === 'string' && id.length > 0 && !kept.some((k) => k.id === id) ? id : newSpeedRegionId(),
        start,
        end,
        speed: clampSpeed(speed),
      },
      duration,
      fps,
    )
    if (!candidate) continue

    let best: { start: number; end: number } | null = null
    let cursor = candidate.start
    const consider = (gapEnd: number) => {
      if (gapEnd - cursor >= MIN_REMNANT_SECONDS && (!best || gapEnd - cursor > best.end - best.start)) {
        best = { start: cursor, end: gapEnd }
      }
    }
    for (const taken of [...kept].sort((a, b) => a.start - b.start)) {
      if (taken.end <= cursor) continue
      if (taken.start >= candidate.end) break
      consider(taken.start)
      cursor = Math.max(cursor, taken.end)
    }
    consider(candidate.end)
    if (!best) continue

    const trimmed = normalizeRegion({ ...candidate, ...(best as { start: number; end: number }) }, duration, fps)
    if (trimmed) kept.push(trimmed)
  }
  return kept.sort((a, b) => a.start - b.start)
}
