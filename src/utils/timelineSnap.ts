import type { Annotation } from '@/stores/drawingStore'
import { frameIndexAt, snapToFrame } from '@/utils/frames'
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

/** The playhead plus the start of every frame that actually holds the video, except the annotation being dragged. */
export function snapTargets(annotations: Annotation[], playhead: number, draggedId: string): number[] {
  const holds = annotations.filter((a) => a.id !== draggedId && (a.freezeDuration ?? 0) > 0).map((a) => a.startTime)
  return [playhead, ...holds]
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
