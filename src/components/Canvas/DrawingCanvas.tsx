import { useEffect, useRef, useState, useCallback } from 'react'
import { fabric } from '@/lib/fabric'
import { useToolStore, type ToolType } from '@/stores/toolStore'
import { useDrawingStore, type Annotation } from '@/stores/drawingStore'
import { useVideoStore } from '@/stores/videoStore'
import { useAudienceStore } from '@/stores/audienceStore'
import { PlayerTracker } from './tools/PlayerTracker'
import { getToolDefaults } from '@/utils/annotationDefaults'
import { STAY_TOOL_TYPES, stayTiming } from '@/utils/stayPreset'
import { annotationStateAt } from '@/export/annotationTiming'
import { stripReveal } from '@/export/reveal'
import { elapsedFor, useLiveReveal, useSpeedSteps } from '@/hooks/useLiveReveal'
import { shadowForStyle, arrowHeadSize } from '@/utils/annotationStyle'
import { textFormatProps } from '@/utils/textFormat'
import type { CanvasTool, ToolContext } from './tools/types'
import { ringTool } from './tools/ringTool'
import { zoneTool } from './tools/zoneTool'
import { calloutTool } from './tools/calloutTool'
import { liveToolContext as toolContext } from './tools/toolContext'
import { abandonGesture, abandonKeepsWork, type AbandonReason } from './tools/abandon'
import { beginCalloutEdit, cancelCalloutEdit, editingCalloutObject, finishCalloutEdit, isCalloutEditing } from './tools/calloutEdit'
import { frameIndexAt } from '@/utils/frames'
import { clearLaneSelectionOnCanvasSelect } from './canvasSelection'
import { applyDash, dashPattern, strokeTarget, DASH_TOOL_TYPES } from '@/utils/lineDash'

/** Tools whose pointer-down starts a new drawing, which stops the video on that frame. */
const DRAW_FRAME_TOOLS = new Set(['pen', 'line', 'arrow', 'arc-arrow', 'rectangle', 'circle', 'text', 'spotlight', 'magnifier', 'ring', 'zone', 'callout'])

/** Tools built as modules (see tools/types.ts); the mouse handlers delegate to them before the built-in switch. */
const NEW_TOOLS: Partial<Record<ToolType, CanvasTool>> = {
  ring: ringTool,
  zone: zoneTool,
  callout: calloutTool,
}

/** Abandons any module tool's gesture in progress (its preview objects go with it). */
function cancelBusyTools(canvas: fabric.Canvas) {
  Object.values(NEW_TOOLS).forEach((tool) => {
    if (tool) abandonGesture(tool, toolContext(canvas, () => {}), 'dispose', true)
  })
}

/** Fabric object carrying the magnifier id this component stamps on it. */
type MagnifierTaggedObject = fabric.Object & { magnifierId?: string }

interface DrawingCanvasProps {
  videoElement: HTMLVideoElement
}

