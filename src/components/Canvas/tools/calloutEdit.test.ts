import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest'
import { fabric } from '@/lib/fabric'
import { useDrawingStore, type Annotation } from '@/stores/drawingStore'
import { annotationStateAt } from '@/export/annotationTiming'
import type { AnnotationStyle } from '@/utils/annotationStyle'
import { calloutDotRadius, calloutParts as calloutPieces } from '@/utils/calloutGeometry'
import { buildCallout } from './calloutTool'
import { beginCalloutEdit, calloutParts, editingCalloutObject, finishCalloutEdit } from './calloutEdit'

const canvases: Array<InstanceType<typeof fabric.Canvas>> = []
function testCanvas() {
  const canvas = new fabric.Canvas(document.createElement('canvas'), { width: 600, height: 400 })
  canvases.push(canvas)
  return canvas
}
afterEach(() => {
  finishCalloutEdit()
  canvases.splice(0).forEach((canvas) => canvas.dispose())
  useDrawingStore.setState({ canvas: null, annotations: [], undoStack: [], redoStack: [], isRestoring: false, selectedAnnotationId: null })
})

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

const tick = () => Promise.resolve()
const store = () => useDrawingStore.getState()
const TARGET = { x: 100, y: 300 }

interface Look { color?: string; strokeWidth?: number; style?: AnnotationStyle }

function callout(text = 'Pass', { color = '#ff0000', strokeWidth = 4, style = 'outline' }: Look = {}) {
  const label = new fabric.IText(text, { left: 300, top: 100, originX: 'left', originY: 'bottom', fontSize: 24, fill: color })
  return buildCallout({ target: TARGET, label, color, strokeWidth, style })
}

function setup(text = 'Pass', look?: Look) {
  const canvas = testCanvas()
  useDrawingStore.setState({ canvas, annotations: [], undoStack: [], redoStack: [], isRestoring: false, selectedAnnotationId: null })
  const before = new fabric.Rect({ left: 0, top: 0, width: 10, height: 10 })
  const after = new fabric.Rect({ left: 20, top: 0, width: 10, height: 10 })
  const group = callout(text, look)
  store().addAnnotation({ id: 'r1', object: before, startTime: 0, endTime: 5, layer: 1, toolType: 'rectangle' } as Annotation, { history: false })
  store().addAnnotation({ id: 'c1', object: group, startTime: 1.25, endTime: 2.75, layer: 2, toolType: 'callout' } as Annotation, { history: false })
  store().addAnnotation({ id: 'r2', object: after, startTime: 0, endTime: 5, layer: 1, toolType: 'rectangle' } as Annotation, { history: false })
  return { canvas, group }
}

const annotation = (id = 'c1') => store().annotations.find((a) => a.id === id)
const editing = (canvas: fabric.Canvas) => canvas.getActiveObject() as fabric.IText
const dotCentre = (group: fabric.Group) =>
  fabric.util.transformPoint(calloutPieces(group)!.dot.getCenterPoint(), group.calcTransformMatrix())
const labelCentre = (group: fabric.Group) =>
  fabric.util.transformPoint(calloutPieces(group)!.label.getCenterPoint(), group.calcTransformMatrix())
const screenDotRadius = (group: fabric.Group) => {
  const { scaleX, scaleY } = fabric.util.qrDecompose(calloutPieces(group)!.dot.calcTransformMatrix())
  return ((calloutPieces(group)!.dot as fabric.Circle).radius ?? 0) * Math.sqrt(Math.abs(scaleX * scaleY))
}
const rebuiltParts = () => calloutPieces(annotation()!.object)!
const changeTo = (canvas: fabric.Canvas, text: string) => {
  editing(canvas).set({ text })
  finishCalloutEdit()
}

