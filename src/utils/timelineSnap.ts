import type { Annotation } from '@/stores/drawingStore'
import { frameIndexAt, frameStart, snapToFrame, timeForFrame } from '@/utils/frames'
import { findFreezeCarrierAt } from '@/utils/freezeFrame'

export const SNAP_PIXELS = 6

/** Snaps to the nearest target within SNAP_PIXELS (unless `free`), then to a whole frame. */
export function snapTime(time: number, targets: number[], pxPerSecond: number, fps: number, free: boolean): number {
  const start = Math.max(0, time)
  let snapped = start
  if (!free && pxPerSecond > 0) {
    const reach = SNAP_PIXELS / pxPerSecond
    let best = Infinity
    for (const target of targets) {
      const distance = Math.abs(target - start)
      if (distance <= reach && distance < best) {
        best = distance
        snapped = target
      }
    }
  }
  return snapToFrame(snapped, fps)
}

/** The playhead plus the start of every frame that holds the video; a bar that is itself a freeze carrier only gets the playhead, so it never lands on another freeze's frame. */
export function snapTargets(annotations: Annotation[], playhead: number, dragged: Annotation): number[] {
  if (typeof dragged.freezeDuration === 'number') return [playhead]
  const holds = annotations.filter((a) => a.id !== dragged.id && (a.freezeDuration ?? 0) > 0).map((a) => a.startTime)
  return [playhead, ...holds]
}

/** `time` clamped to [min, max], then on a whole frame that still lies inside the range; `exact` lands on the frame start itself (a drawing's start) instead of its seek time. */
export function frameWithin(time: number, min: number, max: number, fps: number, exact = false): number {
  const land = exact ? frameStart : timeForFrame
  let t = land(frameIndexAt(Math.min(max, Math.max(min, time)), fps), fps)
  if (t < min) t = land(frameIndexAt(t, fps) + 1, fps)
  if (t > max) t = land(frameIndexAt(t, fps) - 1, fps)
  return t
}

/** A drawing starts on the exact frame start, so it shows at every time the video reports for that frame; a freeze carrier keeps the seek time its hold jumps to. */
export function startsOnFrameStart(annotation: Pick<Annotation, 'freezeDuration'>): boolean {
  return typeof annotation.freezeDuration !== 'number'
}

/** Where a bar's start lands on `time`'s frame (see `startsOnFrameStart`). */
export function barStart(annotation: Pick<Annotation, 'freezeDuration'>, time: number, fps: number): number {
  const frame = frameIndexAt(time, fps)
  return startsOnFrameStart(annotation) ? frameStart(frame, fps) : timeForFrame(frame, fps)
}

/** Frames to re-sync when a bar drag ends, or null when nothing should run (end-edge drag, or a freeze marker the user placed by hand). */
export function dragEndSyncTimes(toolType: string, edge: 'move' | 'start' | 'end', startBefore: number, finalStart: number): number[] | null {
  if (edge === 'end' || toolType === 'freeze') return null
  return [startBefore, finalStart]
}

export interface FreezeFieldState {
  seconds: number
  isAuto: boolean
  showAutoButton: boolean
}

/** What the inspector's Freeze field shows for the frame `startTime` is on. */
export function freezeFieldState(annotations: Annotation[], startTime: number, fps: number): FreezeFieldState {
  const carrier = findFreezeCarrierAt(annotations, startTime, fps)
  const frame = frameIndexAt(startTime, fps)
  const hasDrawing = annotations.some((a) => a.toolType !== 'freeze' && frameIndexAt(a.startTime, fps) === frame)
  const isAuto = carrier?.freezeAuto === true
  return { seconds: carrier?.freezeDuration ?? 0, isAuto, showAutoButton: hasDrawing && !isAuto }
}
