import { describe, it, expect } from 'vitest'
import { sequenceFrame } from './freezeSequence'

describe('sequenceFrame', () => {
  it('staggers delays and sizes the hold', () => {
    const s = sequenceFrame([{ id: 'a', drawIn: 0.35 }, { id: 'b', drawIn: 0.4 }, { id: 't' }, { id: 'c', drawIn: 0.35 }])
    expect(s.delays.get('a')).toBe(0)
    expect(s.delays.get('b')).toBeCloseTo(0.35)
    expect(s.delays.get('t')).toBeCloseTo(0.75)
    expect(s.delays.get('c')).toBeCloseTo(0.9)
    expect(s.hold).toBeCloseTo(2.3)
  })

  it('rounds the hold half up to 0.1', () => {
    expect(sequenceFrame([{ id: 'a', drawIn: 0.35 }]).hold).toBeCloseTo(1.4)
    expect(sequenceFrame([{ id: 't', drawIn: 0 }]).hold).toBeCloseTo(1.2)
  })

  it('treats negative or NaN drawIn as no draw-on', () => {
    expect(sequenceFrame([{ id: 'a', drawIn: -1 }, { id: 'b', drawIn: NaN }]).delays.get('b')).toBeCloseTo(0.15)
  })

  it('returns no delays and hold 0 for empty input', () => {
    const s = sequenceFrame([])
    expect(s.delays.size).toBe(0)
    expect(s.hold).toBe(0)
  })

  it('caps the hold', () => {
    expect(sequenceFrame(Array.from({ length: 200 }, (_, i) => ({ id: String(i), drawIn: 0.4 }))).hold).toBe(30)
  })
})
