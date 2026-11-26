import { describe, it, expect } from 'vitest'
import {
  exportProjectToJSON,
  importProjectFromJSON,
  serializeFabricObject,
  deserializeFabricObject,
  serializeProject,
  hasProjectContent,
  type ProjectData,
  type SerializedAnnotation,
} from './projectSerializer'
import { applyReveal } from '@/export/reveal'
import { buildRing } from '@/components/Canvas/tools/ringTool'
import { buildCallout } from '@/components/Canvas/tools/calloutTool'
import { buildZone } from '@/components/Canvas/tools/zoneTool'
import { calloutParts } from './calloutGeometry'
import { surfaceParts } from './surfaceShape'
import type { Clip } from '@/types/clip'
import { CLIP_COLORS } from '@/stores/clipStore'

// Import fabric the same way the app does (see src/components/Canvas/DrawingCanvas.tsx).
import { fabric } from '@/lib/fabric'
// jsdom ships no real <canvas> 2D rendering (the optional native `canvas`
// package isn't built in this environment), so HTMLCanvasElement#getContext
// returns null. Fabric's text objects (IText, and Group when it contains
// one) call into canvas measurement APIs (e.g. measureText) during
// construction to compute their dimensions, which throws on a null context.
// We only need construction to succeed, not real rendering, so this test
// file stubs getContext with a permissive proxy: property reads/writes are
// just stored, and any unknown method call is a no-op returning sane
// defaults for the handful of calls fabric makes (mainly measureText).
// This does not touch src/ and is scoped to this test file only.
function createMockContext2D() {
  const store: Record<string, unknown> = {}
  return new Proxy(store, {
    get(target, prop: string) {
      if (prop in target) return target[prop]
      if (prop === 'measureText') {
        return (text: string) => ({ width: (text?.length || 0) * 8 })
      }
      if (prop === 'canvas') return { width: 0, height: 0 }
      if (prop === 'getContextAttributes') return () => ({})
      return () => undefined
    },
    set(target, prop: string, value) {
      target[prop] = value
      return true
    },
  })
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(HTMLCanvasElement.prototype as any).getContext = () => createMockContext2D()

function makeAnnotation(overrides: Partial<SerializedAnnotation> = {}): SerializedAnnotation {
  return {
    id: 'ann-1',
    type: 'rect',
    startTime: 0,
    endTime: 1,
    layer: 0,
    toolType: 'rectangle',
    fabricData: {
      type: 'rect',
      left: 10,
      top: 20,
      width: 100,
      height: 50,
      fill: '#FF3B30',
      stroke: '#FF3B30',
      strokeWidth: 4,
    },
    ...overrides,
  }
}

function makeProject(annotations: SerializedAnnotation[]): ProjectData {
  return {
    version: '1.0.0',
    name: 'Test Project',
    createdAt: '2024-01-01T00:00:00.000Z',
    modifiedAt: '2024-01-01T00:00:00.000Z',
    videoPath: '/videos/test.mp4',
    inPoint: 1.5,
    outPoint: 9.25,
    annotations,
  }
}

describe('exportProjectToJSON / importProjectFromJSON', () => {
  it('round-trips a ProjectData with multiple annotations', () => {
    const annotations = [
      makeAnnotation({ id: 'a1', type: 'rect' }),
      makeAnnotation({
        id: 'a2',
        type: 'line',
        toolType: 'line',
        fabricData: {
          type: 'line',
          left: 0,
          top: 0,
          x1: 0,
          y1: 0,
          x2: 100,
          y2: 100,
          stroke: '#007AFF',
          strokeWidth: 2,
        },
      }),
      makeAnnotation({
        id: 'a3',
        type: 'i-text',
        toolType: 'text',
        name: 'Caption',
        fadeIn: 0.5,
        fadeOut: 0.5,
        fabricData: {
          type: 'i-text',
          left: 5,
          top: 5,
          text: 'Hello',
          fontSize: 24,
          fontFamily: 'Inter',
        },
      }),
    ]
    const project = makeProject(annotations)

    const json = exportProjectToJSON(project)
    const imported = importProjectFromJSON(json)

    expect(imported).toEqual(project)
    expect(imported.annotations).toHaveLength(3)
  })

  it('rejects malformed input with no version', () => {
    const bad = JSON.stringify({ annotations: [] })
    expect(() => importProjectFromJSON(bad)).toThrow('Invalid project file format')
  })

  it('rejects malformed input where annotations is not an array', () => {
    const bad = JSON.stringify({ version: '1.0.0', annotations: 'not-an-array' })
    expect(() => importProjectFromJSON(bad)).toThrow('Invalid project file format')
  })

  it('rejects invalid JSON entirely', () => {
    expect(() => importProjectFromJSON('{not json')).toThrow('Failed to parse project file')
  })
})

describe('clips round-trip and validation', () => {
  function makeClip(overrides: Partial<Clip> = {}): Clip {
    return {
      id: 'clip-1',
      name: 'First half',
      start: 1,
      end: 10,
      color: '#3b82f6',
      tags: [],
      notes: '',
      ...overrides,
    }
  }

  it('serializeProject writes version 1.4 and a deep-copied clips array', () => {
    const clips = [makeClip()]
    const project = serializeProject([], '/videos/test.mp4', null, null, 'Test', clips)

    expect(project.version).toBe('1.4')
    expect(project.clips).toEqual(clips)
    // Deep copy: mutating the input must not reach the serialized project.
    clips[0].name = 'Mutated'
    expect(project.clips?.[0].name).toBe('First half')
  })

  it('round-trips speed regions and loads files without them', () => {
    const speedRegions = [{ id: 'a', start: 2, end: 4, speed: 0.5 }, { id: 'b', start: 6, end: 8, speed: 2 }]
    const project = serializeProject([], '/videos/test.mp4', null, null, 'Test', [], speedRegions)
    expect(project.version).toBe('1.4')
    expect(importProjectFromJSON(exportProjectToJSON(project)).speedRegions).toEqual(speedRegions)

    const old = JSON.stringify({ version: '1.2', annotations: [], clips: [] })
    expect(importProjectFromJSON(old).speedRegions).toBeUndefined()
    expect(importProjectFromJSON(JSON.stringify({ version: '1.3', annotations: [], speedRegions: 'x' })).speedRegions).toEqual([])
  })

  it('does not save mid-reveal dash state', () => {
    const line = new fabric.Line([0, 0, 100, 0], { stroke: '#f00' })
    const annotation = { id: 'a', object: line, startTime: 0, endTime: 1, layer: 0, toolType: 'line' }
    const before = serializeProject([annotation], '/v.mp4', null, null, 'T').annotations[0].fabricData
    applyReveal(line, 'line', 0.4)
    const after = serializeProject([annotation], '/v.mp4', null, null, 'T').annotations[0].fabricData
    expect(after).toEqual(before)
    expect((after as Record<string, unknown>).strokeDashArray).toBeUndefined()
  })

  it('round-trips a project with clips through JSON', () => {
    const clips = [makeClip({ id: 'a' }), makeClip({ id: 'b', name: 'Second half', start: 10, end: 20, color: '#22c55e' })]
    const project = serializeProject([], '/videos/test.mp4', null, null, 'Test', clips)

    const imported = importProjectFromJSON(exportProjectToJSON(project))
    expect(imported.clips).toEqual(clips)
  })

  it('loads a legacy project file with no clips field at all', () => {
    const legacy = JSON.stringify({
      version: '1.0.0',
      name: 'Legacy',
      createdAt: '2024-01-01T00:00:00.000Z',
      modifiedAt: '2024-01-01T00:00:00.000Z',
      inPoint: null,
      outPoint: null,
      annotations: [],
    })

    const imported = importProjectFromJSON(legacy)
    expect(imported.clips).toBeUndefined()
    // Call sites treat a missing clips field as an empty list.
    expect(imported.clips ?? []).toEqual([])
  })

  it('drops malformed clip entries and repairs missing fields', () => {
    const raw = JSON.stringify({
      version: '1.1',
      name: 'Test',
      createdAt: '2024-01-01T00:00:00.000Z',
      modifiedAt: '2024-01-01T00:00:00.000Z',
      inPoint: null,
      outPoint: null,
      annotations: [],
      clips: [
        // Valid but missing id/name/color: should be repaired, not dropped.
        { start: 0, end: 5 },
        // Inverted/empty range: dropped.
        { id: 'bad-1', name: 'Bad', start: 5, end: 5, color: '#000' },
        { id: 'bad-2', name: 'Bad', start: 10, end: 2, color: '#000' },
        // Non-finite times: dropped.
        { id: 'bad-3', name: 'Bad', start: Number.NaN, end: 10, color: '#000' },
        { id: 'bad-4', name: 'Bad', start: 0, end: Infinity, color: '#000' },
        // Not an object: dropped.
        null,
        'not-a-clip',
        // Valid, fully specified: kept as-is.
        { id: 'good-1', name: 'Good clip', start: 20, end: 30, color: '#ec4899' },
      ],
    })

    const imported = importProjectFromJSON(raw)
    expect(imported.clips).toHaveLength(2)

    const [repaired, good] = imported.clips!
    expect(repaired.start).toBe(0)
    expect(repaired.end).toBe(5)
    expect(repaired.id).toBeTruthy()
    expect(repaired.name).toBe('Clip 1')
    expect(CLIP_COLORS).toContain(repaired.color)
    expect(repaired.tags).toEqual([])
    expect(repaired.notes).toBe('')

    expect(good).toEqual({
      id: 'good-1',
      name: 'Good clip',
      start: 20,
      end: 30,
      color: '#ec4899',
      tags: [],
      notes: '',
    })
  })

  it('defaults tags/notes for a legacy 1.1 clip that has neither field', () => {
    const legacy = JSON.stringify({
      version: '1.1',
      name: 'Legacy clip file',
      createdAt: '2024-01-01T00:00:00.000Z',
      modifiedAt: '2024-01-01T00:00:00.000Z',
      inPoint: null,
      outPoint: null,
      annotations: [],
      clips: [{ id: 'c1', name: 'Old clip', start: 0, end: 5, color: '#3b82f6' }],
    })

    const imported = importProjectFromJSON(legacy)
    expect(imported.clips).toEqual([
      { id: 'c1', name: 'Old clip', start: 0, end: 5, color: '#3b82f6', tags: [], notes: '' },
    ])
  })

  it('round-trips clips with tags and notes through JSON', () => {
    const clips = [makeClip({ tags: ['Offense', 'PP'], notes: 'Watch the breakout' })]
    const project = serializeProject([], '/videos/test.mp4', null, null, 'Test', clips)

    const imported = importProjectFromJSON(exportProjectToJSON(project))
    expect(imported.clips).toEqual(clips)
  })

  it('drops non-string tags and normalizes the rest on load', () => {
    const raw = JSON.stringify({
      version: '1.2',
      name: 'Test',
      createdAt: '2024-01-01T00:00:00.000Z',
      modifiedAt: '2024-01-01T00:00:00.000Z',
      inPoint: null,
      outPoint: null,
      annotations: [],
      clips: [
        {
          id: 'c1',
          name: 'Clip',
          start: 0,
          end: 5,
          color: '#000',
          // Non-string entries dropped; whitespace collapsed; case-insensitive
          // dedupe keeps the first casing; length capped at 24.
          tags: ['  Offense   Set  ', 42, 'offense set', null, 'a'.repeat(40)],
          notes: 123,
        },
      ],
    })

    const imported = importProjectFromJSON(raw)
    expect(imported.clips).toHaveLength(1)
    const [clip] = imported.clips!
    expect(clip.tags).toEqual(['Offense Set', 'a'.repeat(24)])
    expect(clip.notes).toBe('')
  })
})

describe('drawIn persistence', () => {
  it('round-trips drawIn through serializeProject and JSON', () => {
    const object = new fabric.Rect({ left: 1, top: 2, width: 10, height: 10 })
    const project = serializeProject(
      [{ id: 'a1', object, startTime: 0, endTime: 2, layer: 0, toolType: 'arrow', drawIn: 0.35 }],
      '/videos/test.mp4', null, null, 'Test'
    )

    const imported = importProjectFromJSON(exportProjectToJSON(project))
    expect(imported.annotations[0].drawIn).toBe(0.35)
  })

  it('loads an annotation saved without drawIn as undefined', () => {
    const project = makeProject([makeAnnotation()])
    const imported = importProjectFromJSON(exportProjectToJSON(project))
    expect(imported.annotations[0].drawIn).toBeUndefined()
  })
})

describe('revealDelay and freezeAuto persistence', () => {
  it('round-trips revealDelay and freezeAuto through serializeProject and JSON', () => {
    const object = new fabric.Rect({ left: 1, top: 2, width: 10, height: 10 })
    const project = serializeProject(
      [
        { id: 'a1', object, startTime: 0, endTime: 2, layer: 0, toolType: 'arrow', revealDelay: 0.35 },
        { id: 'm1', object, startTime: 1, endTime: 3, layer: 0, toolType: 'arrow', freezeAuto: true, freezeDuration: 1.7 },
      ],
      '/videos/test.mp4', null, null, 'Test'
    )

    const imported = importProjectFromJSON(exportProjectToJSON(project))
    expect(imported.annotations[0].revealDelay).toBe(0.35)
    expect(imported.annotations[1].freezeAuto).toBe(true)
    expect(imported.annotations[1].freezeDuration).toBe(1.7)
  })

  it('loads an annotation saved without either field as undefined', () => {
    const project = makeProject([makeAnnotation()])
    const imported = importProjectFromJSON(exportProjectToJSON(project))
    expect(imported.annotations[0].revealDelay).toBeUndefined()
    expect(imported.annotations[0].freezeAuto).toBeUndefined()
  })
})

describe('serializeFabricObject / deserializeFabricObject round-trip (real fabric objects)', () => {
  it('round-trips a rect', () => {
    const rect = new fabric.Rect({
      left: 10,
      top: 20,
      width: 100,
      height: 50,
      fill: '#FF3B30',
      stroke: '#FF3B30',
      strokeWidth: 4,
      angle: 15,
      scaleX: 2,
      scaleY: 1.5,
      opacity: 0.8,
    })

    const data = serializeFabricObject(rect)
    expect(data.type).toBe('rect')
    expect(data.width).toBe(100)
    expect(data.height).toBe(50)

    const restored = deserializeFabricObject(fabric, data)
    expect(restored.type).toBe('rect')
    expect(restored.left).toBe(10)
    expect(restored.top).toBe(20)
    expect(restored.width).toBe(100)
    expect(restored.height).toBe(50)
    expect(restored.angle).toBe(15)
    expect(restored.scaleX).toBe(2)
    expect(restored.scaleY).toBe(1.5)
  })

  it('round-trips a line', () => {
    const line = new fabric.Line([1, 2, 3, 4], {
      stroke: '#007AFF',
      strokeWidth: 2,
    })

    const data = serializeFabricObject(line)
    expect(data.type).toBe('line')
    expect(data.x1).toBe(1)
    expect(data.y1).toBe(2)
    expect(data.x2).toBe(3)
    expect(data.y2).toBe(4)

    const restored = deserializeFabricObject(fabric, data)
    expect(restored.type).toBe('line')
    expect(restored.x1).toBe(1)
    expect(restored.y1).toBe(2)
    expect(restored.x2).toBe(3)
    expect(restored.y2).toBe(4)
  })

  it('round-trips a path', () => {
    const path = new fabric.Path('M 0 0 L 100 100', {
      stroke: '#34C759',
      strokeWidth: 6,
    })

    const data = serializeFabricObject(path)
    expect(data.type).toBe('path')
    expect(data.path).toBeDefined()

    const restored = deserializeFabricObject(fabric, data)
    expect(restored.type).toBe('path')
    // fabric normalizes the path command array; just verify it constructed
    // something with a comparable number of path commands.
    const originalCommands = path.path
    const restoredCommands = (restored as fabric.Path).path
    expect(originalCommands).toBeDefined()
    expect(restoredCommands).toBeDefined()
    expect(restoredCommands?.length).toBe(originalCommands?.length)
  })

  it('round-trips an i-text', () => {
    const text = new fabric.IText('Hello world', {
      left: 5,
      top: 5,
      fontSize: 24,
      fontFamily: 'Inter',
    })

    const data = serializeFabricObject(text)
    expect(data.type).toBe('i-text')
    expect(data.text).toBe('Hello world')
    expect(data.fontSize).toBe(24)

    const restored = deserializeFabricObject(fabric, data)
    expect(restored.type).toBe('i-text')
    expect(restored.text).toBe('Hello world')
    expect(restored.fontSize).toBe(24)
    expect(restored.fontFamily).toBe('Inter')
  })

  it('round-trips text formatting', () => {
    const text = new fabric.IText('Hello', {
      fontSize: 48, fontFamily: 'Inter', fontWeight: 'bold', fontStyle: 'italic', underline: true,
    })
    ;(text as fabric.IText & { textPlate?: boolean }).textPlate = true

    const restored = deserializeFabricObject(fabric, serializeFabricObject(text))
    expect(restored.fontSize).toBe(48)
    expect(restored.fontWeight).toBe('bold')
    expect(restored.fontStyle).toBe('italic')
    expect(restored.underline).toBe(true)
    expect(restored.textPlate).toBe(true)
    // Undo snapshots and export clones use toObject rather than the project serializer.
    expect(text.toObject().textPlate).toBe(true)
  })

  it('loads text saved before formatting existed as plain', () => {
    const restored = deserializeFabricObject(fabric, {
      type: 'i-text', left: 0, top: 0, text: 'Old', fontSize: 24, fontFamily: 'Arial',
    })
    expect(restored.fontWeight).toBe('normal')
    expect(restored.fontStyle).toBe('normal')
    expect(restored.underline).toBe(false)
    expect(restored.textPlate).toBe(false)
  })

  it('round-trips a group', () => {
    const rect = new fabric.Rect({ left: 0, top: 0, width: 20, height: 20, fill: '#FFCC00' })
    const line = new fabric.Line([0, 0, 20, 20], { stroke: '#FFCC00' })
    const group = new fabric.Group([rect, line], { left: 30, top: 40 })

    const data = serializeFabricObject(group)
    expect(data.type).toBe('group')
    expect(data.objects).toHaveLength(2)
    expect(data.objects?.[0].type).toBe('rect')
    expect(data.objects?.[1].type).toBe('line')

    const restored = deserializeFabricObject(fabric, data)
    expect(restored.type).toBe('group')
    expect(restored._objects).toHaveLength(2)
  })

  // An unrecognized `type` yields null so the loader skips and counts it.
  it('returns null for an unknown type (no placeholder rect)', () => {
    const data: SerializedAnnotation['fabricData'] = {
      type: 'star', // not handled by deserializeFabricObject
      left: 7,
      top: 8,
      width: 999,
      height: 999,
    }

    const restored = deserializeFabricObject(fabric, data)
    expect(restored).toBeNull()
  })
})

describe('shadow persistence', () => {
  it('round-trips an outline line', () => {
    const line = new fabric.Line([0, 0, 10, 0], { stroke: '#FFCC00', shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.85)', blur: 3, offsetX: 0, offsetY: 0 }) })
    const restored = deserializeFabricObject(fabric, serializeFabricObject(line))
    expect(restored.shadow).toMatchObject({ color: 'rgba(0,0,0,0.85)', blur: 3 })
  })

  it('round-trips a clean line with no shadow', () => {
    const line = new fabric.Line([0, 0, 10, 0], { stroke: '#FFCC00' })
    const data = serializeFabricObject(line)
    expect(data.shadow).toBeNull()
    expect(deserializeFabricObject(fabric, data).shadow).toBeFalsy()
  })

  it('round-trips both parts of an arrow group', () => {
    const shaft = new fabric.Line([0, 0, 10, 0], { stroke: '#f00', shadow: new fabric.Shadow({ color: 'rgba(0,0,0,0.85)', blur: 3 }) })
    const head = new fabric.Triangle({ fill: '#f00', stroke: '#f00', shadow: new fabric.Shadow({ color: '#f00', blur: 15 }) })
    const restored = deserializeFabricObject(fabric, serializeFabricObject(new fabric.Group([shaft, head])))
    const [s, h] = restored.getObjects()
    expect(s.shadow).toMatchObject({ color: 'rgba(0,0,0,0.85)', blur: 3 })
    expect(h.shadow).toMatchObject({ color: '#f00', blur: 15 })
  })

  it('keeps the legacy glow when the file has no shadow key', () => {
    const data = serializeFabricObject(new fabric.Line([0, 0, 10, 0], { stroke: '#FFCC00' }))
    delete data.shadow
    expect(deserializeFabricObject(fabric, data).shadow).toMatchObject({ color: '#FFCC00', blur: 12 })
  })
})

describe('hasProjectContent', () => {
  it('is true when there are annotations, speed regions or clips, and false for an empty project', () => {
    expect(hasProjectContent({ annotations: 0, speedRegions: 0, clips: 0 })).toBe(false)
    expect(hasProjectContent({ annotations: 1, speedRegions: 0, clips: 0 })).toBe(true)
    expect(hasProjectContent({ annotations: 0, speedRegions: 1, clips: 0 })).toBe(true)
    expect(hasProjectContent({ annotations: 0, speedRegions: 0, clips: 2 })).toBe(true)
  })
})

describe('save/load foundations (1.4)', () => {
  const roundTrip = (object: fabric.Object, extra: Partial<Parameters<typeof serializeProject>[0][number]> = {}) => {
    const project = serializeProject(
      [{ id: 'a', object, startTime: 0, endTime: 2, layer: 0, toolType: 'arrow', ...extra }],
      '/v.mp4', null, null, 'T'
    )
    return importProjectFromJSON(exportProjectToJSON(project)).annotations[0]
  }

  it('keeps an arrowhead anchor, position and rotation through save and load', () => {
    const line = new fabric.Line([0, 0, 120, 80], { stroke: '#f00', strokeWidth: 4 })
    const head = new fabric.Triangle({
      left: 120, top: 80, width: 20, height: 24, angle: 37, originX: 'center', originY: 'bottom',
    })
    const group = new fabric.Group([line, head], {})
    const saved = roundTrip(group)
    const loaded = deserializeFabricObject(fabric, saved.fabricData) as fabric.Group
    const before = group.getObjects()[1]
    const after = loaded.getObjects()[1]
    expect(after.originX).toBe('center')
    expect(after.originY).toBe('bottom')
    expect(after.left).toBeCloseTo(before.left as number)
    expect(after.top).toBeCloseTo(before.top as number)
    expect(after.angle).toBe(37)
  })

  it('round-trips strokeLineCap and defaults when the keys are absent', () => {
    const round = new fabric.Line([0, 0, 10, 10], { stroke: '#f00', strokeWidth: 4, strokeLineCap: 'round' })
    const saved = roundTrip(round)
    expect(deserializeFabricObject(fabric, saved.fabricData).strokeLineCap).toBe('round')

    const plain = serializeFabricObject(new fabric.Rect({ width: 10, height: 10 }))
    expect(plain).not.toHaveProperty('originX')
    expect(plain).not.toHaveProperty('strokeLineCap')
    const fresh = new fabric.Rect({})
    const loaded = deserializeFabricObject(fabric, plain)
    expect(loaded.originX).toBe(fresh.originX)
    expect(loaded.originY).toBe(fresh.originY)
    expect(loaded.strokeLineCap).toBe(fresh.strokeLineCap)
  })

  it('round-trips a zone outline\'s round corner joins and defaults when the key is absent', () => {
    const zone = buildZone({ points: [{ x: 10, y: 10 }, { x: 200, y: 20 }, { x: 60, y: 30 }], color: '#ff0000', strokeWidth: 4, style: 'outline' })
    const saved = roundTrip(zone, { toolType: 'zone' })
    const loaded = deserializeFabricObject(fabric, saved.fabricData) as fabric.Group
    expect(loaded.getObjects()[1].strokeLineJoin).toBe('round')

    const plain = serializeFabricObject(new fabric.Rect({ width: 10, height: 10 }))
    expect(plain).not.toHaveProperty('strokeLineJoin')
    expect(deserializeFabricObject(fabric, plain).strokeLineJoin).toBe(new fabric.Rect({}).strokeLineJoin)
  })

  it('round-trips dashed and loads older files without it', () => {
    const object = new fabric.Rect({ width: 10, height: 10 })
    expect(roundTrip(object, { dashed: true }).dashed).toBe(true)
    const old = JSON.stringify({ version: '1.3', annotations: [makeAnnotation()] })
    expect(importProjectFromJSON(old).annotations[0].dashed).toBeUndefined()
  })

  it('returns null for a group with an unknown child, no children or no objects', () => {
    const rect = { type: 'rect', left: 0, top: 0, width: 5, height: 5 }
    const unknown = { type: 'polygon', left: 0, top: 0 }
    expect(deserializeFabricObject(fabric, { type: 'group', left: 0, top: 0, objects: [rect, unknown] })).toBeNull()
    expect(deserializeFabricObject(fabric, { type: 'group', left: 0, top: 0, objects: [unknown] })).toBeNull()
    expect(deserializeFabricObject(fabric, { type: 'group', left: 0, top: 0, objects: [] })).toBeNull()
    expect(deserializeFabricObject(fabric, { type: 'group', left: 0, top: 0 })).toBeNull()
    expect(deserializeFabricObject(fabric, { type: 'group', left: 0, top: 0, objects: [rect, rect] })).not.toBeNull()
  })

  it('returns null for an unknown type', () => {
    expect(deserializeFabricObject(fabric, { type: 'polygon', left: 0, top: 0 })).toBeNull()
  })

  it('round-trips a callout: dot, leader and plated label', () => {
    const label = new fabric.IText('Pass', { left: 300, top: 100, fontSize: 24, fill: '#ffcc00' })
    const callout = buildCallout({ target: { x: 100, y: 300 }, label, color: '#ffcc00', strokeWidth: 4, style: 'outline' })
    const saved = roundTrip(callout, { toolType: 'callout' })
    const loaded = deserializeFabricObject(fabric, saved.fabricData) as fabric.Group
    expect(loaded.getObjects().map((o) => o.type)).toEqual(['circle', 'line', 'i-text'])
    const parts = calloutParts(loaded)!
    expect((parts.label as fabric.IText & { textPlate?: boolean }).textPlate).toBe(true)
    expect((parts.label as fabric.IText).text).toBe('Pass')
    expect(parts.leader.strokeLineCap).toBe('round')
    expect(parts.dot.fill).toBe('#ffcc00')
    expect(parts.label.shadow).toBeFalsy()
    expect(loaded.getCenterPoint().x).toBeCloseTo(callout.getCenterPoint().x)
    expect(loaded.getCenterPoint().y).toBeCloseTo(callout.getCenterPoint().y)
  })

  it('round-trips a ring: two centred ellipses, translucent fill, shadow on the outline only', () => {
    const ring = buildRing({ center: { x: 200, y: 150 }, rx: 50, ry: 20, color: '#ffcc00', strokeWidth: 4, style: 'outline' })
    const saved = roundTrip(ring, { toolType: 'ring' })
    expect(saved.toolType).toBe('ring')
    const loaded = deserializeFabricObject(fabric, saved.fabricData) as fabric.Group
    const parts = surfaceParts(loaded)!
    expect(loaded.getObjects()).toHaveLength(2)
    expect(parts.fill.fill).toBe('rgba(255,204,0,0.18)')
    expect(parts.outline.stroke).toBe('#ffcc00')
    for (const child of [parts.fill, parts.outline]) {
      expect(child.type).toBe('ellipse')
      expect(child.originX).toBe('center')
      expect(child.originY).toBe('center')
    }
    expect(parts.fill.shadow).toBeFalsy()
    expect(parts.outline.shadow).toBeTruthy()
    expect(loaded.getCenterPoint().x).toBeCloseTo(200)
    expect(loaded.getCenterPoint().y).toBeCloseTo(150)
  })
})
