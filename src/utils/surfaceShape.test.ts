import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { fabric } from '@/lib/fabric'
import { buildSurfaceShape, recolorKeepingAlpha, surfaceParts, withAlpha } from './surfaceShape'
import { buildRing } from '@/components/Canvas/tools/ringTool'

const originalGetContext = HTMLCanvasElement.prototype.getContext
beforeAll(() => {
  const mockContext = new Proxy({} as Record<string, unknown>, {
    get(target, prop: string) {
      if (prop in target) return target[prop]
      if (prop === 'measureText') return (text: string) => ({ width: (text?.length || 0) * 8 })
      if (prop === 'canvas') return { width: 0, height: 0, getAttribute: () => null, setAttribute: () => undefined }
      if (prop === 'getContextAttributes') return () => ({})
      return () => undefined
    },
    set(target, prop: string, value) {
      target[prop] = value
      return true
    },
  })
  HTMLCanvasElement.prototype.getContext = (() => mockContext) as unknown as HTMLCanvasElement['getContext']
})
afterAll(() => {
  HTMLCanvasElement.prototype.getContext = originalGetContext
})

const canvases: Array<InstanceType<typeof fabric.Canvas>> = []
afterEach(() => {
  canvases.splice(0).forEach((canvas) => canvas.dispose())
})

const ring = () => buildRing({ center: { x: 200, y: 150 }, rx: 50, ry: 20, color: '#ffcc00', strokeWidth: 4, style: 'outline' })

function expectSameRing(copy: fabric.Object, original: fabric.Group) {
  const parts = surfaceParts(copy)
  expect(parts).not.toBeNull()
  const { fill, outline } = parts!
  expect(fill.type).toBe('ellipse')
  expect(outline.type).toBe('ellipse')
  expect(fill.fill).toBe('rgba(255,204,0,0.18)')
  expect(outline.stroke).toBe('#ffcc00')
  for (const child of [fill, outline]) {
    expect(child.originX).toBe('center')
    expect(child.originY).toBe('center')
  }
  expect(fill.shadow).toBeFalsy()
  expect(outline.shadow).toBeTruthy()
  const center = copy.getCenterPoint()
  const before = original.getCenterPoint()
  expect(center.x).toBeCloseTo(before.x)
  expect(center.y).toBeCloseTo(before.y)
  expect(copy.width).toBeCloseTo(original.width as number)
  expect(copy.height).toBeCloseTo(original.height as number)
}

describe('surfaceShape', () => {
  it('adds alpha to a colour', () => {
    expect(withAlpha('#ffcc00', 0.18)).toBe('rgba(255,204,0,0.18)')
    expect(withAlpha('rgba(255,204,0,0.5)', 0.18)).toBe('rgba(255,204,0,0.18)')
  })

  it('recolours a translucent fill and leaves an opaque one opaque', () => {
    expect(recolorKeepingAlpha('rgba(255,204,0,0.18)', '#00ff00')).toBe('rgba(0,255,0,0.18)')
    expect(recolorKeepingAlpha('#ffcc00', '#00ff00')).toBe('#00ff00')
  })

  it('returns the parts it was built from, and null for a single object', () => {
    const fill = new fabric.Ellipse({ rx: 10, ry: 4 })
    const outline = new fabric.Ellipse({ rx: 10, ry: 4 })
    expect(surfaceParts(buildSurfaceShape(fill, outline))).toEqual({ fill, outline })
    expect(surfaceParts(fill)).toBeNull()
  })

  it('centres a ring on its press point', () => {
    const center = ring().getCenterPoint()
    expect(center.x).toBeCloseTo(200)
    expect(center.y).toBeCloseTo(150)
  })

  it('survives the undo snapshot (toJSON / loadFromJSON)', async () => {
    const source = new fabric.Canvas(document.createElement('canvas'), { width: 400, height: 300 })
    const target = new fabric.Canvas(document.createElement('canvas'), { width: 400, height: 300 })
    canvases.push(source, target)
    const original = ring()
    source.add(original)
    const json = JSON.stringify(source.toJSON([]))
    await new Promise<void>((resolve) => target.loadFromJSON(JSON.parse(json), () => resolve()))
    expectSameRing(target.getObjects()[0], original)
  })

  it('survives the export clone', async () => {
    const original = ring()
    const copy = await new Promise<fabric.Object>((resolve) => original.clone((c: fabric.Object) => resolve(c)))
    expectSameRing(copy, original)
  })
})
