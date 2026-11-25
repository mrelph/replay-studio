import { MAX_RECORDED_HOLD_SECONDS } from '@/utils/freezeFrame'

export const NO_DRAW_STEP_SECONDS = 0.15
export const READ_TIME_SECONDS = 1.0

export interface SequenceItem { id: string; drawIn?: number }
export interface FrameSequence { delays: Map<string, number>; hold: number }

const stepFor = (item: SequenceItem) =>
  item.drawIn !== undefined && Number.isFinite(item.drawIn) && item.drawIn > 0 ? item.drawIn : NO_DRAW_STEP_SECONDS

/** `items` in creation order; freeze markers excluded by the caller. Empty input → no delays, hold 0. */
export function sequenceFrame(items: SequenceItem[]): FrameSequence {
  const delays = new Map<string, number>()
  if (items.length === 0) return { delays, hold: 0 }
  let t = 0
  for (const item of items) {
    delays.set(item.id, t)
    t += stepFor(item)
  }
  const hold = Math.round((t + READ_TIME_SECONDS) * 10 + 1e-9) / 10
  return { delays, hold: Math.min(hold, MAX_RECORDED_HOLD_SECONDS) }
}
