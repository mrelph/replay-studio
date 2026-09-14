import { create } from 'zustand'
import type fabricModule from 'fabric'

type fabric = typeof fabricModule

export interface Annotation {
  id: string
  object: fabric.Object
  startTime: number
  endTime: number
  layer: number
  toolType: string
  fadeIn?: number
  fadeOut?: number
  name?: string
  freezeDuration?: number  // seconds to hold video at this annotation's startTime
}

export interface Layer {
  id: number
  name: string
  visible: boolean
  locked: boolean
  color: string
}

// Serializable annotation metadata (no fabric object references)
interface AnnotationSnapshot {
  id: string
  startTime: number
  endTime: number
  layer: number
  toolType: string
  fadeIn?: number
  fadeOut?: number
  name?: string
  freezeDuration?: number
}

// A full undo/redo snapshot: annotation metadata + fabric canvas JSON
interface UndoSnapshot {
  annotations: AnnotationSnapshot[]
  canvasJSON: string
}

const ANNOTATION_ID_PROPERTY = 'replayAnnotationId'
const MAX_HISTORY_LENGTH = 50

type TaggedFabricObject = fabric.Object & {
  replayAnnotationId?: string
}

function tagObject(object: fabric.Object, annotationId: string) {
  ;(object as TaggedFabricObject).replayAnnotationId = annotationId
}

function getObjectAnnotationId(object: fabric.Object): string | undefined {
  return (object as TaggedFabricObject).replayAnnotationId
}

function uniqueAnnotationId(requestedId: string, usedIds: Set<string>): string {
  const baseId = requestedId || 'annotation'
  let candidate = baseId
  let suffix = 2

  while (usedIds.has(candidate)) {
    candidate = `${baseId}-${suffix}`
    suffix += 1
  }

  usedIds.add(candidate)
  return candidate
}

function normalizeAnnotationIds(annotations: Annotation[]): Annotation[] {
  const usedIds = new Set<string>()
  return annotations.map((annotation) => {
    const id = uniqueAnnotationId(annotation.id, usedIds)
    return id === annotation.id ? annotation : { ...annotation, id }
  })
}

function installAnnotationsOnCanvas(canvas: fabric.Canvas, annotations: Annotation[]) {
  canvas.discardActiveObject()
  canvas.getObjects().forEach((object) => canvas.remove(object))
  annotations.forEach((annotation) => {
    tagObject(annotation.object, annotation.id)
    canvas.add(annotation.object)
  })
  canvas.requestRenderAll()
}

function snapshotMetadata(annotation: Annotation): AnnotationSnapshot {
  return {
    id: annotation.id,
    startTime: annotation.startTime,
    endTime: annotation.endTime,
    layer: annotation.layer,
    toolType: annotation.toolType,
    fadeIn: annotation.fadeIn,
    fadeOut: annotation.fadeOut,
    name: annotation.name,
    freezeDuration: annotation.freezeDuration,
  }
}

/**
 * Capture only registered annotations. Drawing previews and other temporary
 * Fabric objects may already be on the canvas when an annotation is committed;
 * excluding them makes this a true pre-mutation snapshot.
 */
function createSnapshot(canvas: fabric.Canvas, annotations: Annotation[]): UndoSnapshot {
  const annotationIds = new Set(annotations.map((annotation) => annotation.id))

  annotations.forEach((annotation) => tagObject(annotation.object, annotation.id))

  const canvasData = canvas.toJSON([ANNOTATION_ID_PROPERTY]) as unknown as {
    objects?: Array<Record<string, unknown>>
    [key: string]: unknown
  }

  canvasData.objects = (canvasData.objects ?? []).filter((objectData) => {
    const annotationId = objectData[ANNOTATION_ID_PROPERTY]
    return typeof annotationId === 'string' && annotationIds.has(annotationId)
  })

  return {
    annotations: annotations.map(snapshotMetadata),
    canvasJSON: JSON.stringify(canvasData),
  }
}

function annotationsFromSnapshot(
  snapshot: UndoSnapshot,
  canvas: fabric.Canvas
): Annotation[] {
  const objectsById = new Map<string, fabric.Object>()

  canvas.getObjects().forEach((object) => {
    const annotationId = getObjectAnnotationId(object)
    if (annotationId) objectsById.set(annotationId, object)
  })

  return snapshot.annotations.flatMap((metadata) => {
    const object = objectsById.get(metadata.id)
    return object ? [{ ...metadata, object }] : []
  })
}

