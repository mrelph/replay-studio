import type { Annotation } from '@/stores/drawingStore'
import { frameIndexAt } from '@/utils/frames'
import { findFreezeAt } from '@/utils/freezeMarkers'

/** The freeze to hold on when Play is pressed, or null. Requires a pending preview on the current frame and a carrier with freezeDuration > 0. */
export function previewHoldFor(annotations: Annotation[], pendingPreview: number | null, currentTime: number, fps: number): Annotation | null {
  if (pendingPreview === null) return null
  if (frameIndexAt(pendingPreview, fps) !== frameIndexAt(currentTime, fps)) return null
  return findFreezeAt(annotations, currentTime, fps) ?? null
}
