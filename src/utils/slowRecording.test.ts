import { describe, it, expect } from 'vitest'
import { finishSlowRecording } from './slowRecording'

describe('finishSlowRecording', () => {
  it('records a snapped region for a long enough hold', () => {
    expect(finishSlowRecording(2.011, 3.517, 3.0, 0.5, 20, 30)).toEqual({ record: true, region: { start: 2, end: 3.5, speed: 0.5 } })
  })

  it('rejects a hold shorter than 0.3 s of wall-clock time', () => {
    expect(finishSlowRecording(2, 2.1, 0.2, 0.5, 20, 30)).toEqual({ record: false, reason: 'too-short' })
  })

  it('rejects a hold that covers under 4 source frames', () => {
    expect(finishSlowRecording(2, 2.05, 1.0, 0.5, 20, 30)).toEqual({ record: false, reason: 'no-motion' })
  })

  it('rejects a hold that ended before it started', () => {
    expect(finishSlowRecording(3, 2, 1.0, 0.5, 20, 30)).toEqual({ record: false, reason: 'no-motion' })
  })
})
