import { fabric } from '@/lib/fabric'
import { useDrawingStore } from '@/stores/drawingStore'
import type { AnnotationStyle } from '@/utils/annotationStyle'
import { calloutParts as calloutPieces, labelOrigin } from '@/utils/calloutGeometry'
import { buildCallout, wrapCalloutText } from './calloutTool'
import type { ToolPoint } from './types'

const LABEL_PROPS = ['fontSize', 'fontFamily', 'fontWeight', 'fontStyle', 'underline', 'linethrough', 'textAlign', 'lineHeight', 'charSpacing', 'fill'] as const

/** The dot centre and a detached copy of the label in canvas coordinates (group position and scale applied); null when `group` is not a callout. */
export function calloutParts(group: fabric.Group): { target: ToolPoint; label: fabric.IText; color: string; strokeWidth: number } | null {
  const pieces = calloutPieces(group)
  if (!pieces || pieces.dot.type !== 'circle' || !(pieces.label instanceof fabric.IText)) return null
  const source = pieces.label
  const dot = fabric.util.qrDecompose(pieces.dot.calcTransformMatrix())
  const placed = fabric.util.qrDecompose(source.calcTransformMatrix())
  const groupScale = fabric.util.qrDecompose(group.calcTransformMatrix())
  const target = { x: dot.translateX, y: dot.translateY }
  const props: Record<string, unknown> = {}
  LABEL_PROPS.forEach((key) => { props[key] = source[key] })

  // Upright, at the label's centre, then pinned by the corner nearest the dot so further typing grows away from it.
  const label = new fabric.IText(source.text ?? '', {
    ...props,
    styles: JSON.parse(JSON.stringify(source.styles ?? {})),
    textPlate: true,
    originX: 'center',
    originY: 'center',
    left: placed.translateX,
    top: placed.translateY,
    scaleX: Math.abs(placed.scaleX),
    scaleY: Math.abs(placed.scaleY),
    angle: 0,
  } as fabric.ITextOptions)
  const centre = new fabric.Point(placed.translateX, placed.translateY)
  const origin = labelOrigin(target, centre)
  const corner = label.translateToOriginPoint(centre, origin.originX, origin.originY)
  label.set({ ...origin, left: corner.x, top: corner.y })
  label.setCoords()

  const scale = Math.sqrt(Math.abs(groupScale.scaleX * groupScale.scaleY))
  return {
    target,
    label,
    color: typeof pieces.dot.fill === 'string' ? pieces.dot.fill : '#ffffff',
    strokeWidth: (pieces.leader.strokeWidth ?? 1) * scale,
  }
}

/** The style the callout was drawn in, read back from its leader's shadow (see shadowForStyle). */
function styleOf(group: fabric.Group): AnnotationStyle {
  const shadow = calloutPieces(group)?.leader.shadow
  if (!shadow) return 'clean'
  const color = typeof shadow === 'string' ? shadow : shadow.color
  return color === 'rgba(0,0,0,0.85)' ? 'outline' : 'glow'
}

interface CalloutEdit {
  finish(): void
  cancel(): void
}

let current: CalloutEdit | null = null

/** True from the start of an edit until its text has been put back on the canvas. */
export function isCalloutEditing(): boolean {
  return current !== null
}

/** Ends the edit in progress now, keeping what was typed (a play, a seek away or a tool switch). */
export function finishCalloutEdit(): void {
  current?.finish()
}

/** Drops the edit in progress without touching the annotation (an undo/redo or project load is replacing the canvas). */
export function cancelCalloutEdit(): void {
  current?.cancel()
}

const isLive = (canvas: fabric.Canvas) => Boolean(canvas.getContext())

/** Opens the label of callout `annotationId` for typing over the hidden callout; true when an edit started. */
export function beginCalloutEdit(canvas: fabric.Canvas, annotationId: string): boolean {
  if (current || !isLive(canvas)) return false
  const annotation = useDrawingStore.getState().annotations.find((a) => a.id === annotationId)
  if (!annotation || annotation.toolType !== 'callout' || !(annotation.object instanceof fabric.Group)) return false
  const group = annotation.object
  if (!canvas.getObjects().includes(group)) return false
  const parts = calloutParts(group)
  if (!parts) return false

  const { target, label: text, color, strokeWidth } = parts
  const before = text.text ?? ''
  const wasVisible = group.visible
  const style = styleOf(group)

  const close = () => {
    current = null
    text.off('editing:exited', onExited)
    if (text.isEditing) {
      if (!isLive(canvas)) text.canvas = undefined
      text.exitEditing()
    }
    if (isLive(canvas)) canvas.remove(text)
    group.visible = wasVisible
  }

  const finish = () => {
    if (current !== edit) return
    close()
    const state = useDrawingStore.getState()
    const live = state.annotations.find((a) => a.id === annotationId)
    if (!live || live.object !== group || !isLive(canvas)) return
    const typed = text.text ?? ''
    if (typed === before) {
      canvas.requestRenderAll()
      return
    }
    if (typed.trim() === '') {
      state.removeAnnotations([annotationId])
      return
    }
    // The undo step is taken while the old group is still the annotation's object.
    state.saveState()
    text.set({ text: wrapCalloutText(text, canvas) })
    const rebuilt = buildCallout({ target, label: text, color, strokeWidth, style })
    rebuilt.set({ visible: group.visible, opacity: group.opacity, selectable: group.selectable, evented: group.evented })
    ;(rebuilt as fabric.Object & { replayAnnotationId?: string }).replayAnnotationId = annotationId
    const index = canvas.getObjects().indexOf(group)
    canvas.remove(group)
    canvas.insertAt(rebuilt, index, false)
    useDrawingStore.getState().updateAnnotation(annotationId, { object: rebuilt })
    canvas.requestRenderAll()
  }

  // Fabric ends editing inside the mouse-down that deselects the text; finish once that press has been handled.
  function onExited() {
    queueMicrotask(finish)
  }

  const edit: CalloutEdit = {
    finish,
    cancel() {
      if (current !== edit) return
      close()
      if (isLive(canvas)) canvas.requestRenderAll()
    },
  }
  current = edit

  canvas.discardActiveObject()
  group.visible = false
  canvas.add(text)
  canvas.setActiveObject(text)
  text.on('editing:exited', onExited)
  text.enterEditing()
  text.selectAll()
  canvas.requestRenderAll()
  return true
}
