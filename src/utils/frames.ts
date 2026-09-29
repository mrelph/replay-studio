/** Used until the source has been probed (or when probing isn't available, e.g. browser dev). */
export const DEFAULT_FPS = 30

// Seek targets sit a hair past the frame boundary so float error in
// `k / fps` can never land the decoder on the previous frame.
const BOUNDARY_EPSILON = 1e-3

/** Index of the frame showing at `time` (frame k covers [k/fps, (k+1)/fps)). */
export function frameIndexAt(time: number, fps: number): number {
  return Math.max(0, Math.floor(time * fps + BOUNDARY_EPSILON))
}

/** Seek time that reliably displays frame `index`. */
export function timeForFrame(index: number, fps: number): number {
  return Math.max(0, index) / fps + (index > 0 ? BOUNDARY_EPSILON / fps : 0)
}

/** `time` moved by `frames` whole frames, clamped to [0, duration], landing on a frame start. */
export function stepFrames(time: number, frames: number, fps: number, duration: number): number {
  const target = timeForFrame(frameIndexAt(time, fps) + frames, fps)
  return Math.max(0, Math.min(duration, target))
}

/**
 * mm:ss:ff timecode: wall-clock seconds of the frame's start, then the frame's
 * index within that second. At fractional rates (29.97) every second still
 * starts at :00, and seconds agree with the clip list's mm:ss.
 */
export function formatTimecode(seconds: number, fps: number): string {
  const index = frameIndexAt(seconds, fps)
  const whole = Math.floor(index / fps + 1e-9)
  const frames = index - Math.ceil(whole * fps - 1e-6)
  const mins = Math.floor(whole / 60)
  const secs = whole % 60
  const frameDigits = Math.ceil(fps) > 100 ? 3 : 2
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${frames.toString().padStart(frameDigits, '0')}`
}

/** Next forward shuttle rate for L: starts at `base` when not moving forward, then doubles up to 8x. */
export function nextForwardRate(direction: 'forward' | 'reverse' | 'stopped', rate: number, base: number): number {
  if (direction !== 'forward') return base
  return Math.min(8, rate * 2)
}

/** Next reverse shuttle rate for J: 1x when not already reversing, then doubles up to 8x. */
export function nextReverseRate(direction: 'forward' | 'reverse' | 'stopped', rate: number): number {
  if (direction !== 'reverse') return 1
  return Math.min(8, rate * 2)
}
