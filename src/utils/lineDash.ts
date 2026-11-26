import { fabric } from '@/lib/fabric'
// reveal.ts imports this module too; the cycle is safe because neither uses the other at load time.
import { stripReveal } from '@/export/reveal'

export type LineDash = 'solid' | 'dashed'

/** Tools whose drawings can be dashed. The pen's strokes arrive as 'path'. */
export const DASH_TOOL_TYPES: ReadonlySet<string> = new Set(['pen', 'path', 'line', 'arrow', 'arc-arrow'])

/** Every dashable tool draws its solid stroke with round caps. */
const SOLID_LINE_CAP = 'round'

export function dashPattern(strokeWidth: number): [number, number] {
  return [3 * strokeWidth, 2 * strokeWidth]
}

/** The object that carries the stroke: the shaft of an arrow group, else the object itself. */
export function strokeTarget(object: fabric.Object, toolType: string): fabric.Object {
  if ((toolType === 'arrow' || toolType === 'arc-arrow') && object instanceof fabric.Group) {
    const items = object.getObjects()
    if (items.length === 2) return items[0]
  }
  return object
}

/** Sets or clears strokeDashArray, strokeLineCap ('butt' when dashed, the tool's usual cap when solid) and strokeUniform on the stroke target. */
export function applyDash(object: fabric.Object, toolType: string, dashed: boolean): void {
  if (!DASH_TOOL_TYPES.has(toolType)) return
  const target = strokeTarget(object, toolType)
  if (dashed) {
    target.set({ strokeDashArray: dashPattern(target.strokeWidth ?? 1), strokeLineCap: 'butt', strokeUniform: true })
  } else {
    target.set({ strokeDashArray: undefined, strokeLineCap: SOLID_LINE_CAP, strokeUniform: false })
  }
  target.dirty = true
  if (target !== object) object.dirty = true
}

/** Dash array showing `pattern` along the first fraction×length and nothing after. Even length; last entry (a gap) ≥ length. */
export function revealDashArray(pattern: [number, number], length: number, fraction: number): number[] {
  const [dash, gap] = pattern
  // Round away float noise (0.53 × 100 = 53.000000000000007) so whole cycles come out exact.
  let remaining = Math.round(Math.max(0, Math.min(1, fraction)) * length * 1e6) / 1e6
  const entries: number[] = []
  if (dash > 0 || gap > 0) {
    while (remaining > 0) {
      const shown = Math.min(dash, remaining)
      entries.push(shown)
      remaining -= shown
      if (remaining <= 0) break
      const hidden = Math.min(gap, remaining)
      entries.push(hidden)
      remaining -= hidden
    }
  }
  if (entries.length === 0) return [0, length]
  if (entries.length % 2 === 1) entries.push(length)
  else entries[entries.length - 1] += length
  return entries
}

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
