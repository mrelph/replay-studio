import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { fabric } from '@/lib/fabric'
import { DEFAULT_TEXT_FORMAT } from '@/utils/textFormat'
import { calloutDotRadius, calloutParts, leaderEnd, plateBox } from '@/utils/calloutGeometry'
import { createCalloutTool } from './calloutTool'
import type { ToolContext, ToolPoint } from './types'

const canvases: Array<InstanceType<typeof fabric.Canvas>> = []
function testCanvas() {
  const canvas = new fabric.Canvas(document.createElement('canvas'), { width: 600, height: 400 })
  canvases.push(canvas)
  return canvas
}
afterEach(() => {
  canvases.splice(0).forEach((canvas) => canvas.dispose())
})

// jsdom has no 2D canvas; IText measures text on construction, so stub a permissive context.
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

function setup(canvas = testCanvas()) {
  const commit = vi.fn()
  const ctx: ToolContext = { canvas, color: '#ff0000', strokeWidth: 4, style: 'outline', textFormat: DEFAULT_TEXT_FORMAT, commit }
  return { canvas, commit, ctx, tool: createCalloutTool() }
}

const at = (target?: fabric.Object) => ({ target } as fabric.IEvent)
const tick = () => Promise.resolve()

function place(tool: ReturnType<typeof createCalloutTool>, ctx: ToolContext, target: ToolPoint, release: ToolPoint) {
  tool.onDown?.(ctx, target, at())
  tool.onMove?.(ctx, release, at())
  tool.onUp?.(ctx, release, at())
  return ctx.canvas.getActiveObject() as fabric.IText & { textPlate?: boolean }
}

