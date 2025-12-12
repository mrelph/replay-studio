import { create } from 'zustand'
import type fabricModule from 'fabric'

type fabric = typeof fabricModule

export interface Annotation {
  id: string
  object: fabric.Object
  startTime: number
  endTime: number
  layer: number
}

interface DrawingState {
  canvas: fabric.Canvas | null
  annotations: Annotation[]
  selectedAnnotationId: string | null
  undoStack: string[]
  redoStack: string[]

  // Actions
  setCanvas: (canvas: fabric.Canvas | null) => void
  addAnnotation: (annotation: Annotation) => void
  removeAnnotation: (id: string) => void
  updateAnnotation: (id: string, updates: Partial<Annotation>) => void
  selectAnnotation: (id: string | null) => void
  clearAnnotations: () => void
  getVisibleAnnotations: (currentTime: number) => Annotation[]

  // Undo/Redo
  saveState: () => void
  undo: () => void
  redo: () => void
}

export const useDrawingStore = create<DrawingState>((set, get) => ({
  canvas: null,
  annotations: [],
  selectedAnnotationId: null,
  undoStack: [],
  redoStack: [],

  setCanvas: (canvas) => set({ canvas }),

  addAnnotation: (annotation) => {
    const { saveState } = get()
    saveState()
    set((state) => ({
      annotations: [...state.annotations, annotation],
    }))
  },

  removeAnnotation: (id) => {
    const { saveState } = get()
    saveState()
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

  selectAnnotation: (id) => set({ selectedAnnotationId: id }),

  clearAnnotations: () => {
    const { saveState } = get()
    saveState()
    set({ annotations: [], selectedAnnotationId: null })
  },

  getVisibleAnnotations: (currentTime) => {
    const { annotations } = get()
    return annotations.filter(
      (a) => currentTime >= a.startTime && currentTime <= a.endTime
    )
  },

  saveState: () => {
    const { annotations } = get()
    set((state) => ({
      undoStack: [...state.undoStack, JSON.stringify(annotations)].slice(-50),
      redoStack: [],
    }))
  },

  undo: () => {
    const { undoStack, annotations } = get()
    if (undoStack.length === 0) return

    const previousState = undoStack[undoStack.length - 1]
    set({
      undoStack: undoStack.slice(0, -1),
      redoStack: [...get().redoStack, JSON.stringify(annotations)],
      annotations: JSON.parse(previousState),
    })
  },

  redo: () => {
    const { redoStack, annotations } = get()
    if (redoStack.length === 0) return

    const nextState = redoStack[redoStack.length - 1]
    set({
      redoStack: redoStack.slice(0, -1),
      undoStack: [...get().undoStack, JSON.stringify(annotations)],
      annotations: JSON.parse(nextState),
    })
  },
}))
