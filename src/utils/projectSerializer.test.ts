import { describe, it, expect } from 'vitest'
import {
  exportProjectToJSON,
  importProjectFromJSON,
  serializeFabricObject,
  deserializeFabricObject,
  serializeProject,
  type ProjectData,
  type SerializedAnnotation,
} from './projectSerializer'
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

  it('serializeProject writes version 1.2 and a deep-copied clips array', () => {
    const clips = [makeClip()]
    const project = serializeProject([], '/videos/test.mp4', null, null, 'Test', clips)

    expect(project.version).toBe('1.2')
    expect(project.clips).toEqual(clips)
    // Deep copy: mutating the input must not reach the serialized project.
    clips[0].name = 'Mutated'
    expect(project.clips?.[0].name).toBe('First half')
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

  // Current behavior: an unrecognized `type` falls through to the `default`
  // branch of deserializeFabricObject, which always returns a plain 50x50
  // rect regardless of the original shape's dimensions. This is documented
  // here rather than changed, since fixing it is out of scope for this pass.
  it('falls back to a default 50x50 rect for an unknown type', () => {
    const data: SerializedAnnotation['fabricData'] = {
      type: 'star', // not handled by deserializeFabricObject
      left: 7,
      top: 8,
      width: 999,
      height: 999,
    }

    const restored = deserializeFabricObject(fabric, data)
    expect(restored.type).toBe('rect')
    expect(restored.width).toBe(50)
    expect(restored.height).toBe(50)
  })
})