describe('callout tool', () => {
  it('opens a plated label up and right of a clicked target, with the caret in it', () => {
    const { ctx, canvas, tool } = setup()
    const label = place(tool, ctx, { x: 100, y: 100 }, { x: 102, y: 101 })
    expect(label.type).toBe('i-text')
    expect(label.isEditing).toBe(true)
    expect(label.left).toBe(180)
    expect(label.top).toBe(20)
    expect(label.textPlate).toBe(true)
    expect(label.fill).toBe('#ff0000')
    expect(canvas.getObjects()).toEqual([label])
    expect(tool.isBusy?.()).toBe(true)
    tool.cancel?.(ctx)
  })

  it('commits a dot, a leader to the plate edge and the label when the text is committed', async () => {
    const { ctx, canvas, commit, tool } = setup()
    const label = place(tool, ctx, { x: 100, y: 300 }, { x: 300, y: 100 })
    expect(label.left).toBe(300)
    label.set({ text: 'Pass' })
    // The plate is drawn around the text's centre, which Fabric offsets by half the (unused) text stroke width.
    const width = label.width ?? 0
    const height = label.height ?? 0
    const center = label.getCenterPoint()
    expect(center.x).toBeCloseTo(300 + (width + (label.strokeWidth ?? 0)) / 2)
    const box = plateBox({ left: center.x - width / 2, top: center.y - height / 2, width, height }, 24)
    label.exitEditing()
    await tick()

    expect(commit).toHaveBeenCalledTimes(1)
    const [group, toolType] = commit.mock.calls[0]
    expect(toolType).toBe('callout')
    expect(group.objectCaching).toBe(false)
    const parts = calloutParts(group)!
    expect(parts.label).toBe(label)
    expect(parts.dot.type).toBe('circle')
    expect((parts.dot as fabric.Circle).radius).toBe(calloutDotRadius(4))
    expect(parts.dot.fill).toBe('#ff0000')
    const leader = parts.leader as fabric.Line
    expect(leader.type).toBe('line')
    expect(leader.stroke).toBe('#ff0000')
    expect(leader.strokeWidth).toBe(4)
    expect(leader.strokeLineCap).toBe('round')
    const end = leaderEnd({ x: 100, y: 300 }, box)
    expect([leader.x1, leader.y1]).toEqual([100, 300])
    expect(leader.x2).toBeCloseTo(end.x)
    expect(leader.y2).toBeCloseTo(end.y)
    expect(canvas.getObjects()).toEqual([])
    expect(tool.isBusy?.()).toBe(false)
  })

  it('leaves an empty callout out silently', async () => {
    const { ctx, canvas, commit, tool } = setup()
    const label = place(tool, ctx, { x: 100, y: 100 }, { x: 100, y: 100 })
    label.exitEditing()
    await tick()
    expect(commit).not.toHaveBeenCalled()
    expect(canvas.getObjects()).toEqual([])
    expect(tool.isBusy?.()).toBe(false)
  })

  it('the click that ends the typing does not start a new callout', async () => {
    const { ctx, canvas, commit, tool } = setup()
    const label = place(tool, ctx, { x: 100, y: 100 }, { x: 100, y: 100 })
    label.set({ text: 'Pass' })
    // Fabric ends editing while deselecting, before the canvas fires mouse:down.
    canvas.discardActiveObject()
    expect(tool.isBusy?.()).toBe(true)
    tool.onDown?.(ctx, { x: 400, y: 300 }, at())
    tool.onUp?.(ctx, { x: 400, y: 300 }, at())
    await tick()
    expect(commit).toHaveBeenCalledTimes(1)
    expect(canvas.getObjects()).toEqual([])
    expect(tool.isBusy?.()).toBe(false)
    // The next press is a new callout.
    tool.onDown?.(ctx, { x: 400, y: 300 }, at())
    expect(tool.isBusy?.()).toBe(true)
    tool.cancel?.(ctx)
  })

  it('a press elsewhere while still typing commits the first callout and starts nothing', async () => {
    const { ctx, commit, tool } = setup()
    const label = place(tool, ctx, { x: 100, y: 100 }, { x: 100, y: 100 })
    label.set({ text: 'Pass' })
    tool.onDown?.(ctx, { x: 400, y: 300 }, at())
    expect(label.isEditing).toBe(false)
    await tick()
    expect(commit).toHaveBeenCalledTimes(1)
    expect(tool.isBusy?.()).toBe(false)
  })

  it('a press on the label being typed is left to Fabric', async () => {
    const { ctx, commit, tool } = setup()
    const label = place(tool, ctx, { x: 100, y: 100 }, { x: 100, y: 100 })
    tool.onDown?.(ctx, { x: 185, y: 25 }, at(label))
    tool.onUp?.(ctx, { x: 185, y: 25 }, at(label))
    await tick()
    expect(label.isEditing).toBe(true)
    expect(commit).not.toHaveBeenCalled()
    tool.cancel?.(ctx)
  })

  it('Escape commits the text, also when the text box has lost focus', async () => {
    const { ctx, commit, tool } = setup()
    const label = place(tool, ctx, { x: 100, y: 100 }, { x: 100, y: 100 })
    label.set({ text: 'Pass' })
    expect(tool.onKey?.(ctx, new KeyboardEvent('keydown', { key: 'Escape' }))).toBe(true)
    await tick()
    expect(commit).toHaveBeenCalledTimes(1)
    expect(tool.onKey?.(ctx, new KeyboardEvent('keydown', { key: 'Escape' }))).toBe(false)
  })

  it('cancel while typing exits editing and leaves nothing behind', async () => {
    const { ctx, canvas, commit, tool } = setup()
    const label = place(tool, ctx, { x: 100, y: 100 }, { x: 100, y: 100 })
    label.set({ text: 'Pass' })
    tool.cancel?.(ctx)
    expect(label.isEditing).toBe(false)
    expect(document.querySelectorAll('textarea')).toHaveLength(0)
    await tick()
    expect(commit).not.toHaveBeenCalled()
    expect(canvas.getObjects()).toEqual([])
    expect(tool.isBusy?.()).toBe(false)
  })

  it('cancel mid-drag removes the preview', () => {
    const { ctx, canvas, tool } = setup()
    tool.onDown?.(ctx, { x: 100, y: 100 }, at())
    tool.onMove?.(ctx, { x: 200, y: 50 }, at())
    expect(canvas.getObjects().length).toBeGreaterThan(0)
    tool.cancel?.(ctx)
    expect(canvas.getObjects()).toEqual([])
    expect(tool.isBusy?.()).toBe(false)
  })

  it('cancel after the canvas is disposed does not throw', async () => {
    const canvas = new fabric.Canvas(document.createElement('canvas'), { width: 600, height: 400 })
    const { ctx, commit, tool } = setup(canvas)
    place(tool, ctx, { x: 100, y: 100 }, { x: 100, y: 100 }).set({ text: 'Pass' })
    canvas.dispose()
    expect(() => tool.cancel?.(ctx)).not.toThrow()
    await tick()
    expect(commit).not.toHaveBeenCalled()
    expect(tool.isBusy?.()).toBe(false)
  })
})