export default function DrawingCanvas({ videoElement }: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const fabricRef = useRef<fabric.Canvas | null>(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0, offsetX: 0, offsetY: 0 })

  // Tool instances
  const playerTrackerRef = useRef<PlayerTracker | null>(null)

  // Track magnifiers for live video zoom updates
  const magnifiersRef = useRef<Map<string, { circle: fabric.Circle, centerX: number, centerY: number, radius: number }>>(new Map())

  const { currentTool, strokeColor, strokeWidth, annotationStyle, textFormat, lineDash, setIsDrawing } = useToolStore()
  const isAudienceOpen = useAudienceStore((s) => s.isAudienceOpen)
  const laserColor = useAudienceStore((s) => s.laserColor)
  const { setCanvas, addAnnotation, annotations } = useDrawingStore()
  const { currentTime, duration } = useVideoStore()

  // Reference dimensions for zoom-based scaling (set once on init)
  const refDimsRef = useRef<{ width: number; height: number } | null>(null)
  // The canvas wrapper, and the layout last applied to it (see syncToVideo).
  const wrapperRef = useRef<HTMLDivElement>(null)
  const appliedRef = useRef<{ width: number; height: number; offsetX: number; offsetY: number; refWidth: number; refHeight: number } | null>(null)

  // Track drawing state for shapes
  const isDrawingRef = useRef(false)
  const startPointRef = useRef({ x: 0, y: 0 })
  const currentShapeRef = useRef<fabric.Line | fabric.Circle | fabric.Rect | fabric.Ellipse | fabric.Group | fabric.Path | null>(null)
  const arcPointsRef = useRef<{ x: number; y: number }[]>([])
  // Frame time captured at pointer-down, stamped on the drawing when it is committed.
  const drawTimeRef = useRef<number | null>(null)

  // Calculate video display dimensions based on the actual video element position
  const calcDimensions = useCallback(() => {
    if (!videoElement || !containerRef.current) return { width: 0, height: 0, offsetX: 0, offsetY: 0 }

    const videoRect = videoElement.getBoundingClientRect()
    const containerRect = containerRef.current.getBoundingClientRect()

    return {
      width: videoRect.width,
      height: videoRect.height,
      offsetX: videoRect.left - containerRect.left,
      offsetY: videoRect.top - containerRect.top,
    }
  }, [videoElement])

  // Helper: apply zoom so that video-native coordinates map to display pixels
  const applyZoom = useCallback((canvas: fabric.Canvas, displayW: number, displayH: number) => {
    const ref = refDimsRef.current
    if (!ref) return
    const zoom = Math.min(displayW / ref.width, displayH / ref.height)
    canvas.setZoom(zoom)
    canvas.setDimensions({ width: displayW, height: displayH })
  }, [])

  // Initialize Fabric canvas once when video element is ready
  useEffect(() => {
    if (!canvasRef.current || !videoElement) return

    const dims = calcDimensions()
    if (dims.width === 0) return

    // Use video native resolution as the fixed logical coordinate space.
    // All annotations are placed in these coordinates — just like video pixels.
    const nativeW = videoElement.videoWidth || dims.width
    const nativeH = videoElement.videoHeight || dims.height
    refDimsRef.current = { width: nativeW, height: nativeH }

    const canvas = new fabric.Canvas(canvasRef.current, {
      width: dims.width,
      height: dims.height,
      selection: currentTool === 'select',
      isDrawingMode: currentTool === 'pen',
      enableRetinaScaling: true,
    })

    // Set initial zoom so native coords map to display size
    const zoom = Math.min(dims.width / nativeW, dims.height / nativeH)
    canvas.setZoom(zoom)

    fabricRef.current = canvas
    const stopClearingLanes = clearLaneSelectionOnCanvasSelect(canvas)
    setCanvas(canvas)
    setDimensions(dims)
    appliedRef.current = { ...dims, refWidth: nativeW, refHeight: nativeH }

    // Initialize tool instances
    playerTrackerRef.current = new PlayerTracker(canvas)

    return () => {
      stopClearingLanes()
      cancelCalloutEdit()
      cancelBusyTools(canvas)
      canvas.dispose()
      fabricRef.current = null
      setCanvas(null)
      playerTrackerRef.current = null
    }
  // Only re-init when the video element itself changes, not on resize
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoElement, setCanvas])

  // Keep the canvas exactly over the video. Tools store pointer positions
  // relative to the canvas's top-left (canvas.getPointer), so if the canvas
  // drifts from the video, drawings still look right on screen but are saved
  // offset by the drift, and exports (which use the true video frame) show it.
  // The video can move without resizing (a side panel opening, the window
  // being retiled, the controls row changing height), so size alone isn't
  // enough to watch: compare the full rect. Returns true if it had to move.
  const syncToVideo = useCallback((): boolean => {
    const canvas = fabricRef.current
    if (!canvas || !refDimsRef.current || !videoElement) return false

    const dims = calcDimensions()
    if (dims.width === 0) return false

    // Update ref dims if video metadata arrived after init
    if (videoElement.videoWidth && videoElement.videoHeight) {
      refDimsRef.current = { width: videoElement.videoWidth, height: videoElement.videoHeight }
    }
    const ref = refDimsRef.current
    const applied = appliedRef.current
    const close = (a: number, b: number) => Math.abs(a - b) < 0.5
    if (
      applied &&
      close(applied.width, dims.width) &&
      close(applied.height, dims.height) &&
      close(applied.offsetX, dims.offsetX) &&
      close(applied.offsetY, dims.offsetY) &&
      applied.refWidth === ref.width &&
      applied.refHeight === ref.height
    ) {
      return false
    }

    applyZoom(canvas, dims.width, dims.height)
    // Move the wrapper now rather than on React's next render, so a pointer
    // event already in flight (see the pointerdown listener) sees the new position.
    if (wrapperRef.current) {
      wrapperRef.current.style.left = `${dims.offsetX}px`
      wrapperRef.current.style.top = `${dims.offsetY}px`
    }
    appliedRef.current = { ...dims, refWidth: ref.width, refHeight: ref.height }
    setDimensions(dims)
    canvas.renderAll()
    return true
  }, [videoElement, calcDimensions, applyZoom])

  useEffect(() => {
    if (!videoElement) return

    let resizeTimer: ReturnType<typeof setTimeout>
    const scheduleSync = () => {
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(syncToVideo, 50) // Debounce resize
    }

    // Size changes of the video or of the area it's centred in (panel
    // toggles, splitter drags, window resize)...
    const ro = new ResizeObserver(scheduleSync)
    ro.observe(videoElement)
    if (containerRef.current) ro.observe(containerRef.current)
    window.addEventListener('resize', scheduleSync)
    videoElement.addEventListener('loadedmetadata', scheduleSync)
    // ...plus a cheap periodic check for moves no observer reports.
    const poll = setInterval(syncToVideo, 250)

    // And always right before a stroke starts, so its first point is stored
    // against the canvas's true position over the video. This listens for the
    // DOM pointerdown on the wrapper in the capture phase: it runs before
    // Fabric's own mousedown handling computes (and caches) the pointer.
    const wrapper = wrapperRef.current
    const syncBeforeDraw = () => {
      syncToVideo()
    }
    wrapper?.addEventListener('pointerdown', syncBeforeDraw, true)

    return () => {
      clearTimeout(resizeTimer)
      clearInterval(poll)
      ro.disconnect()
      window.removeEventListener('resize', scheduleSync)
      videoElement.removeEventListener('loadedmetadata', scheduleSync)
      wrapper?.removeEventListener('pointerdown', syncBeforeDraw, true)
    }
  }, [videoElement, syncToVideo])

  // Update canvas settings when tool changes
  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas) return

    canvas.isDrawingMode = currentTool === 'pen'
    canvas.selection = currentTool === 'select'

    // Set cursor based on active tool
    const cursorMap: Record<string, string> = {
      select: 'default',
      pen: 'crosshair',
      line: 'crosshair',
      arrow: 'crosshair',
      'arc-arrow': 'crosshair',
      rectangle: 'crosshair',
      circle: 'crosshair',
      text: 'text',
      spotlight: 'crosshair',
      magnifier: 'zoom-in',
      tracker: 'crosshair',
      laser: 'none',
      erase: 'crosshair',
      ring: 'crosshair',
      zone: 'crosshair',
      callout: 'crosshair',
    }
    const cursor = cursorMap[currentTool] || 'default'
    canvas.defaultCursor = cursor
    canvas.hoverCursor = currentTool === 'select' ? 'move' : cursor

    if (currentTool === 'pen') {
      const brush = new fabric.PencilBrush(canvas)
      brush.color = strokeColor
      brush.width = strokeWidth
      const brushShadow = shadowForStyle(annotationStyle, strokeColor)
      if (brushShadow) brush.shadow = brushShadow
      if (lineDash === 'dashed') {
        brush.strokeDashArray = dashPattern(strokeWidth)
        brush.strokeLineCap = 'butt'
      }
      canvas.freeDrawingBrush = brush
    }
  }, [currentTool, strokeColor, strokeWidth, annotationStyle, lineDash])

  // Update trackers when video time changes
  useEffect(() => {
    if (playerTrackerRef.current) {
      playerTrackerRef.current.update(currentTime)
    }
  }, [currentTime])

  // Update magnifier content from video frame
  const updateMagnifierContent = useCallback((circle: fabric.Circle) => {
    if (!videoElement || !fabricRef.current) return

    const zoomLevel = 2.5
    const canvas = fabricRef.current
    const radius = circle.radius || 60

    // Get current center from the fabric object (in video-native coords)
    const centerX = (circle.left || 0) + radius
    const centerY = (circle.top || 0) + radius

    // Create off-screen canvas for zoomed content
    const tempCanvas = document.createElement('canvas')
    const size = radius * 2
    tempCanvas.width = size
    tempCanvas.height = size
    const ctx = tempCanvas.getContext('2d')
    if (!ctx) return

    // Coordinates are in video-native space, so map directly to video pixels
    const vw = videoElement.videoWidth
    const vh = videoElement.videoHeight
    const ref = refDimsRef.current
    if (!ref || !vw || !vh) return

    const scaleX = vw / ref.width
    const scaleY = vh / ref.height

    const sourceSize = (radius * 2) / zoomLevel
    const sourceX = (centerX - sourceSize / 2) * scaleX
    const sourceY = (centerY - sourceSize / 2) * scaleY
    const sourceWidth = sourceSize * scaleX
    const sourceHeight = sourceSize * scaleY

    // Draw zoomed video portion clipped to circle
    ctx.save()
    ctx.beginPath()
    ctx.arc(radius, radius, radius - 4, 0, Math.PI * 2)
    ctx.clip()

    try {
      ctx.drawImage(
        videoElement,
        Math.max(0, sourceX),
        Math.max(0, sourceY),
        Math.min(sourceWidth, vw - Math.max(0, sourceX)),
        Math.min(sourceHeight, vh - Math.max(0, sourceY)),
        0, 0, size, size
      )
    } catch {
      // Video might not be ready
    }

    ctx.restore()

    // Draw border
    ctx.strokeStyle = '#00d4ff'
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.arc(radius, radius, radius - 2, 0, Math.PI * 2)
    ctx.stroke()

    // Draw crosshair
    ctx.strokeStyle = 'rgba(0, 212, 255, 0.6)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(radius - 15, radius)
    ctx.lineTo(radius + 15, radius)
    ctx.moveTo(radius, radius - 15)
    ctx.lineTo(radius, radius + 15)
    ctx.stroke()

    // Apply as pattern fill
    // Fabric 5 accepts a canvas element as a pattern source at runtime, but
    // @types/fabric only declares `string | HTMLImageElement` for it.
    const patternSource = tempCanvas as unknown as fabric.IPatternOptions['source']
    const pattern = new fabric.Pattern({
      source: patternSource,
      repeat: 'no-repeat',
    })

    circle.set({ fill: pattern, dirty: true })
    canvas.renderAll()
  }, [videoElement])

  // Update all magnifiers when video time changes
  useEffect(() => {
    magnifiersRef.current.forEach((mag) => {
      updateMagnifierContent(mag.circle)
    })
  }, [currentTime, updateMagnifierContent])

  const speedSteps = useSpeedSteps()
  const speedStepsRef = useRef(speedSteps)
  useEffect(() => {
    speedStepsRef.current = speedSteps
  }, [speedSteps])

  // Control annotation visibility based on current time with fade effects.
  // The rule itself lives in src/export/annotationTiming.ts, shared with the
  // clip export renderer so burned-in exports match what's shown here.
  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas) return
    // While the video plays or an automatic hold runs, useLiveReveal owns
    // visibility, opacity and reveal.
    const { autoHold } = useVideoStore.getState()
    if (!videoElement.paused || (autoHold !== null && autoHold.endedAt === null)) return

    const elapsed = elapsedFor(speedSteps)
    const editing = editingCalloutObject()
    annotations.forEach((annotation) => {
      if (annotation.object === editing) return
      const { visible, opacity } = annotationStateAt(annotation, currentTime, elapsed)
      annotation.object.visible = visible
      annotation.object.opacity = opacity
      stripReveal(annotation.object)
    })

    canvas.renderAll()
  }, [currentTime, annotations, videoElement, speedSteps])

  useLiveReveal(fabricRef, videoElement)

  // Clean up magnifier refs when annotations are removed
  useEffect(() => {
    magnifiersRef.current.forEach((_, magId) => {
      // magnifier IDs match annotation IDs via the createAnnotation call
      // Find if any annotation still references this magnifier object
      const magEntry = magnifiersRef.current.get(magId)
      if (magEntry) {
        const stillExists = annotations.some(a => a.object === magEntry.circle)
        if (!stillExists) {
          magnifiersRef.current.delete(magId)
        }
      }
    })
  }, [annotations])

  // Stop tracking any tracker whose annotation was removed (delete, erase,
  // clear, undo, or project load) so trackers don't keep running orphaned.
  const knownTrackerIdsRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    const currentTrackerIds = new Set(
      annotations.filter((a) => a.toolType === 'tracker').map((a) => a.id)
    )
    knownTrackerIdsRef.current.forEach((id) => {
      if (!currentTrackerIds.has(id)) {
        playerTrackerRef.current?.remove(id)
      }
    })
    knownTrackerIdsRef.current = currentTrackerIds
  }, [annotations])

  // Create annotation with proper time range. Returns the annotation id used,
  // so callers that need to correlate side-effects (e.g. player trackers) with
  // the annotation can register under the same id.
  const createAnnotation = useCallback((object: fabric.Object, toolType: string, id?: string) => {
    const defaults = getToolDefaults(toolType)
    const startTime = drawTimeRef.current ?? currentTime
    drawTimeRef.current = null
    const { endTime, fadeIn, fadeOut } = STAY_TOOL_TYPES.has(toolType)
      ? stayTiming(useToolStore.getState().stayPreset, startTime, duration, useVideoStore.getState().fps, defaults)
      : {
          endTime: duration > 0 ? Math.min(startTime + defaults.duration, duration) : startTime + defaults.duration,
          fadeIn: defaults.fadeIn,
          fadeOut: defaults.fadeOut,
        }
    const annotationId = id || `${toolType}-${Date.now()}`
    const dashed = DASH_TOOL_TYPES.has(toolType) ? useToolStore.getState().lineDash === 'dashed' : undefined
    // A preview dashed before D switched back to solid mid-drag is cleared too.
    if (dashed || (dashed === false && strokeTarget(object, toolType).strokeDashArray)) applyDash(object, toolType, dashed)

    addAnnotation({
      id: annotationId,
      object,
      startTime,
      endTime,
      layer: 0,
      toolType,
      fadeIn,
      fadeOut,
      drawIn: defaults.drawIn,
      ...(dashed !== undefined ? { dashed } : {}),
    })
    // The pen's strokes arrive as 'path'; hidden tools stay out of freeze timing.
    if (toolType === 'path' || DRAW_FRAME_TOOLS.has(toolType)) {
      useDrawingStore.getState().syncFrames([startTime], { createFreeze: true })
      useVideoStore.getState().setPendingPreview(startTime)
    }

    return annotationId
  }, [addAnnotation, currentTime, duration])

  // Module tools commit through this: createAnnotation changes with every
  // currentTime change, and a key or playback handler must not hold a stale one.
  const createAnnotationRef = useRef(createAnnotation)
  useEffect(() => {
    createAnnotationRef.current = createAnnotation
  }, [createAnnotation])
  const moduleCommit = useCallback<ToolContext['commit']>((object, toolType) => {
    createAnnotationRef.current(object, toolType)
  }, [])

  // Switching away from a module tool abandons its gesture, unless the tool finishes it instead (a typed callout).
  const previousToolRef = useRef<ToolType>(currentTool)
  useEffect(() => {
    const previous = previousToolRef.current
    previousToolRef.current = currentTool
    const canvas = fabricRef.current
    if (previous === currentTool || !canvas) return
    finishCalloutEdit({ select: false })
    const tool = NEW_TOOLS[previous]
    const ctx = toolContext(canvas, moduleCommit)
    if (tool?.onToolSwitch) tool.onToolSwitch(ctx)
    else tool?.cancel?.(ctx)
  }, [currentTool, moduleCommit])

  // Keys, playback and seeks while a module tool's gesture (a zone) is in
  // progress. The key listener is on window in the capture phase, so it runs
  // before every bubble-phase shortcut listener, and stops the keys it handles.
  // Playing or seeking away finishes a typed callout on the frame it was
  // started on (drawTimeRef); everything else is dropped (see tools/abandon.ts).
  useEffect(() => {
    const active = () => {
      const canvas = fabricRef.current
      const tool = NEW_TOOLS[useToolStore.getState().currentTool]
      return canvas && tool ? { canvas, tool } : null
    }
    const abandon = (reason: AbandonReason) => {
      if (abandonKeepsWork(reason) && !useDrawingStore.getState().isRestoring) finishCalloutEdit({ select: reason !== 'play' })
      else cancelCalloutEdit()
      const current = active()
      if (!current) return
      abandonGesture(current.tool, toolContext(current.canvas, moduleCommit), reason, useDrawingStore.getState().isRestoring)
    }

    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return
      const current = active()
      if (!current?.tool.onKey) return
      if (current.tool.onKey(toolContext(current.canvas, moduleCommit), e)) {
        e.preventDefault()
        e.stopImmediatePropagation()
      }
    }
    // The first corner's frame capture seeks onto its own frame; only a move to another frame abandons.
    const handleSeeking = () => {
      const anchor = drawTimeRef.current
      const { fps } = useVideoStore.getState()
      if (anchor !== null && frameIndexAt(videoElement.currentTime, fps) === frameIndexAt(anchor, fps)) return
      abandon('seek')
      // A callout finished here asked for a preview hold on its own frame, which the playhead has just left.
      const { pendingPreview } = useVideoStore.getState()
      if (pendingPreview !== null && frameIndexAt(videoElement.currentTime, fps) !== frameIndexAt(pendingPreview, fps)) {
        useVideoStore.getState().setPendingPreview(null)
      }
    }
    const stopVideo = useVideoStore.subscribe((state, prev) => {
      if (state.isPlaying && !prev.isPlaying) abandon('play')
    })
    const stopColor = useToolStore.subscribe((state, prev) => {
      if (state.strokeColor === prev.strokeColor) return
      const current = active()
      if (current?.tool.isBusy?.()) current.tool.onColorChange?.(toolContext(current.canvas, moduleCommit))
    })
    // Undo/redo, a project load or a canvas swap clears the canvas under the preview.
    const stopDrawing = useDrawingStore.subscribe((state, prev) => {
      if ((state.isRestoring && !prev.isRestoring) || state.restoreToken !== prev.restoreToken) abandon('restore')
    })

    window.addEventListener('keydown', handleKey, true)
    videoElement.addEventListener('seeking', handleSeeking)
    return () => {
      window.removeEventListener('keydown', handleKey, true)
      videoElement.removeEventListener('seeking', handleSeeking)
      stopVideo()
      stopColor()
      stopDrawing()
    }
  }, [videoElement, moduleCommit])

  // Handle mouse events for drawing shapes
  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas) return

    // Helper: find control point for arc-arrow from tracked mouse positions
    const calculateArcControlPoint = (
      start: { x: number; y: number },
      end: { x: number; y: number },
      trackedPoints: { x: number; y: number }[]
    ) => {
      const dx = end.x - start.x
      const dy = end.y - start.y
      const len = Math.sqrt(dx * dx + dy * dy)
      if (len === 0) return { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }

      // Unit vector along start→end and its perpendicular
      const ux = dx / len
      const uy = dy / len
      const px = -uy  // perpendicular
      const py = ux

      // Find max perpendicular deviation (signed) from tracked points
      let maxDev = 0
      for (const pt of trackedPoints) {
        const relX = pt.x - start.x
        const relY = pt.y - start.y
        const dev = relX * px + relY * py  // signed perpendicular distance
        if (Math.abs(dev) > Math.abs(maxDev)) {
          maxDev = dev
        }
      }

      // Control point at midpoint of start→end, offset perpendicular by 2x max deviation
      const midX = (start.x + end.x) / 2
      const midY = (start.y + end.y) / 2
      return {
        x: midX + px * maxDev * 2,
        y: midY + py * maxDev * 2,
      }
    }

    // Erase tool state
    let erasePoints: { x: number; y: number }[] = []
    let erasePreview: fabric.Line[] = []
    let isErasing = false

    const handleMouseDown = (e: fabric.IEvent) => {
      // The press that ends a callout edit (or moves its caret) starts nothing.
      if (isCalloutEditing()) return
      // Every pointer-down with a drawing tool starts a new drawing (the pen's
      // stroke has already begun: Fabric fires this right after the brush's
      // own mouse-down), so stop the video on the exact frame now. A gesture
      // already in progress (a zone's later corners) keeps its first frame.
      const tool = NEW_TOOLS[currentTool]
      if (!tool?.isBusy?.()) {
        drawTimeRef.current = DRAW_FRAME_TOOLS.has(currentTool) ? useVideoStore.getState().captureDrawFrame() : null
      }
      if (tool) {
        tool.onDown?.(toolContext(canvas, moduleCommit), canvas.getPointer(e.e), e)
        return
      }
      if (currentTool === 'pen' || currentTool === 'select' || currentTool === 'laser') return

      // Erase tool: start collecting path
      if (currentTool === 'erase') {
        const pointer = canvas.getPointer(e.e)
        isErasing = true
        erasePoints = [{ x: pointer.x, y: pointer.y }]
        return
      }

      const pointer = canvas.getPointer(e.e)
      isDrawingRef.current = true
      startPointRef.current = { x: pointer.x, y: pointer.y }
      setIsDrawing(true)

      let shape: fabric.Line | fabric.Circle | fabric.Rect | fabric.Ellipse | fabric.Group | fabric.Path | null = null

      switch (currentTool) {
        case 'line':
          // Broadcast-style line with glow
          shape = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
            stroke: strokeColor,
            strokeWidth: Math.max(strokeWidth, 3),
            strokeLineCap: 'round',
            shadow: shadowForStyle(annotationStyle, strokeColor),
            selectable: false,
            evented: false,
          })
          break

        case 'arc-arrow': {
          // Create arc arrow preview path
          arcPointsRef.current = [{ x: pointer.x, y: pointer.y }]
          const arcPath = new fabric.Path(`M ${pointer.x} ${pointer.y} L ${pointer.x} ${pointer.y}`, {
            stroke: strokeColor,
            strokeWidth: Math.max(strokeWidth, 4),
            fill: 'transparent',
            strokeLineCap: 'round',
            shadow: shadowForStyle(annotationStyle, strokeColor, 15),
            selectable: false,
            evented: false,
          })
          shape = arcPath
          break
        }

        case 'arrow':
          // Create broadcast-style arrow with glow effect
          shape = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
            stroke: strokeColor,
            strokeWidth: Math.max(strokeWidth, 4),
            strokeLineCap: 'round',
            shadow: shadowForStyle(annotationStyle, strokeColor, 15),
            selectable: false,
            evented: false,
          })
          break

        case 'rectangle':
          // Broadcast-style rectangle with glow
          shape = new fabric.Rect({
            left: pointer.x,
            top: pointer.y,
            width: 0,
            height: 0,
            fill: 'transparent',
            stroke: strokeColor,
            strokeWidth: Math.max(strokeWidth, 3),
            shadow: shadowForStyle(annotationStyle, strokeColor, 12),
            selectable: false,
            evented: false,
          })
          break

        case 'circle':
          // Broadcast-style circle with glow
          shape = new fabric.Ellipse({
            left: pointer.x,
            top: pointer.y,
            rx: 0,
            ry: 0,
            fill: 'transparent',
            stroke: strokeColor,
            strokeWidth: Math.max(strokeWidth, 3),
            shadow: shadowForStyle(annotationStyle, strokeColor, 12),
            selectable: false,
            evented: false,
          })
          break

        case 'spotlight':
          // Create broadcast-style spotlight with dramatic glow
          shape = new fabric.Ellipse({
            left: pointer.x,
            top: pointer.y,
            rx: 0,
            ry: 0,
            fill: 'rgba(255, 255, 0, 0.08)',
            stroke: '#ffcc00',
            strokeWidth: 4,
            shadow: new fabric.Shadow({
              color: '#ffff00',
              blur: 25,
              offsetX: 0,
              offsetY: 0,
            }),
            selectable: false,
            evented: false,
          })
          break

        case 'magnifier': {
          // Create working magnifier with live video zoom
          const magRadius = 60
          const magId = `magnifier-${Date.now()}`
          const magnifierCircle = new fabric.Circle({
            left: pointer.x - magRadius,
            top: pointer.y - magRadius,
            radius: magRadius,
            fill: 'rgba(0, 212, 255, 0.1)',
            stroke: '#00d4ff',
            strokeWidth: 4,
            shadow: new fabric.Shadow({
              color: '#00d4ff',
              blur: 20,
              offsetX: 0,
              offsetY: 0,
            }),
            selectable: true,
            evented: true,
          })

          canvas.add(magnifierCircle)

          // Register magnifier for live updates
          magnifiersRef.current.set(magId, {
            circle: magnifierCircle,
            centerX: pointer.x,
            centerY: pointer.y,
            radius: magRadius
          })

          // Initialize with current video frame
          updateMagnifierContent(magnifierCircle)

          // Store magId on the object for cleanup
          ;(magnifierCircle as MagnifierTaggedObject).magnifierId = magId

          createAnnotation(magnifierCircle, 'magnifier')

          isDrawingRef.current = false
          setIsDrawing(false)
          return
        }

        case 'tracker': {
          // Broadcast-style player tracker with dynamic rounded rect
          // All parts grouped so they move/delete/serialize as one annotation
          const trackerW = 60
          const trackerH = 60
          const outerRect = new fabric.Rect({
            left: -trackerW / 2,
            top: -trackerH / 2,
            width: trackerW,
            height: trackerH,
            rx: 8,
            ry: 8,
            fill: 'transparent',
            stroke: strokeColor,
            strokeWidth: 4,
            shadow: new fabric.Shadow({
              color: strokeColor,
              blur: 18,
              offsetX: 0,
              offsetY: 0,
            }),
          })

          const crossSize = Math.min(trackerW, trackerH) * 0.25
          const crossH = new fabric.Line([
            -crossSize, 0,
            crossSize, 0,
          ], {
            stroke: strokeColor,
            strokeWidth: 3,
            shadow: new fabric.Shadow({
              color: strokeColor,
              blur: 8,
              offsetX: 0,
              offsetY: 0,
            }),
          })
          const crossV = new fabric.Line([
            0, -crossSize,
            0, crossSize,
          ], {
            stroke: strokeColor,
            strokeWidth: 3,
            shadow: new fabric.Shadow({
              color: strokeColor,
              blur: 8,
              offsetX: 0,
              offsetY: 0,
            }),
          })

          const trackerGroup = new fabric.Group([outerRect, crossH, crossV], {
            left: pointer.x - trackerW / 2,
            top: pointer.y - trackerH / 2,
            selectable: true,
            evented: true,
          })

          canvas.add(trackerGroup)
          const trackerId = `tracker-${Date.now()}`
          createAnnotation(trackerGroup, 'tracker', trackerId)

          // Register this annotation group for auto-tracking under the same id
          // as the annotation, so removing the annotation can stop its tracker.
          if (playerTrackerRef.current && refDimsRef.current) {
            playerTrackerRef.current.track(trackerId, trackerGroup, {
              time: currentTime,
              x: pointer.x,
              y: pointer.y,
            }, { color: strokeColor, width: trackerW, height: trackerH })
            playerTrackerRef.current.enableAutoTracking(
              trackerId, videoElement,
              refDimsRef.current.width, refDimsRef.current.height
            )
          }

          isDrawingRef.current = false
          setIsDrawing(false)
          return
        }

        case 'text': {
          const textId = `text-${Date.now()}`
          const text = new fabric.IText('', {
            left: pointer.x,
            top: pointer.y,
            ...textFormatProps(textFormat),
            fill: strokeColor,
            shadow: shadowForStyle(annotationStyle, strokeColor),
          })
          canvas.add(text)
          canvas.setActiveObject(text)
          text.enterEditing()

          createAnnotation(text, 'text', textId)

          // Drop the annotation if the user leaves it empty instead of
          // persisting an invisible placeholder. A text that once held words
          // is deleted as its own undo step instead.
          let committed = false
          let beforeEdit = { text: '', styles: {} as unknown }
          text.on('editing:entered', () => {
            beforeEdit = { text: text.text ?? '', styles: JSON.parse(JSON.stringify(text.styles ?? {})) }
          })
          text.on('editing:exited', () => {
            if (!text.text || text.text.trim() === '') {
              useDrawingStore.getState().removeEmptiedText(textId, committed, beforeEdit)
            } else {
              committed = true
            }
          })

          isDrawingRef.current = false
          setIsDrawing(false)
          return
        }
      }

      if (shape) {
        // Line and arrow previews are the shaft that gets committed; show the dashes while dragging.
        if (DASH_TOOL_TYPES.has(currentTool) && useToolStore.getState().lineDash === 'dashed') applyDash(shape, 'line', true)
        currentShapeRef.current = shape
        canvas.add(shape)
      }
    }

    const handleMouseMove = (e: fabric.IEvent) => {
      const tool = NEW_TOOLS[currentTool]
      if (tool) {
        tool.onMove?.(toolContext(canvas, moduleCommit), canvas.getPointer(e.e), e)
        return
      }
      // Erase tool: extend preview path
      if (currentTool === 'erase' && isErasing) {
        const pointer = canvas.getPointer(e.e)
        const prev = erasePoints[erasePoints.length - 1]
        erasePoints.push({ x: pointer.x, y: pointer.y })

        // Draw red dashed preview segment
        const seg = new fabric.Line([prev.x, prev.y, pointer.x, pointer.y], {
          stroke: '#ff4444',
          strokeWidth: 3,
          strokeDashArray: [6, 4],
          selectable: false,
          evented: false,
          opacity: 0.8,
        })
        canvas.add(seg)
        erasePreview.push(seg)
        canvas.renderAll()
        return
      }

      if (!isDrawingRef.current || !currentShapeRef.current) return

      const pointer = canvas.getPointer(e.e)
      const shape = currentShapeRef.current
      const start = startPointRef.current

      // Arc arrow: update bezier preview
      if (currentTool === 'arc-arrow' && shape instanceof fabric.Path) {
        arcPointsRef.current.push({ x: pointer.x, y: pointer.y })
        const cp = calculateArcControlPoint(start, pointer, arcPointsRef.current)
        canvas.remove(shape)
        const newPath = new fabric.Path(
          `M ${start.x} ${start.y} Q ${cp.x} ${cp.y} ${pointer.x} ${pointer.y}`,
          {
            stroke: strokeColor,
            strokeWidth: Math.max(strokeWidth, 4),
            fill: 'transparent',
            strokeLineCap: 'round',
            shadow: shadowForStyle(annotationStyle, strokeColor, 15),
            selectable: false,
            evented: false,
          }
        )
        if (useToolStore.getState().lineDash === 'dashed') applyDash(newPath, 'path', true)
        canvas.add(newPath)
        currentShapeRef.current = newPath
        canvas.renderAll()
        return
      }

      if (shape instanceof fabric.Line) {
        (shape as fabric.Line).set({ x2: pointer.x, y2: pointer.y })
      } else if (shape instanceof fabric.Rect) {
        const width = pointer.x - start.x
        const height = pointer.y - start.y
        ;(shape as fabric.Rect).set({
          left: width > 0 ? start.x : pointer.x,
          top: height > 0 ? start.y : pointer.y,
          width: Math.abs(width),
          height: Math.abs(height),
        })
      } else if (shape instanceof fabric.Ellipse) {
        const rx = Math.abs(pointer.x - start.x) / 2
        const ry = Math.abs(pointer.y - start.y) / 2
        ;(shape as fabric.Ellipse).set({
          left: Math.min(start.x, pointer.x),
          top: Math.min(start.y, pointer.y),
          rx,
          ry,
        })
      } else if (shape instanceof fabric.Circle) {
        // For magnifier - maintain circular shape
        const radius = Math.max(
          Math.abs(pointer.x - start.x),
          Math.abs(pointer.y - start.y)
        ) / 2
        ;(shape as fabric.Circle).set({
          left: start.x - radius,
          top: start.y - radius,
          radius,
        })
      }

      canvas.renderAll()
    }

    const handleMouseUp = (e: fabric.IEvent) => {
      const tool = NEW_TOOLS[currentTool]
      if (tool) {
        tool.onUp?.(toolContext(canvas, moduleCommit), canvas.getPointer(e.e), e)
        return
      }
      // Erase tool: find intersecting annotations and remove them
      if (currentTool === 'erase' && isErasing) {
        isErasing = false

        // Remove preview lines
        erasePreview.forEach((seg) => canvas.remove(seg))
        erasePreview = []

        if (erasePoints.length >= 2) {
          // Build a temporary path from erase points
          const pathData = erasePoints.map((pt, i) =>
            i === 0 ? `M ${pt.x} ${pt.y}` : `L ${pt.x} ${pt.y}`
          ).join(' ')

          const erasePath = new fabric.Path(pathData, {
            stroke: '#ff0000',
            strokeWidth: 8,
            fill: 'transparent',
            selectable: false,
            evented: false,
          })
          canvas.add(erasePath)

          const { annotations: currentAnnotations, removeAnnotations } = useDrawingStore.getState()

          // Find annotations that intersect the erase path
          const toRemove: string[] = []
          for (const ann of currentAnnotations) {
            if (ann.object && erasePath.intersectsWithObject(ann.object)) {
              toRemove.push(ann.id)
            }
          }

          // Remove erase path
          canvas.remove(erasePath)

          // One store transaction keeps Fabric, metadata, and history in sync.
          removeAnnotations(toRemove)
        }

        erasePoints = []
        return
      }

      if (!isDrawingRef.current || !currentShapeRef.current) return

      const shape = currentShapeRef.current
      ;(shape as fabric.Object).set({ selectable: true, evented: true })

      // Arc arrow: finalize with arrowhead
      if (currentTool === 'arc-arrow' && shape instanceof fabric.Path) {
        const start = startPointRef.current
        const pts = arcPointsRef.current
        const end = pts.length > 1 ? pts[pts.length - 1] : start
        const cp = calculateArcControlPoint(start, end, pts)

        // Arrowhead angle from tangent at endpoint = direction from control point to endpoint
        const angle = Math.atan2(end.y - cp.y, end.x - cp.x)
        const shaftWidth = Math.max(strokeWidth, 4)
        const { length: headLength, width: headWidth } = arrowHeadSize(shaftWidth)

        canvas.remove(shape)

        const finalPath = new fabric.Path(
          `M ${start.x} ${start.y} Q ${cp.x} ${cp.y} ${end.x} ${end.y}`,
          {
            stroke: strokeColor,
            strokeWidth: shaftWidth,
            fill: 'transparent',
            strokeLineCap: 'round',
            shadow: shadowForStyle(annotationStyle, strokeColor, 15),
            selectable: false,
            evented: false,
          }
        )

        const arrowHead = new fabric.Triangle({
          left: end.x,
          top: end.y,
          width: headWidth * 2,
          height: headLength,
          fill: strokeColor,
          stroke: strokeColor,
          strokeWidth: 1,
          angle: (angle * 180 / Math.PI) + 90,
          originX: 'center',
          originY: 'bottom',
          shadow: shadowForStyle(annotationStyle, strokeColor, 15),
        })

        const arcGroup = new fabric.Group([finalPath, arrowHead], {
          selectable: true,
          evented: true,
        })
        canvas.add(arcGroup)
        createAnnotation(arcGroup, 'arc-arrow')

        arcPointsRef.current = []
        isDrawingRef.current = false
        currentShapeRef.current = null
        setIsDrawing(false)
        return
      }

      // Add broadcast-style arrowhead and group with line
      if (currentTool === 'arrow' && shape instanceof fabric.Line) {
        const x1 = (shape as fabric.Line).x1 || 0
        const y1 = (shape as fabric.Line).y1 || 0
        const x2 = (shape as fabric.Line).x2 || 0
        const y2 = (shape as fabric.Line).y2 || 0

        const angle = Math.atan2(y2 - y1, x2 - x1)
        const { length: headLength, width: headWidth } = arrowHeadSize((shape as fabric.Line).strokeWidth || 4)

        // Create filled triangle arrowhead
        const arrowHead = new fabric.Triangle({
          left: x2,
          top: y2,
          width: headWidth * 2,
          height: headLength,
          fill: strokeColor,
          stroke: strokeColor,
          strokeWidth: 1,
          angle: (angle * 180 / Math.PI) + 90,
          originX: 'center',
          originY: 'bottom',
          shadow: shadowForStyle(annotationStyle, strokeColor, 15),
        })

        // Remove the line and create a group with both line and arrowhead
        canvas.remove(shape)
        const arrowGroup = new fabric.Group([shape, arrowHead], {
          selectable: true,
          evented: true,
        })
        canvas.add(arrowGroup)
        createAnnotation(arrowGroup, currentTool)
      } else {
        createAnnotation(shape, currentTool)
      }

      isDrawingRef.current = false
      currentShapeRef.current = null
      setIsDrawing(false)
    }

    const handleDoubleClick = (e: fabric.IEvent) => {
      if ((currentTool === 'select' || currentTool === 'callout') && e.target) {
        const callout = useDrawingStore.getState().annotations.find((a) => a.object === e.target && a.toolType === 'callout')
        const stateAt = (annotation: Annotation) =>
          annotationStateAt(annotation, useVideoStore.getState().currentTime, elapsedFor(speedStepsRef.current))
        if (callout && beginCalloutEdit(canvas, callout.id, { stateAt })) return
      }
      NEW_TOOLS[currentTool]?.onDoubleClick?.(toolContext(canvas, moduleCommit), canvas.getPointer(e.e), e)
    }

    canvas.on('mouse:down', handleMouseDown)
    canvas.on('mouse:move', handleMouseMove)
    canvas.on('mouse:up', handleMouseUp)
    canvas.on('mouse:dblclick', handleDoubleClick)

    return () => {
      canvas.off('mouse:down', handleMouseDown)
      canvas.off('mouse:move', handleMouseMove)
      canvas.off('mouse:up', handleMouseUp)
      canvas.off('mouse:dblclick', handleDoubleClick)
    }
  }, [currentTool, strokeColor, strokeWidth, annotationStyle, textFormat, setIsDrawing, createAnnotation, moduleCommit])

  // Update brush when path is created (for pen tool)
  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas) return

    const handlePathCreated = (e: fabric.IEvent & { path?: fabric.Path }) => {
      if (e.path) {
        createAnnotation(e.path, 'path')
      }
    }

    canvas.on('path:created', handlePathCreated)
    return () => {
      canvas.off('path:created', handlePathCreated)
    }
  }, [createAnnotation])

  // Laser pointer: overlay dot + IPC broadcasting
  const laserDotRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas || currentTool !== 'laser') {
      // Hide laser and notify audience when not in laser mode
      if (laserDotRef.current) laserDotRef.current.style.display = 'none'
      if (isAudienceOpen && window.electronAPI) {
        window.electronAPI.sendLaserPosition({ x: 0, y: 0, visible: false })
      }
      return
    }

    // Disable drawing/selection while laser is active
    canvas.isDrawingMode = false
    canvas.selection = false

    const handleLaserMove = (e: fabric.IEvent) => {
      // canvas.getPointer() returns coordinates in the canvas's logical
      // (zoomed-out) space, which is video-native pixels — not display
      // pixels — because the canvas has a zoom applied (see applyZoom).
      const pointer = canvas.getPointer(e.e)
      const ref = refDimsRef.current

      // Position the HTML overlay dot in display space by scaling the
      // native-space pointer back up using the current display dimensions.
      const dot = laserDotRef.current
      if (dot && ref && ref.width > 0 && ref.height > 0) {
        const displayX = pointer.x * (dimensions.width / ref.width)
        const displayY = pointer.y * (dimensions.height / ref.height)
        dot.style.display = 'block'
        dot.style.left = `${displayX - 10}px`
        dot.style.top = `${displayY - 10}px`
      }

      // Broadcast to the audience view normalized by the video's native
      // resolution, matching the coordinate space the pointer is already in.
      if (isAudienceOpen && window.electronAPI) {
        const nativeW = videoElement.videoWidth || ref?.width || 0
        const nativeH = videoElement.videoHeight || ref?.height || 0
        if (nativeW > 0 && nativeH > 0) {
          window.electronAPI.sendLaserPosition({
            x: pointer.x / nativeW,
            y: pointer.y / nativeH,
            visible: true,
          })
        }
      }
    }

    const handleLaserOut = () => {
      if (laserDotRef.current) laserDotRef.current.style.display = 'none'
      if (isAudienceOpen && window.electronAPI) {
        window.electronAPI.sendLaserPosition({ x: 0, y: 0, visible: false })
      }
    }

    canvas.on('mouse:move', handleLaserMove)
    canvas.on('mouse:out', handleLaserOut)

    return () => {
      canvas.off('mouse:move', handleLaserMove)
      canvas.off('mouse:out', handleLaserOut)
    }
  }, [currentTool, isAudienceOpen, dimensions, laserColor])

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none z-10"
    >
      <div
        ref={wrapperRef}
        className="relative"
        style={{
          position: 'absolute',
          left: dimensions.offsetX,
          top: dimensions.offsetY,
        }}
      >
        <canvas
          ref={canvasRef}
          className="pointer-events-auto"
          style={{
            width: dimensions.width,
            height: dimensions.height,
          }}
        />
        {/* Laser pointer dot overlay */}
        <div
          ref={laserDotRef}
          style={{
            display: 'none',
            position: 'absolute',
            width: 20,
            height: 20,
            borderRadius: '50%',
            backgroundColor: laserColor,
            boxShadow: `0 0 12px 4px ${laserColor}, 0 0 24px 8px ${laserColor}40`,
            pointerEvents: 'none',
            zIndex: 50,
          }}
        />
      </div>
    </div>
  )
}
