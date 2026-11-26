import { stripReveal } from '@/export/reveal'
import { applyDash, DASH_TOOL_TYPES, type LineDash } from './lineDash'

interface DashStore {
  canvas: fabric.Canvas | null
  annotations: Array<{ id: string; object: fabric.Object; toolType: string }>
  saveState: () => void
  updateAnnotation: (id: string, updates: { dashed: boolean }) => void
}

/** Switches the selected dashable drawings to `lineDash` as one undo step. */
export function dashSelected(store: DashStore, lineDash: LineDash): void {
  const { canvas, annotations, saveState, updateAnnotation } = store
  if (!canvas) return
  const selected = new Set(canvas.getActiveObjects())
  const targets = annotations.filter((a) => selected.has(a.object) && DASH_TOOL_TYPES.has(a.toolType))
  if (targets.length === 0) return
  const dashed = lineDash === 'dashed'
  saveState()
  targets.forEach((a) => {
    // A mid-reveal drawing holds its pre-switch pattern for the reveal to restore; drop it first.
    stripReveal(a.object)
    applyDash(a.object, a.toolType, dashed)
    updateAnnotation(a.id, { dashed })
  })
  canvas.requestRenderAll()
}
