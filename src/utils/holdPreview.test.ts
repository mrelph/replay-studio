import { describe, it, expect } from 'vitest'
import { previewHoldFor } from './holdPreview'
import type { Annotation } from '@/stores/drawingStore'
import type { VoiceClip } from '@/types/voice'
import { timeForFrame } from './frames'

const fps = 30000 / 1001
const frameTime = timeForFrame(150, fps)

const ann = (id: string, toolType: string, freezeDuration?: number) =>
  ({ id, toolType, startTime: frameTime, endTime: frameTime + 2, layer: 0, freezeDuration }) as unknown as Annotation

const voice = (duration: number, frozen = true): VoiceClip => ({ id: 'v1', startTime: frameTime, duration, frozen, mime: 'audio/webm' })

describe('previewHoldFor', () => {
  it('returns the carrier hold when the pending preview is on the current frame', () => {
    const carrier = ann('arrow-1', 'arrow', 1.4)
    const list = [carrier, ann('path-1', 'path')]
    const hold = previewHoldFor(list, [], frameTime, frameTime + 0.3 / fps, fps)
    expect(hold).toMatchObject({ time: frameTime, seconds: 1.4 })
    expect(hold?.voiceId).toBeUndefined()
  })

  it('returns null without a pending preview', () => {
    expect(previewHoldFor([ann('arrow-1', 'arrow', 1.4)], [], null, frameTime, fps)).toBeNull()
  })

  it('returns null when the playhead is one frame away', () => {
    expect(previewHoldFor([ann('arrow-1', 'arrow', 1.4)], [], frameTime, timeForFrame(151, fps), fps)).toBeNull()
    expect(previewHoldFor([ann('arrow-1', 'arrow', 1.4)], [], frameTime, timeForFrame(149, fps), fps)).toBeNull()
  })

  it('returns null when the freeze was set to 0', () => {
    expect(previewHoldFor([ann('arrow-1', 'arrow'), ann('freeze-1', 'freeze', 0)], [], frameTime, frameTime, fps)).toBeNull()
  })

  it('returns null when the frame has no freeze carrier', () => {
    expect(previewHoldFor([ann('arrow-1', 'arrow')], [], frameTime, frameTime, fps)).toBeNull()
  })

  it('returns a hold for a frame that has only a frozen voice clip', () => {
    expect(previewHoldFor([], [voice(2.5)], frameTime, frameTime, fps)).toMatchObject({ time: frameTime, seconds: 2.5, voiceId: 'v1' })
    expect(previewHoldFor([], [voice(2.5, false)], frameTime, frameTime, fps)).toBeNull()
  })

  it('holds for the longer of the freeze and the voice', () => {
    expect(previewHoldFor([ann('freeze-1', 'freeze', 0)], [voice(2)], frameTime, frameTime, fps)).toMatchObject({ seconds: 2, voiceId: 'v1' })
    expect(previewHoldFor([ann('freeze-1', 'freeze', 4)], [voice(2)], frameTime, frameTime, fps)).toMatchObject({ seconds: 4, voiceId: 'v1' })
  })
})