const LAYER_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#84cc16']

interface DrawingState {
  canvas: fabric.Canvas | null
  annotations: Annotation[]
  layers: Layer[]
  activeLayerId: number
  selectedAnnotationId: string | null
  undoStack: UndoSnapshot[]
  redoStack: UndoSnapshot[]
  isRestoring: boolean
  restoreToken: number
  pendingReplacement: Annotation[] | null

  // Canvas actions
  setCanvas: (canvas: fabric.Canvas | null) => void

  // Annotation actions
  addAnnotation: (annotation: Annotation) => void
  removeAnnotation: (id: string) => void
  removeAnnotations: (ids: string[]) => void
  replaceAnnotations: (annotations: Annotation[]) => void
  updateAnnotation: (id: string, updates: Partial<Annotation>) => void
  selectAnnotation: (id: string | null) => void
  clearAnnotations: () => void
  getVisibleAnnotations: (currentTime: number) => Annotation[]
  moveAnnotationToLayer: (annotationId: string, layerId: number) => void

  // Layer actions
  addLayer: () => void
  removeLayer: (id: number) => void
  updateLayer: (id: number, updates: Partial<Layer>) => void
  setActiveLayer: (id: number) => void
  moveLayerUp: (id: number) => void
  moveLayerDown: (id: number) => void
  getAnnotationsForLayer: (layerId: number) => Annotation[]

  // Undo/Redo
  saveState: () => void
  undo: () => void
  redo: () => void
}

