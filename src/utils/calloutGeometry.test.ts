import { describe, it, expect } from 'vitest'
import { fabric } from '@/lib/fabric'
import { plateRect } from '@/lib/textPlate'
import {
  CALLOUT_CLICK_OFFSET,
  CALLOUT_DRAG_MIN,
  calloutDotRadius,
  calloutParts,
  labelPosition,
  leaderEnd,
  plateBox,
  prepareRebuiltObject,
} from './calloutGeometry'

describe('callout geometry', () => {
  it('sizes the dot from the stroke width', () => {
    expect(calloutDotRadius(1)).toBe(3)
    expect(calloutDotRadius(6)).toBe(9)
  })

  it('ends the leader on the nearest point of the box edge', () => {
    const box = { left: 200, top: 100, width: 120, height: 40 }
    expect(leaderEnd({ x: 100, y: 120 }, box)).toEqual({ x: 200, y: 120 })
    expect(leaderEnd({ x: 400, y: 120 }, box)).toEqual({ x: 320, y: 120 })
    expect(leaderEnd({ x: 260, y: 30 }, box)).toEqual({ x: 260, y: 100 })
    expect(leaderEnd({ x: 260, y: 300 }, box)).toEqual({ x: 260, y: 140 })
    expect(leaderEnd({ x: 100, y: 50 }, box)).toEqual({ x: 200, y: 100 })
  })

  it('ends the leader on the nearest edge when the target is inside the box', () => {
    const box = { left: 200, top: 100, width: 120, height: 40 }
    expect(leaderEnd({ x: 210, y: 125 }, box)).toEqual({ x: 200, y: 125 })
    expect(leaderEnd({ x: 260, y: 135 }, box)).toEqual({ x: 260, y: 140 })
  })

  it('places the label at the release, or up and right of the target after a click', () => {
    expect(CALLOUT_DRAG_MIN).toBe(8)
    expect(CALLOUT_CLICK_OFFSET).toEqual({ x: 80, y: -80 })
    expect(labelPosition({ x: 100, y: 100 }, { x: 103, y: 102 })).toEqual({ x: 180, y: 20 })
    expect(labelPosition({ x: 100, y: 100 }, { x: 300, y: 60 })).toEqual({ x: 300, y: 60 })
  })

  it('grows the text box by the padding the plate is drawn with', () => {
    // textPlate.ts pads by 0.3 × font size across and 0.12 × font size down.
    const box = plateBox({ left: 100, top: 50, width: 80, height: 30 }, 20)
    expect(box.left).toBeCloseTo(94)
    expect(box.top).toBeCloseTo(47.6)
    expect(box.width).toBeCloseTo(92)
    expect(box.height).toBeCloseTo(34.8)
    const r = plateRect(80, 30, 20)
    expect(box.left).toBeCloseTo(100 + 40 + r.x)
    expect(box.top).toBeCloseTo(50 + 15 + r.y)
    expect(box.width).toBeCloseTo(r.width)
    expect(box.height).toBeCloseTo(r.height)
  })

  it('reads the parts of a three-child group only', () => {
    const dot = new fabric.Circle({ radius: 3 })
    const leader = new fabric.Line([0, 0, 10, 0])
    const label = new fabric.Rect({ width: 10, height: 10 })
    expect(calloutParts(new fabric.Group([dot, leader, label]))).toEqual({ dot, leader, label })
    expect(calloutParts(new fabric.Group([new fabric.Line([0, 0, 1, 1]), new fabric.Triangle()]))).toBeNull()
    expect(calloutParts(new fabric.Rect())).toBeNull()
  })

  it('turns object caching off again on a rebuilt callout only', () => {
    const callout = new fabric.Group([new fabric.Circle({ radius: 3 }), new fabric.Line([0, 0, 10, 0]), new fabric.Rect()])
    callout.objectCaching = true
    prepareRebuiltObject(callout, 'callout')
    expect(callout.objectCaching).toBe(false)
    const arrow = new fabric.Group([new fabric.Line([0, 0, 10, 0]), new fabric.Triangle()])
    arrow.objectCaching = true
    prepareRebuiltObject(arrow, 'arrow')
    expect(arrow.objectCaching).toBe(true)
  })
})
