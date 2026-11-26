import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest'
import { fabric } from '@/lib/fabric'
import { DEFAULT_TEXT_FORMAT } from '@/utils/textFormat'
import { createZoneTool } from './zoneTool'
import type { ToolContext } from './types'

// Fabric schedules renders on requestAnimationFrame; dispose each test canvas
// so none fires after the mocked 2D context is restored (jsdom's returns null).
const canvases: Array<InstanceType<typeof fabric.Canvas>> = []
function testCanvas() {
  const canvas = new fabric.Canvas(document.createElement('canvas'), { width: 100, height: 100 })
  canvases.push(canvas)
  return canvas
}
afterEach(() => {
  canvases.splice(0).forEach((canvas) => canvas.dispose())
})

const originalGetContext = HTMLCanvasElement.prototype.getContext
beforeAll(() => {
  const mockContext = new Proxy({} as Record<string, unknown>, {
    get(target, prop: string) {
      if (prop in target) return target[prop]
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

function setup() {
  const canvas = testCanvas()
  const commit = vi.fn()
  const ctx: ToolContext = { canvas, color: '#ff0000', strokeWidth: 4, style: 'outline', textFormat: DEFAULT_TEXT_FORMAT, commit }
  return { canvas, commit, ctx, tool: createZoneTool() }
}

const event = {} as fabric.IEvent
const key = (k: string) => new KeyboardEvent('keydown', { key: k })
const corners = [{ x: 10, y: 10 }, { x: 50, y: 10 }, { x: 50, y: 40 }]

describe('zone tool', () => {
  it('commits a two-part surface shape on Enter and leaves no preview behind', () => {
    const { canvas, commit, ctx, tool } = setup()
    expect(tool.isBusy?.()).toBe(false)
    corners.forEach((p) => {
      tool.onDown?.(ctx, p, event)
      tool.onUp?.(ctx, p, event)
      expect(tool.isBusy?.()).toBe(true)
    })
    tool.onMove?.(ctx, { x: 30, y: 60 }, event)
    expect(canvas.getObjects().length).toBeGreaterThan(0)
    expect(canvas.getObjects().every((o) => !o.selectable && !o.evented)).toBe(true)

    expect(tool.onKey?.(ctx, key('Enter'))).toBe(true)
    expect(commit).toHaveBeenCalledTimes(1)
    const [group, toolType] = commit.mock.calls[0]
    expect(toolType).toBe('zone')
    expect(group).toBeInstanceOf(fabric.Group)
    const [fill, outline] = (group as fabric.Group).getObjects()
    expect(fill.fill).toBe('rgba(255,0,0,0.25)')
    expect(outline.stroke).toBe('#ff0000')
    expect(outline.strokeWidth).toBe(4)
    expect(fill.getCenterPoint()).toEqual(outline.getCenterPoint())
    expect(canvas.getObjects()).toHaveLength(0)
    expect(tool.isBusy?.()).toBe(false)
  })

  it('cancels a finish with fewer than 3 corners', () => {
    const { canvas, commit, ctx, tool } = setup()
    corners.slice(0, 2).forEach((p) => tool.onDown?.(ctx, p, event))
    expect(tool.onKey?.(ctx, key('Enter'))).toBe(true)
    expect(commit).not.toHaveBeenCalled()
    expect(canvas.getObjects()).toHaveLength(0)
    expect(tool.isBusy?.()).toBe(false)
  })

  it('cancel removes the preview without committing', () => {
    const { canvas, commit, ctx, tool } = setup()
    corners.forEach((p) => tool.onDown?.(ctx, p, event))
    tool.cancel?.(ctx)
    expect(commit).not.toHaveBeenCalled()
    expect(canvas.getObjects()).toHaveLength(0)
    expect(tool.isBusy?.()).toBe(false)
  })

  it('finishes once on a double-click, ignoring its duplicate down, and again never on a stray double-click', () => {
    const { commit, ctx, tool } = setup()
    corners.forEach((p) => tool.onDown?.(ctx, p, event))
    tool.onDown?.(ctx, { x: 50, y: 40 }, event)
    tool.onDoubleClick?.(ctx, { x: 50, y: 40 }, event)
    expect(commit).toHaveBeenCalledTimes(1)
    expect((commit.mock.calls[0][0] as fabric.Group).getObjects()[1]).toBeInstanceOf(fabric.Path)
    tool.onDoubleClick?.(ctx, { x: 50, y: 40 }, event)
    expect(tool.onKey?.(ctx, key('Enter'))).toBe(false)
    expect(commit).toHaveBeenCalledTimes(1)
  })

  it('finishes on a click on the first corner', () => {
    const { commit, ctx, tool } = setup()
    corners.forEach((p) => tool.onDown?.(ctx, p, event))
    tool.onDown?.(ctx, { x: 12, y: 12 }, event)
    expect(commit).toHaveBeenCalledTimes(1)
    expect(tool.isBusy?.()).toBe(false)
  })

  it('Backspace removes the last corner, and removing the only corner cancels', () => {
    const { canvas, commit, ctx, tool } = setup()
    corners.slice(0, 2).forEach((p) => tool.onDown?.(ctx, p, event))
    expect(tool.onKey?.(ctx, key('Backspace'))).toBe(true)
    expect(tool.isBusy?.()).toBe(true)
    expect(tool.onKey?.(ctx, key('Backspace'))).toBe(true)
    expect(tool.isBusy?.()).toBe(false)
    expect(canvas.getObjects()).toHaveLength(0)
    expect(tool.onKey?.(ctx, key('Escape'))).toBe(false)
    expect(commit).not.toHaveBeenCalled()
  })

  it('swallows other keys only while a zone is in progress', () => {
    const { ctx, tool } = setup()
    expect(tool.onKey?.(ctx, key(' '))).toBe(false)
    tool.onDown?.(ctx, corners[0], event)
    expect(tool.onKey?.(ctx, key(' '))).toBe(true)
    expect(tool.onKey?.(ctx, key('Escape'))).toBe(true)
    expect(tool.isBusy?.()).toBe(false)
  })

  it('lets Ctrl and Cmd combinations through to the menu while a zone is in progress', () => {
    const { ctx, tool } = setup()
    corners.slice(0, 2).forEach((p) => tool.onDown?.(ctx, p, event))
    expect(tool.onKey?.(ctx, new KeyboardEvent('keydown', { key: 's', ctrlKey: true }))).toBe(false)
    expect(tool.onKey?.(ctx, new KeyboardEvent('keydown', { key: 'z', metaKey: true }))).toBe(false)
    expect(tool.onKey?.(ctx, key('s'))).toBe(true)
    expect(tool.isBusy?.()).toBe(true)
  })

  it('cancel is safe after the canvas has been disposed', () => {
    const { canvas, ctx, tool } = setup()
    corners.forEach((p) => tool.onDown?.(ctx, p, event))
    canvases.splice(canvases.indexOf(canvas), 1)
    canvas.dispose()
    expect(() => tool.cancel?.(ctx)).not.toThrow()
    expect(tool.isBusy?.()).toBe(false)
  })
})
