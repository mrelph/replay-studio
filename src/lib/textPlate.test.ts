import { describe, it, expect } from 'vitest'
import { plateColorFor, plateRect } from './textPlate'

describe('plateColorFor', () => {
  it('puts a dark plate under light or saturated text', () => {
    expect(plateColorFor('#FFFFFF')).toMatch(/^rgba\(0,0,0/)
    expect(plateColorFor('#FF3B30')).toMatch(/^rgba\(0,0,0/)
    expect(plateColorFor('#FFCC00')).toMatch(/^rgba\(0,0,0/)
  })

  it('puts a light plate under dark text', () => {
    expect(plateColorFor('#1C1C1E')).toMatch(/^rgba\(255,255,255/)
    expect(plateColorFor('#000')).toMatch(/^rgba\(255,255,255/)
  })

  it('falls back to a dark plate for colours it cannot parse', () => {
    expect(plateColorFor('transparent')).toMatch(/^rgba\(0,0,0/)
    expect(plateColorFor(undefined)).toMatch(/^rgba\(0,0,0/)
  })
})

describe('plateRect', () => {
  it('pads the text box and stays inside the half-font-size cache margin', () => {
    const r = plateRect(200, 50, 40)
    expect(r.width).toBeGreaterThan(200)
    expect(r.height).toBeGreaterThan(50)
    expect(r.x).toBeCloseTo(-r.width / 2)
    expect(r.y).toBeCloseTo(-r.height / 2)
    expect((r.width - 200) / 2).toBeLessThan(20)
    expect((r.height - 50) / 2).toBeLessThan(20)
  })
})
