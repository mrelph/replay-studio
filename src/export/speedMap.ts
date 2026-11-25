import { frameIndexAt, frameStart } from '../utils/frames'

export interface SpeedRegionLike {
  start: number
  end: number
  speed: number
}

export interface SpeedStep {
  start: number
  end: number
  speed: number
}

export const RAMP_SOURCE_SECONDS = 0.25
export const RAMP_STEPS = 5
export const MIN_STEP_FRAMES = 2

interface FrameSegment {
  frames: number
  speed: number
}

function stepCount(rampFrames: number): number {
  return Math.min(RAMP_STEPS, Math.floor(rampFrames / MIN_STEP_FRAMES))
}

/** Splits `total` frames over `n` steps; the remainder goes to the steps nearest the middle. */
function splitFrames(total: number, n: number, centered: boolean): number[] {
  const base = Math.floor(total / n)
  const extra = total - base * n
  const sizes = new Array<number>(n).fill(base)
  const order = Array.from({ length: n }, (_, i) => i)
  if (centered) order.sort((a, b) => Math.abs(a - (n - 1) / 2) - Math.abs(b - (n - 1) / 2))
  else order.reverse()
  for (let k = 0; k < extra; k++) sizes[order[k]] += 1
  return sizes
}

function ramp(total: number, from: number, to: number, centered: boolean): FrameSegment[] {
  const n = stepCount(total)
  if (n < 1) return []
  return splitFrames(total, n, centered).map((frames, i) => ({
    frames,
    speed: from + ((to - from) * (i + 1)) / (n + 1),
  }))
}

/** Constant-speed steps covering [0, duration] with no gaps; every edge but the last is a frame start. */
export function buildSpeedSteps(regions: SpeedRegionLike[], duration: number, fps: number): SpeedStep[] {
  const endFrame = Math.max(0, Math.ceil(duration * fps - 1e-6))
  const spans = regions
    .map((r) => ({ a: frameIndexAt(r.start, fps), b: Math.min(frameIndexAt(r.end, fps), endFrame), speed: r.speed }))
    .filter((r) => r.b > r.a)
    .sort((x, y) => x.a - y.a)
  const rampMax = Math.round(RAMP_SOURCE_SECONDS * fps)
  const rampOf = (r: { a: number; b: number }) => {
    const frames = Math.min(rampMax, Math.floor((r.b - r.a) / 2))
    return frames >= MIN_STEP_FRAMES ? frames : 0
  }

  const segments: FrameSegment[] = []
  const push = (frames: number, speed: number) => {
    if (frames > 0) segments.push({ frames, speed })
  }
  let cursor = 0
  spans.forEach((r, k) => {
    const prev = spans[k - 1]
    const next = spans[k + 1]
    const joinedPrev = prev !== undefined && prev.b === r.a
    const joinedNext = next !== undefined && r.b === next.a
    const own = rampOf(r)
    if (!joinedPrev) {
      push(r.a - cursor, 1)
      segments.push(...ramp(own, 1, r.speed, false))
    }
    push(r.b - own - (r.a + own), r.speed)
    if (joinedNext) {
      segments.push(...ramp(own + rampOf(next), r.speed, next.speed, true))
    } else {
      segments.push(...ramp(own, 1, r.speed, false).reverse())
    }
    cursor = joinedNext ? next.a + rampOf(next) : r.b
  })
  push(endFrame - cursor, 1)

  const merged: FrameSegment[] = []
  for (const s of segments) {
    const last = merged[merged.length - 1]
    if (last && Math.abs(last.speed - s.speed) < 1e-9) last.frames += s.frames
    else merged.push({ ...s })
  }
  if (merged.length === 0) return [{ start: 0, end: duration, speed: 1 }]

  let frame = 0
  return merged.map((s, i) => {
    const start = frameStart(frame, fps)
    frame += s.frames
    return { start, end: i === merged.length - 1 ? duration : frameStart(frame, fps), speed: s.speed }
  })
}

export function speedAt(steps: SpeedStep[], srcTime: number): number {
  let lo = 0
  let hi = steps.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (steps[mid].start <= srcTime) lo = mid
    else hi = mid - 1
  }
  return steps[lo].speed
}

/** On-screen seconds from source time 0 to `src`; outside [0, duration] the edge speed carries on. */
function presentationAt(steps: SpeedStep[], src: number): number {
  const first = steps[0]
  const last = steps[steps.length - 1]
  if (src <= first.start) return (src - first.start) / first.speed
  let acc = 0
  for (const s of steps) {
    const len = Math.min(src, s.end) - s.start
    if (len > 0) acc += len / s.speed
  }
  if (src > last.end) acc += (src - last.end) / last.speed
  return acc
}

/** On-screen seconds between two source times, excluding holds. Negative when toSrc < fromSrc. */
export function presentationOffset(steps: SpeedStep[], fromSrc: number, toSrc: number): number {
  return presentationAt(steps, toSrc) - presentationAt(steps, fromSrc)
}

/** Inverse of presentationOffset for seconds >= 0; clamps at the last step's end. */
export function sourceAtPresentation(steps: SpeedStep[], fromSrc: number, seconds: number): number {
  const last = steps[steps.length - 1]
  let remaining = presentationAt(steps, fromSrc) + seconds
  if (remaining <= 0) return Math.min(0, last.end)
  for (const s of steps) {
    const len = (s.end - s.start) / s.speed
    if (remaining <= len) return s.start + remaining * s.speed
    remaining -= len
  }
  return last.end
}
