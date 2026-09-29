import { describe, it, expect } from 'vitest'
import { computeMagnifierSampleRect } from './clipRenderer'

describe('computeMagnifierSampleRect', () => {
  it('matches updateMagnifierContent\'s math when ref and video dims are equal (1:1, no scaling)', () => {
    // radius 60, zoom 2.5: size=120, sourceSize=48, centered on (200,150).
    const rect = computeMagnifierSampleRect(
      { left: 140, top: 90, radius: 60 },
      2.5,
      { width: 1920, height: 1080 },
      { width: 1920, height: 1080 }
    )
    expect(rect.size).toBe(120)
    expect(rect.sourceX).toBeCloseTo(200 - 24, 5) // centerX - sourceSize/2
    expect(rect.sourceY).toBeCloseTo(150 - 24, 5)
    expect(rect.sourceWidth).toBeCloseTo(48, 5)
    expect(rect.sourceHeight).toBeCloseTo(48, 5)
  })

  it('scales the sample rect when video dims differ from ref dims', () => {
    const rect = computeMagnifierSampleRect(
      { left: 0, top: 0, radius: 50 },
      2.5,
      { width: 100, height: 100 },
      { width: 200, height: 100 } // 2x scale on X only
    )
    // centerX=50, centerY=50, size=100, sourceSize=40
    // rawSourceX = (50 - 20) * scaleX(2) = 60; rawSourceY = (50-20)*1 = 30
    expect(rect.sourceX).toBeCloseTo(60, 5)
    expect(rect.sourceY).toBeCloseTo(30, 5)
    expect(rect.sourceWidth).toBeCloseTo(40 * 2, 5)
    expect(rect.sourceHeight).toBeCloseTo(40, 5)
  })

  it('clamps the source rect to stay within the video bounds near the top-left edge', () => {
    // Circle centered near (0,0) so the naive source rect would go negative.
    const rect = computeMagnifierSampleRect(
      { left: -50, top: -50, radius: 50 },
      2.5,
      { width: 1000, height: 1000 },
      { width: 1000, height: 1000 }
    )
    expect(rect.sourceX).toBe(0)
    expect(rect.sourceY).toBe(0)
    expect(rect.sourceWidth).toBeGreaterThan(0)
    expect(rect.sourceHeight).toBeGreaterThan(0)
  })

  it('clamps the source rect to stay within the video bounds near the bottom-right edge', () => {
    const videoDims = { width: 200, height: 200 }
    // Circle centered near the bottom-right corner.
    const rect = computeMagnifierSampleRect(
      { left: 170, top: 170, radius: 50 },
      1, // zoom 1 -> sourceSize == size == 100, definitely overflows a 200x200 frame
      { width: 200, height: 200 },
      videoDims
    )
    expect(rect.sourceX + rect.sourceWidth).toBeLessThanOrEqual(videoDims.width)
    expect(rect.sourceY + rect.sourceHeight).toBeLessThanOrEqual(videoDims.height)
  })
})
