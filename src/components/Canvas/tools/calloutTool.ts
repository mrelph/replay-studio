import { fabric } from '@/lib/fabric'
import { restyleObject, type AnnotationStyle } from '@/utils/annotationStyle'
import { textFormatProps } from '@/utils/textFormat'
import { calloutDotRadius, labelOrigin, labelPosition, leaderEnd, plateBox } from '@/utils/calloutGeometry'
import type { CanvasTool, ToolContext, ToolPoint } from './types'

export interface CalloutOptions {
  target: ToolPoint
  /** The typed label, not yet in a group, in canvas coordinates. */
  label: fabric.IText
  color: string
  strokeWidth: number
  style: AnnotationStyle
}

function dotAt(target: ToolPoint, color: string, strokeWidth: number): fabric.Circle {
  return new fabric.Circle({
    left: target.x,
    top: target.y,
    originX: 'center',
    originY: 'center',
    radius: calloutDotRadius(strokeWidth),
    fill: color,
    strokeWidth: 0,
  })
}

/** A callout: a dot on the target, a leader to the nearest edge of the label's plate, and the plated label. */
export function buildCallout({ target, label, color, strokeWidth, style }: CalloutOptions): fabric.Group {
  const center = label.getCenterPoint()
  const width = (label.width ?? 0) * (label.scaleX ?? 1)
  const height = (label.height ?? 0) * (label.scaleY ?? 1)
  const textBox = { left: center.x - width / 2, top: center.y - height / 2, width, height }
  const end = leaderEnd(target, plateBox(textBox, (label.fontSize ?? 24) * (label.scaleY ?? 1)))
  const leader = new fabric.Line([target.x, target.y, end.x, end.y], {
    stroke: color,
    strokeWidth,
    strokeLineCap: 'round',
  })
  label.set({ textPlate: true } as Partial<fabric.IText>)
  const callout = new fabric.Group([dotAt(target, color, strokeWidth), leader, label], { objectCaching: false })
  restyleObject(callout, 'callout', style)
  return callout
}

/** Preview objects are never picked, saved or snapshotted. */
const PREVIEW_PROPS = { selectable: false, evented: false, excludeFromExport: true }

/** A disposed Fabric canvas has no drawing context; touching its objects would schedule a render that throws. */
const isLive = (canvas: fabric.Canvas) => Boolean(canvas.getContext())

export function createCalloutTool(): CanvasTool {
  let target: ToolPoint | null = null
  let canvas: fabric.Canvas | null = null
  let preview: fabric.Object[] = []
  let label: fabric.IText | null = null
  // The context the label was opened with; DrawingCanvas's reads colour, width and style live, so the finish uses the current ones.
  let labelCtx: ToolContext | null = null

  const removePreview = () => {
    if (canvas && isLive(canvas) && preview.length > 0) {
      const target = canvas
      preview.forEach((object) => target.remove(object))
      target.requestRenderAll()
    }
    preview = []
  }

  const showPreview = (ctx: ToolContext, pointer: ToolPoint) => {
    removePreview()
    if (!target || !canvas || !isLive(canvas)) return
    const objects: fabric.Object[] = [dotAt(target, ctx.color, ctx.strokeWidth)]
    if (pointer.x !== target.x || pointer.y !== target.y) {
      objects.push(new fabric.Line([target.x, target.y, pointer.x, pointer.y], {
        stroke: ctx.color,
        strokeWidth: ctx.strokeWidth,
        strokeLineCap: 'round',
      }))
    }
    const into = canvas
    preview = objects
    preview.forEach((object) => {
      object.set(PREVIEW_PROPS)
      into.add(object)
    })
    into.requestRenderAll()
  }

  /** Drops the label without committing it. Exits editing first so Fabric's hidden textarea and caret go with it. */
  const dropLabel = () => {
    if (!label) return
    const text = label
    label = null
    labelCtx = null
    text.off('editing:exited', onExited)
    if (canvas && isLive(canvas)) {
      if (text.isEditing) text.exitEditing()
      canvas.remove(text)
      canvas.requestRenderAll()
    } else if (text.isEditing) {
      // Without a canvas, exitEditing only tidies the text itself (no caret clearing on a dead context).
      text.canvas = undefined
      text.exitEditing()
    }
  }

  const reset = () => {
    removePreview()
    dropLabel()
    target = null
    canvas = null
  }

  /**
   * The typed text is done. Fabric ends editing while it deselects, inside the
   * same mouse-down that would otherwise start the next callout, so the
   * callout is finished on the next microtask; until then the tool stays busy
   * (DrawingCanvas keeps the frame time and the swallowed press starts nothing).
   */
  function onExited() {
    queueMicrotask(finish)
  }

  const finish = () => {
    if (!label || !labelCtx || !target || !canvas) return
    const text = label
    const ctx = labelCtx
    const point = target
    text.off('editing:exited', onExited)
    if (isLive(canvas)) {
      canvas.remove(text)
      canvas.requestRenderAll()
    }
    label = null
    labelCtx = null
    target = null
    canvas = null
    if (!text.text || text.text.trim() === '') return
    text.set({ fill: ctx.color })
    ctx.commit(buildCallout({ target: point, label: text, color: ctx.color, strokeWidth: ctx.strokeWidth, style: ctx.style }), 'callout')
  }

  return {
    onDown(ctx, p, e) {
      if (label) {
        // A press on the label moves the caret; any other press ends the typing.
        if (label.isEditing && e.target !== label) label.exitEditing()
        return
      }
      if (canvas && canvas !== ctx.canvas) reset()
      removePreview()
      target = { x: p.x, y: p.y }
      canvas = ctx.canvas
      showPreview(ctx, p)
    },
    onMove(ctx, p) {
      if (!target || label || canvas !== ctx.canvas) return
      showPreview(ctx, p)
    },
    onUp(ctx, p) {
      if (!target || label || !canvas || canvas !== ctx.canvas) return
      removePreview()
      if (!isLive(canvas)) {
        reset()
        return
      }
      const at = labelPosition(target, p)
      const text = new fabric.IText('', {
        left: at.x,
        top: at.y,
        ...labelOrigin(target, at),
        ...textFormatProps(ctx.textFormat),
        textPlate: true,
        fill: ctx.color,
      } as fabric.ITextOptions)
      label = text
      labelCtx = ctx
      canvas.add(text)
      canvas.setActiveObject(text)
      text.on('editing:exited', onExited)
      text.enterEditing()
      canvas.requestRenderAll()
    },
    onKey(_ctx, e) {
      // Fabric handles Escape itself while its text box has focus; this is for when the focus has moved on.
      if (e.key !== 'Escape' || !target) return false
      if (label?.isEditing) label.exitEditing()
      else if (!label) reset()
      return true
    },
    cancel() {
      reset()
    },
    onToolSwitch() {
      // Picking another tool (Select, to move it) keeps what was typed; anything else is abandoned.
      if (!label || !label.text || label.text.trim() === '' || !canvas || !isLive(canvas)) {
        reset()
        return
      }
      label.off('editing:exited', onExited)
      if (label.isEditing) label.exitEditing()
      finish()
    },
    isBusy() {
      return target !== null
    },
  }
}

export const calloutTool = createCalloutTool()