export const useDrawingStore = create<DrawingState>((set, get) => ({
  canvas: null,
  annotations: [],
  layers: [
    { id: 1, name: 'Layer 1', visible: true, locked: false, color: LAYER_COLORS[0] }
  ],
  activeLayerId: 1,
  selectedAnnotationId: null,
  undoStack: [],
  redoStack: [],
  isRestoring: false,
  restoreToken: 0,
  pendingReplacement: null,

  setCanvas: (canvas) => {
    const { annotations, pendingReplacement } = get()
    const annotationsToInstall = pendingReplacement ?? annotations

    set((state) => ({
      canvas,
      isRestoring: false,
      restoreToken: state.restoreToken + 1,
      pendingReplacement: canvas ? null : state.pendingReplacement,
      ...(pendingReplacement && canvas ? {
        annotations: annotationsToInstall,
        selectedAnnotationId: null,
        undoStack: [],
        redoStack: [],
      } : {}),
    }))

    if (canvas && annotationsToInstall.length > 0) {
      installAnnotationsOnCanvas(canvas, annotationsToInstall)
    }
  },

  addAnnotation: (annotation) => {
    const { saveState, activeLayerId, canvas, isRestoring } = get()
    if (isRestoring) return

    saveState()

    // Ensure annotation is on active layer if not specified
    const ann = {
      ...annotation,
      id: uniqueAnnotationId(annotation.id, new Set(get().annotations.map((item) => item.id))),
      layer: annotation.layer || activeLayerId,
    }
    tagObject(ann.object, ann.id)

    // Some drawing tools add a live preview to Fabric before committing it.
    // Other callers can pass a detached object; support both without duplicates.
    if (canvas && !canvas.getObjects().includes(ann.object)) {
      canvas.add(ann.object)
    }

    set((state) => ({
      annotations: [...state.annotations, ann],
    }))
    canvas?.requestRenderAll()
  },

  removeAnnotation: (id) => {
    get().removeAnnotations([id])
  },

  removeAnnotations: (ids) => {
    const { annotations, saveState, canvas, isRestoring } = get()
    if (isRestoring) return

    const requestedIds = new Set(ids)
    const annotationsToRemove = annotations.filter((annotation) => requestedIds.has(annotation.id))
    if (annotationsToRemove.length === 0) return

    saveState()

    const removedIds = new Set(annotationsToRemove.map((annotation) => annotation.id))
    if (canvas) {
      const objectsToRemove = new Set(annotationsToRemove.map((annotation) => annotation.object))
      canvas.getObjects().forEach((object) => {
        const annotationId = getObjectAnnotationId(object)
        if (annotationId && removedIds.has(annotationId)) objectsToRemove.add(object)
      })

      canvas.discardActiveObject()
      objectsToRemove.forEach((object) => canvas.remove(object))
    }

    set((state) => ({
      annotations: state.annotations.filter((annotation) => !removedIds.has(annotation.id)),
      selectedAnnotationId: state.selectedAnnotationId && removedIds.has(state.selectedAnnotationId)
        ? null
        : state.selectedAnnotationId,
    }))
    canvas?.requestRenderAll()
  },

  replaceAnnotations: (annotations) => {
    const normalizedAnnotations = normalizeAnnotationIds(annotations)
    const { canvas, isRestoring } = get()

    // Fabric's loadFromJSON cannot be cancelled. Queue replacement until its
    // callback so an old restore cannot later overwrite a freshly loaded project.
    if (isRestoring) {
      set({ pendingReplacement: normalizedAnnotations })
      return
    }

    if (canvas) {
      installAnnotationsOnCanvas(canvas, normalizedAnnotations)
    } else {
      normalizedAnnotations.forEach((annotation) => tagObject(annotation.object, annotation.id))
    }

    set((state) => ({
      annotations: normalizedAnnotations,
      selectedAnnotationId: null,
      undoStack: [],
      redoStack: [],
      isRestoring: false,
      restoreToken: state.restoreToken + 1,
      pendingReplacement: null,
    }))
  },

  updateAnnotation: (id, updates) => {
    if (get().isRestoring) return
    set((state) => ({
      annotations: state.annotations.map((a) =>
        a.id === id ? { ...a, ...updates } : a
      ),
    }))
  },

  selectAnnotation: (id) => {
    const { canvas, annotations, isRestoring } = get()
    if (isRestoring) return
    set({ selectedAnnotationId: id })

    // Also select on canvas
    if (canvas && id) {
      const annotation = annotations.find(a => a.id === id)
      if (annotation) {
        canvas.setActiveObject(annotation.object)
        canvas.renderAll()
      }
    } else if (canvas) {
      canvas.discardActiveObject()
      canvas.renderAll()
    }
  },

  clearAnnotations: () => {
    const { annotations, canvas, saveState, isRestoring } = get()
    if (isRestoring) return
    if (annotations.length === 0 && (!canvas || canvas.getObjects().length === 0)) return

    saveState()

    if (canvas) {
      canvas.discardActiveObject()
      // Canvas content is annotation-only. Removing every object also cleans up
      // any orphan left behind by an older inconsistent document state.
      canvas.getObjects().forEach((object) => canvas.remove(object))
    }

    set({ annotations: [], selectedAnnotationId: null })
    canvas?.requestRenderAll()
  },

  getVisibleAnnotations: (currentTime) => {
    const { annotations, layers } = get()
    return annotations.filter((a) => {
      const layer = layers.find(l => l.id === a.layer)
      return layer?.visible && currentTime >= a.startTime && currentTime <= a.endTime
    })
  },

  moveAnnotationToLayer: (annotationId, layerId) => {
    const { saveState, isRestoring } = get()
    if (isRestoring) return
    saveState()
    set((state) => ({
      annotations: state.annotations.map((a) =>
        a.id === annotationId ? { ...a, layer: layerId } : a
      ),
    }))
  },

  // Layer actions
  addLayer: () => {
    if (get().isRestoring) return
    set((state) => {
      const nextId = Math.max(...state.layers.map(l => l.id), 0) + 1
      const colorIndex = (nextId - 1) % LAYER_COLORS.length
      return {
        layers: [
          ...state.layers,
          {
            id: nextId,
            name: `Layer ${nextId}`,
            visible: true,
            locked: false,
            color: LAYER_COLORS[colorIndex]
          }
        ],
        activeLayerId: nextId
      }
    })
  },

  removeLayer: (id) => {
    const { layers, annotations, activeLayerId, saveState, isRestoring } = get()
    if (isRestoring) return
    if (layers.length <= 1) return // Keep at least one layer

    saveState()

    // Move annotations to the first remaining layer
    const remainingLayers = layers.filter(l => l.id !== id)
    const targetLayerId = remainingLayers[0].id

    set((state) => ({
      layers: remainingLayers,
      annotations: state.annotations.map(a =>
        a.layer === id ? { ...a, layer: targetLayerId } : a
      ),
      activeLayerId: activeLayerId === id ? targetLayerId : activeLayerId
    }))
  },

  updateLayer: (id, updates) => {
    if (get().isRestoring) return
    set((state) => ({
      layers: state.layers.map((l) =>
        l.id === id ? { ...l, ...updates } : l
      ),
    }))
  },

  setActiveLayer: (id) => {
    if (get().isRestoring) return
    set({ activeLayerId: id })
  },

  moveLayerUp: (id) => {
    if (get().isRestoring) return
    set((state) => {
      const index = state.layers.findIndex(l => l.id === id)
      if (index <= 0) return state

      const newLayers = [...state.layers]
      ;[newLayers[index - 1], newLayers[index]] = [newLayers[index], newLayers[index - 1]]
      return { layers: newLayers }
    })
  },

  moveLayerDown: (id) => {
    if (get().isRestoring) return
    set((state) => {
      const index = state.layers.findIndex(l => l.id === id)
      if (index < 0 || index >= state.layers.length - 1) return state

      const newLayers = [...state.layers]
      ;[newLayers[index], newLayers[index + 1]] = [newLayers[index + 1], newLayers[index]]
      return { layers: newLayers }
    })
  },

  getAnnotationsForLayer: (layerId) => {
    const { annotations } = get()
    return annotations.filter(a => a.layer === layerId)
  },

  saveState: () => {
    const { annotations, canvas, isRestoring } = get()
    if (!canvas || isRestoring) return

    const snapshot = createSnapshot(canvas, annotations)
    set((state) => ({
      undoStack: [...state.undoStack, snapshot].slice(-MAX_HISTORY_LENGTH),
      redoStack: [],
    }))
  },

  undo: () => {
    const { undoStack, redoStack, annotations, canvas, isRestoring, restoreToken } = get()
    if (undoStack.length === 0 || !canvas || isRestoring) return

    const currentSnapshot = createSnapshot(canvas, annotations)

    const previousSnapshot = undoStack[undoStack.length - 1]
    const token = restoreToken + 1

    canvas.discardActiveObject()
    set({
      selectedAnnotationId: null,
      isRestoring: true,
      restoreToken: token,
    })

    try {
      canvas.loadFromJSON(JSON.parse(previousSnapshot.canvasJSON), () => {
        const state = get()
        if (state.canvas !== canvas || state.restoreToken !== token) return
        const pendingReplacement = state.pendingReplacement

        set({
          undoStack: undoStack.slice(0, -1),
          redoStack: [...redoStack, currentSnapshot].slice(-MAX_HISTORY_LENGTH),
          annotations: annotationsFromSnapshot(previousSnapshot, canvas),
          isRestoring: false,
          pendingReplacement: null,
        })
        canvas.requestRenderAll()
        if (pendingReplacement) get().replaceAnnotations(pendingReplacement)
      })
    } catch {
      // Restore the history stacks if Fabric rejects a malformed snapshot.
      const state = get()
      if (state.canvas === canvas && state.restoreToken === token) {
        const pendingReplacement = state.pendingReplacement
        set({
          isRestoring: false,
          restoreToken: token + 1,
          pendingReplacement: null,
        })
        if (pendingReplacement) get().replaceAnnotations(pendingReplacement)
      }
    }
  },

  redo: () => {
    const { redoStack, undoStack, annotations, canvas, isRestoring, restoreToken } = get()
    if (redoStack.length === 0 || !canvas || isRestoring) return

    const currentSnapshot = createSnapshot(canvas, annotations)

    const nextSnapshot = redoStack[redoStack.length - 1]
    const token = restoreToken + 1

    canvas.discardActiveObject()
    set({
      selectedAnnotationId: null,
      isRestoring: true,
      restoreToken: token,
    })

    try {
      canvas.loadFromJSON(JSON.parse(nextSnapshot.canvasJSON), () => {
        const state = get()
        if (state.canvas !== canvas || state.restoreToken !== token) return
        const pendingReplacement = state.pendingReplacement

        set({
          redoStack: redoStack.slice(0, -1),
          undoStack: [...undoStack, currentSnapshot].slice(-MAX_HISTORY_LENGTH),
          annotations: annotationsFromSnapshot(nextSnapshot, canvas),
          isRestoring: false,
          pendingReplacement: null,
        })
        canvas.requestRenderAll()
        if (pendingReplacement) get().replaceAnnotations(pendingReplacement)
      })
    } catch {
      const state = get()
      if (state.canvas === canvas && state.restoreToken === token) {
        const pendingReplacement = state.pendingReplacement
        set({
          isRestoring: false,
          restoreToken: token + 1,
          pendingReplacement: null,
        })
        if (pendingReplacement) get().replaceAnnotations(pendingReplacement)
      }
    }
  },
}))
