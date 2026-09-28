import { describe, it, expect } from 'vitest'
import type { fabric } from 'fabric'
import { buildEditableProject } from './editableCopy'
import type { Annotation } from '@/stores/drawingStore'

// serializeFabricObject only reads plain-data fields (type, left, top, ...)
// at runtime, so a minimal object shaped like a fabric.Rect is enough here
// without constructing a real Fabric canvas/object.
function fakeAnnotation(overrides: Partial<Annotation>): Annotation {
  return {
    id: 'a1',
    object: { type: 'rect', left: 0, top: 0, width: 10, height: 10 } as unknown as fabric.Object,
    startTime: 0,
    endTime: 1,
    layer: 0,
    toolType: 'rectangle',
    ...overrides,
  }
}

describe('buildEditableProject', () => {
  const clip = { start: 10, end: 20 }

  it('sets videoPath, clips: [], and null in/out points', () => {
    const project = buildEditableProject(clip, [], '/tmp/clean.mp4', 'My Clip')
    expect(project.videoPath).toBe('/tmp/clean.mp4')
    expect(project.clips).toEqual([])
    expect(project.inPoint).toBeNull()
    expect(project.outPoint).toBeNull()
    expect(project.name).toBe('My Clip')
  })

  it('drops annotations entirely outside the clip range', () => {
    const before = fakeAnnotation({ id: 'before', startTime: 5, endTime: 9.999 })
    const after = fakeAnnotation({ id: 'after', startTime: 20, endTime: 25 })
    const project = buildEditableProject(clip, [before, after], '/tmp/clean.mp4', 'Clip')
    expect(project.annotations).toHaveLength(0)
  })

  it('keeps an annotation ending exactly at clip.start (inclusive boundary)', () => {
    const boundary = fakeAnnotation({ id: 'boundary', startTime: 8, endTime: 10 })
    const project = buildEditableProject(clip, [boundary], '/tmp/clean.mp4', 'Clip')
    expect(project.annotations).toHaveLength(1)
    // Rebased by -10, then clamped into [0, 10]: startTime -2 -> 0, endTime 0 -> 0.
    expect(project.annotations[0].startTime).toBe(0)
    expect(project.annotations[0].endTime).toBe(0)
  })

  it('rebases times by -clip.start for a fully-contained annotation', () => {
    const inside = fakeAnnotation({ id: 'inside', startTime: 12, endTime: 14 })
    const project = buildEditableProject(clip, [inside], '/tmp/clean.mp4', 'Clip')
    expect(project.annotations[0].startTime).toBe(2)
    expect(project.annotations[0].endTime).toBe(4)
  })

  it('clamps an annotation that starts before the clip and ends after it', () => {
    const spanning = fakeAnnotation({ id: 'spanning', startTime: 5, endTime: 25 })
    const project = buildEditableProject(clip, [spanning], '/tmp/clean.mp4', 'Clip')
    expect(project.annotations[0].startTime).toBe(0)
    expect(project.annotations[0].endTime).toBe(10) // clip duration
  })

  it('preserves freezeDuration unchanged', () => {
    const frozen = fakeAnnotation({ id: 'frozen', startTime: 15, endTime: 16, freezeDuration: 2.5 })
    const project = buildEditableProject(clip, [frozen], '/tmp/clean.mp4', 'Clip')
    expect(project.annotations[0].freezeDuration).toBe(2.5)
  })
})
