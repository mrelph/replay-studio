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
}

// A full undo/redo snapshot: annotation metadata + fabric canvas JSON
interface UndoSnapshot {
  annotations: AnnotationSnapshot[]
  canvasJSON: string
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

  // Canvas actions
  setCanvas: (canvas: fabric.Canvas | null) => void

  // Annotation actions
  addAnnotation: (annotation: Annotation) => void
  removeAnnotation: (id: string) => void
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

  setCanvas: (canvas) => set({ canvas }),

  addAnnotation: (annotation) => {
    const { saveState, activeLayerId } = get()
    saveState()
    // Ensure annotation is on active layer if not specified
    const ann = { ...annotation, layer: annotation.layer || activeLayerId }
    set((state) => ({
      annotations: [...state.annotations, ann],
    }))
  },

  removeAnnotation: (id) => {
    const { saveState, canvas } = get()
    saveState()
    // Also remove from canvas
    const annotation = get().annotations.find(a => a.id === id)
    if (annotation && canvas) {
      canvas.remove(annotation.object)
      canvas.renderAll()
    }
    set((state) => ({
      annotations: state.annotations.filter((a) => a.id !== id),
      selectedAnnotationId: state.selectedAnnotationId === id ? null : state.selectedAnnotationId,
    }))
  },

  updateAnnotation: (id, updates) => {
    set((state) => ({
      annotations: state.annotations.map((a) =>
        a.id === id ? { ...a, ...updates } : a
      ),
    }))
  },

  selectAnnotation: (id) => {
    const { canvas, annotations } = get()
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
    const { saveState } = get()
    saveState()
    set({ annotations: [], selectedAnnotationId: null })
  },

  getVisibleAnnotations: (currentTime) => {
    const { annotations, layers } = get()
    return annotations.filter((a) => {
      const layer = layers.find(l => l.id === a.layer)
      return layer?.visible && currentTime >= a.startTime && currentTime <= a.endTime
    })
  },

  moveAnnotationToLayer: (annotationId, layerId) => {
    const { saveState } = get()
    saveState()
    set((state) => ({
      annotations: state.annotations.map((a) =>
        a.id === annotationId ? { ...a, layer: layerId } : a
      ),
    }))
  },

  // Layer actions
  addLayer: () => {
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
    const { layers, annotations, activeLayerId, saveState } = get()
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
    set((state) => ({
      layers: state.layers.map((l) =>
        l.id === id ? { ...l, ...updates } : l
      ),
    }))
  },

  setActiveLayer: (id) => set({ activeLayerId: id }),

  moveLayerUp: (id) => {
    set((state) => {
      const index = state.layers.findIndex(l => l.id === id)
      if (index <= 0) return state

      const newLayers = [...state.layers]
      ;[newLayers[index - 1], newLayers[index]] = [newLayers[index], newLayers[index - 1]]
      return { layers: newLayers }
    })
  },

  moveLayerDown: (id) => {
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
    const { annotations, canvas } = get()
    if (!canvas) return

    const snapshot: UndoSnapshot = {
      annotations: annotations.map(a => ({
        id: a.id,
        startTime: a.startTime,
        endTime: a.endTime,
        layer: a.layer,
        toolType: a.toolType,
        fadeIn: a.fadeIn,
        fadeOut: a.fadeOut,
        name: a.name,
      })),
      canvasJSON: JSON.stringify(canvas.toJSON()),
    }
    set((state) => ({
      undoStack: [...state.undoStack, snapshot].slice(-50),
      redoStack: [],
    }))
  },

  undo: () => {
    const { undoStack, annotations, canvas } = get()
    if (undoStack.length === 0 || !canvas) return

    // Save current state to redo stack
    const currentSnapshot: UndoSnapshot = {
      annotations: annotations.map(a => ({
        id: a.id,
        startTime: a.startTime,
        endTime: a.endTime,
        layer: a.layer,
        toolType: a.toolType,
        fadeIn: a.fadeIn,
        fadeOut: a.fadeOut,
        name: a.name,
      })),
      canvasJSON: JSON.stringify(canvas.toJSON()),
    }

    const previousSnapshot = undoStack[undoStack.length - 1]

    // Restore canvas objects from the snapshot
    canvas.loadFromJSON(JSON.parse(previousSnapshot.canvasJSON), () => {
      // Rebuild annotations by pairing metadata with restored canvas objects
      const canvasObjects = canvas.getObjects()
      const restoredAnnotations: Annotation[] = previousSnapshot.annotations.map((meta, i) => ({
        ...meta,
        object: canvasObjects[i],
      })).filter(a => a.object) // Guard against mismatch

      set({
        undoStack: undoStack.slice(0, -1),
        redoStack: [...get().redoStack, currentSnapshot],
        annotations: restoredAnnotations,
        selectedAnnotationId: null,
      })
      canvas.renderAll()
    })
  },

  redo: () => {
    const { redoStack, annotations, canvas } = get()
    if (redoStack.length === 0 || !canvas) return

    // Save current state to undo stack
    const currentSnapshot: UndoSnapshot = {
      annotations: annotations.map(a => ({
        id: a.id,
        startTime: a.startTime,
        endTime: a.endTime,
        layer: a.layer,
        toolType: a.toolType,
        fadeIn: a.fadeIn,
        fadeOut: a.fadeOut,
        name: a.name,
      })),
      canvasJSON: JSON.stringify(canvas.toJSON()),
    }

    const nextSnapshot = redoStack[redoStack.length - 1]

    canvas.loadFromJSON(JSON.parse(nextSnapshot.canvasJSON), () => {
      const canvasObjects = canvas.getObjects()
      const restoredAnnotations: Annotation[] = nextSnapshot.annotations.map((meta, i) => ({
        ...meta,
        object: canvasObjects[i],
      })).filter(a => a.object)

      set({
        redoStack: redoStack.slice(0, -1),
        undoStack: [...get().undoStack, currentSnapshot],
        annotations: restoredAnnotations,
        selectedAnnotationId: null,
      })
      canvas.renderAll()
    })
  },
}))