describe('calloutParts', () => {
  it('returns the dot centre and the label text in canvas coordinates, following the group', () => {
    const group = callout('PP unit')
    const parts = calloutParts(group)!
    expect(parts.target.x).toBeCloseTo(TARGET.x, 0)
    expect(parts.target.y).toBeCloseTo(TARGET.y, 0)
    expect(Math.abs(parts.target.x - TARGET.x)).toBeLessThanOrEqual(0.5)
    expect(Math.abs(parts.target.y - TARGET.y)).toBeLessThanOrEqual(0.5)
    expect(parts.label.text).toBe('PP unit')
    expect(parts.label.group).toBeUndefined()
    expect(parts.color).toBe('#ff0000')
    expect(parts.strokeWidth).toBe(4)

    group.set({ left: (group.left ?? 0) + 50 })
    const moved = calloutParts(group)!
    expect(moved.target.x - parts.target.x).toBeCloseTo(50)
    expect(moved.target.y).toBeCloseTo(parts.target.y)
  })

  it('applies the group scale to the label and the width', () => {
    const group = callout()
    const parts = calloutParts(group)!
    group.set({ scaleX: 2, scaleY: 2 })
    const scaled = calloutParts(group)!
    expect(scaled.label.scaleX).toBeCloseTo(2)
    expect(scaled.strokeWidth).toBeCloseTo(8)
    // The group's origin is its top-left corner, which a scale leaves in place.
    const left = group.left ?? 0
    const top = group.top ?? 0
    expect(scaled.target.x - left).toBeCloseTo(2 * (parts.target.x - left))
    expect(scaled.target.y - top).toBeCloseTo(2 * (parts.target.y - top))
  })

  it('is null for something that is not a callout', () => {
    expect(calloutParts(new fabric.Group([new fabric.Rect({ width: 5, height: 5 })]))).toBeNull()
  })
})

