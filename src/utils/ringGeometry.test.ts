import { describe, it, expect } from 'vitest'
import { ringRadii } from './ringGeometry'

describe('ringRadii', () => {
  it('flattens the dragged radius', () => {
    expect(ringRadii({ x: 100, y: 100 }, { x: 150, y: 100 })).toEqual({ rx: 50, ry: 20 })
  })
  it('keeps a minimum size', () => {
    expect(ringRadii({ x: 100, y: 100 }, { x: 103, y: 104 })).toEqual({ rx: 12, ry: 4.8 })
  })
  it('uses the distance in any direction', () => {
    expect(ringRadii({ x: 100, y: 100 }, { x: 100, y: 160 }).rx).toBe(60)
  })
})