describe('beginCalloutEdit', () => {
  it('returns false and changes nothing for an id that is not a callout', () => {
    const { canvas } = setup()
    const objects = canvas.getObjects().slice()
    expect(beginCalloutEdit(canvas, 'r1')).toBe(false)
    expect(beginCalloutEdit(canvas, 'missing')).toBe(false)
    expect(canvas.getObjects()).toEqual(objects)
    expect(store().undoStack).toHaveLength(0)
    expect(canvas.getActiveObject()).toBeFalsy()
  })

  it('hides the callout and shows exactly one editing text with all of it selected', () => {
    const { canvas, group } = setup('PP unit')
    expect(beginCalloutEdit(canvas, 'c1')).toBe(true)
    expect(group.visible).toBe(false)
    const texts = canvas.getObjects().filter((o) => o instanceof fabric.IText && (o as fabric.IText).isEditing)
    expect(texts).toHaveLength(1)
    const text = texts[0] as fabric.IText
    expect(text.text).toBe('PP unit')
    expect(text.selectionStart).toBe(0)
    expect(text.selectionEnd).toBe(7)
    expect(canvas.getActiveObject()).toBe(text)
  })

  it('a changed text rebuilds the callout in place as one undo step', async () => {
    const { canvas, group } = setup('Pass')
    const dot = dotCentre(group)
    beginCalloutEdit(canvas, 'c1')
    const text = editing(canvas)
    text.set({ text: 'Through ball' })
    text.exitEditing()
    await tick()

    const edited = annotation()!
    expect(edited).toMatchObject({ id: 'c1', startTime: 1.25, endTime: 2.75, layer: 2, toolType: 'callout' })
    expect(edited.object).not.toBe(group)
    const rebuilt = edited.object as fabric.Group
    expect((calloutPieces(rebuilt)!.label as fabric.IText).text).toBe('Through ball')
    expect(rebuilt.objectCaching).toBe(false)
    const newDot = dotCentre(rebuilt)
    expect(newDot.x).toBeCloseTo(dot.x)
    expect(newDot.y).toBeCloseTo(dot.y)
    expect(canvas.getObjects()).toHaveLength(3)
    expect(canvas.getObjects()[1]).toBe(rebuilt)
    expect(canvas.getObjects()).not.toContain(group)
    expect(canvas.getObjects()).not.toContain(text)
    expect(store().undoStack).toHaveLength(1)

    store().undo()
    const restored = annotation()!
    expect((calloutPieces(restored.object)!.label as fabric.IText).text).toBe('Pass')
    expect(restored.object.visible).not.toBe(false)
    store().redo()
    expect((calloutPieces(annotation()!.object)!.label as fabric.IText).text).toBe('Through ball')
  })

  it('an unchanged text puts the original callout back with no undo step', async () => {
    const { canvas, group } = setup()
    beginCalloutEdit(canvas, 'c1')
    const text = editing(canvas)
    text.exitEditing()
    await tick()
    expect(annotation()!.object).toBe(group)
    expect(group.visible).toBe(true)
    expect(canvas.getObjects()).not.toContain(text)
    expect(canvas.getObjects()).toHaveLength(3)
    expect(store().undoStack).toHaveLength(0)
  })

  it('a cleared text deletes the callout as one undo step that brings back the old text', async () => {
    const { canvas } = setup('Pass')
    beginCalloutEdit(canvas, 'c1')
    const text = editing(canvas)
    text.set({ text: '  ' })
    text.exitEditing()
    await tick()
    expect(annotation()).toBeUndefined()
    expect(canvas.getObjects()).toHaveLength(2)
    expect(store().undoStack).toHaveLength(1)

    store().undo()
    const restored = annotation()!
    expect(restored).toBeDefined()
    expect((calloutPieces(restored.object)!.label as fabric.IText).text).toBe('Pass')
    expect(restored.object.visible).not.toBe(false)
  })

  it('a rotated callout keeps its dot and comes back upright', async () => {
    const { canvas, group } = setup('Pass')
    group.rotate(30)
    const dot = dotCentre(group)
    beginCalloutEdit(canvas, 'c1')
    editing(canvas).set({ text: 'Press' })
    finishCalloutEdit()
    const rebuilt = annotation()!.object as fabric.Group
    expect(rebuilt.angle ?? 0).toBe(0)
    expect(dotCentre(rebuilt).x).toBeCloseTo(dot.x)
    expect(dotCentre(rebuilt).y).toBeCloseTo(dot.y)
  })

  it.each([
    ['clean', undefined],
    ['glow', '#00ff00'],
  ] as const)('a changed %s callout keeps its style, colour and width', (style, shadowColor) => {
    const { canvas } = setup('Pass', { color: '#00ff00', strokeWidth: 6, style })
    beginCalloutEdit(canvas, 'c1')
    changeTo(canvas, 'Press')
    const { dot, leader, label } = rebuiltParts()
    expect(dot.fill).toBe('#00ff00')
    expect((dot as fabric.Circle).radius).toBe(calloutDotRadius(6))
    expect(leader.stroke).toBe('#00ff00')
    expect(leader.strokeWidth).toBe(6)
    expect(label.fill).toBe('#00ff00')
    expect(label.shadow).toBeFalsy()
    if (shadowColor === undefined) {
      expect(leader.shadow).toBeFalsy()
      expect(dot.shadow).toBeFalsy()
    } else {
      expect((leader.shadow as fabric.Shadow).color).toBe(shadowColor)
      expect((dot.shadow as fabric.Shadow).color).toBe(shadowColor)
    }
  })

  it('a scaled callout keeps its dot centre, its on-screen dot size and its label centre', () => {
    const { canvas, group } = setup('Pass', { strokeWidth: 1 })
    group.set({ scaleX: 2, scaleY: 2 })
    const dot = dotCentre(group)
    const label = labelCentre(group)
    expect(screenDotRadius(group)).toBeCloseTo(2 * calloutDotRadius(1))
    beginCalloutEdit(canvas, 'c1')
    // Same length, so the same width: the label's centre must not move.
    changeTo(canvas, 'Pask')
    const rebuilt = annotation()!.object as fabric.Group
    expect(screenDotRadius(rebuilt)).toBeCloseTo(2 * calloutDotRadius(1))
    expect(dotCentre(rebuilt).x).toBeCloseTo(dot.x)
    expect(dotCentre(rebuilt).y).toBeCloseTo(dot.y)
    expect(labelCentre(rebuilt).x).toBeCloseTo(label.x)
    expect(labelCentre(rebuilt).y).toBeCloseTo(label.y)
    expect(rebuiltParts().leader.strokeWidth).toBeCloseTo(2)
  })

  it('leaves the hidden callout to the edit, then applies the visibility rule as it stands at the end', async () => {
    const { canvas, group } = setup('Pass')
    const now = 1.5
    const stateAt = (a: Annotation) => annotationStateAt(a, now, undefined)
    expect(beginCalloutEdit(canvas, 'c1', { stateAt })).toBe(true)
    expect(editingCalloutObject()).toBe(group)
    // The callout is moved off the current frame on the timeline while its text is open.
    store().updateAnnotation('c1', { startTime: 3, endTime: 4 })
    editing(canvas).exitEditing()
    await tick()
    expect(editingCalloutObject()).toBeNull()
    expect(annotation()!.object).toBe(group)
    expect(group.visible).toBe(false)
  })

  it('a changed callout comes back selected when it was selected', () => {
    const { canvas, group } = setup('Pass')
    canvas.setActiveObject(group)
    beginCalloutEdit(canvas, 'c1')
    changeTo(canvas, 'Press')
    expect(canvas.getActiveObject()).toBe(annotation()!.object)
  })

  it('a changed callout is not re-selected when playback or a tool switch ended the edit', () => {
    const { canvas, group } = setup('Pass')
    canvas.setActiveObject(group)
    beginCalloutEdit(canvas, 'c1')
    editing(canvas).set({ text: 'Press' })
    finishCalloutEdit({ select: false })
    expect(annotation()!.object).not.toBe(group)
    expect(canvas.getActiveObject()).toBeFalsy()
  })

  it('an unselected callout is not selected by its edit', () => {
    const { canvas } = setup('Pass')
    beginCalloutEdit(canvas, 'c1')
    changeTo(canvas, 'Press')
    expect(canvas.getActiveObject()).toBeFalsy()
  })

  it('a failure while opening the text puts the callout back and starts no edit', () => {
    const { canvas, group } = setup('Pass')
    const add = canvas.add.bind(canvas)
    canvas.add = () => { throw new Error('boom') }
    expect(beginCalloutEdit(canvas, 'c1')).toBe(false)
    canvas.add = add
    expect(group.visible).toBe(true)
    expect(editingCalloutObject()).toBeNull()
    expect(canvas.getObjects()).toHaveLength(3)
    expect(store().undoStack).toHaveLength(0)
    expect(beginCalloutEdit(canvas, 'c1')).toBe(true)
  })

  it('wraps a long edited label', async () => {
    const { canvas } = setup('Pass')
    beginCalloutEdit(canvas, 'c1')
    const text = editing(canvas)
    const typed = Array.from({ length: 200 }, (_, i) => `word${i}`).join(' ')
    text.set({ text: typed })
    text.exitEditing()
    await tick()
    const label = calloutPieces(annotation()!.object)!.label as fabric.IText
    expect(label.text).toContain('\n')
    expect(label.text?.replace(/\n/g, ' ')).toBe(typed)
  })

  it('finishCalloutEdit ends the edit at once, as a click elsewhere would', () => {
    const { canvas } = setup('Pass')
    beginCalloutEdit(canvas, 'c1')
    editing(canvas).set({ text: 'Run' })
    finishCalloutEdit()
    expect((calloutPieces(annotation()!.object)!.label as fabric.IText).text).toBe('Run')
    expect(store().undoStack).toHaveLength(1)
    expect(canvas.getObjects().some((o) => (o as fabric.IText).isEditing)).toBe(false)
  })
})
