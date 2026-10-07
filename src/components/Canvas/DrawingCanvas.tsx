import { useEffect, useRef, useState, useCallback } from 'react'
import { fabric } from '@/lib/fabric'
import { useToolStore } from '@/stores/toolStore'
import { useDrawingStore } from '@/stores/drawingStore'
import { useVideoStore } from '@/stores/videoStore'
import { useAudienceStore } from '@/stores/audienceStore'
import { PlayerTracker } from './tools/PlayerTracker'
import { getToolDefaults } from '@/utils/annotationDefaults'
import { annotationStateAt } from '@/export/annotationTiming'

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

  const { currentTool, strokeColor, strokeWidth, setIsDrawing } = useToolStore()
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
    setCanvas(canvas)
    setDimensions(dims)
    appliedRef.current = { ...dims, refWidth: nativeW, refHeight: nativeH }

    // Initialize tool instances
    playerTrackerRef.current = new PlayerTracker(canvas)

    return () => {
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
    }
    const cursor = cursorMap[currentTool] || 'default'
    canvas.defaultCursor = cursor
    canvas.hoverCursor = currentTool === 'select' ? 'move' : cursor

    if (currentTool === 'pen') {
      const brush = new fabric.PencilBrush(canvas)
      brush.color = strokeColor
      brush.width = strokeWidth
      canvas.freeDrawingBrush = brush
    }
  }, [currentTool, strokeColor, strokeWidth])

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

  // Control annotation visibility based on current time with fade effects.
  // The rule itself lives in src/export/annotationTiming.ts, shared with the
  // clip export renderer so burned-in exports match what's shown here.
  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas) return

    annotations.forEach((annotation) => {
      const { visible, opacity } = annotationStateAt(annotation, currentTime)
      annotation.object.visible = visible
      annotation.object.opacity = opacity
    })

    canvas.renderAll()
  }, [currentTime, annotations])

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
    const endTime = duration > 0
      ? Math.min(currentTime + defaults.duration, duration)
      : currentTime + defaults.duration
    const annotationId = id || `${toolType}-${Date.now()}`

    addAnnotation({
      id: annotationId,
      object,
      startTime: currentTime,
      endTime,
      layer: 0,
      toolType,
      fadeIn: defaults.fadeIn,
      fadeOut: defaults.fadeOut,
    })

    return annotationId
  }, [addAnnotation, currentTime, duration])

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
            shadow: new fabric.Shadow({
              color: strokeColor,
              blur: 10,
              offsetX: 0,
              offsetY: 0,
            }),
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
            shadow: new fabric.Shadow({
              color: strokeColor,
              blur: 15,
              offsetX: 0,
              offsetY: 0,
            }),
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
            shadow: new fabric.Shadow({
              color: strokeColor,
              blur: 15,
              offsetX: 0,
              offsetY: 0,
            }),
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
            shadow: new fabric.Shadow({
              color: strokeColor,
              blur: 12,
              offsetX: 0,
              offsetY: 0,
            }),
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
            shadow: new fabric.Shadow({
              color: strokeColor,
              blur: 12,
              offsetX: 0,
              offsetY: 0,
            }),
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
            fontSize: 24,
            fill: strokeColor,
            fontFamily: 'Arial',
          })
          canvas.add(text)
          canvas.setActiveObject(text)
          text.enterEditing()

          createAnnotation(text, 'text', textId)

          // Drop the annotation if the user leaves it empty instead of
          // persisting an invisible placeholder.
          text.on('editing:exited', () => {
            if (!text.text || text.text.trim() === '') {
              useDrawingStore.getState().removeAnnotations([textId])
            }
          })

          isDrawingRef.current = false
          setIsDrawing(false)
          return
        }
      }

      if (shape) {
        currentShapeRef.current = shape
        canvas.add(shape)
      }
    }

    const handleMouseMove = (e: fabric.IEvent) => {
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
            shadow: new fabric.Shadow({
              color: strokeColor,
              blur: 15,
              offsetX: 0,
              offsetY: 0,
            }),
            selectable: false,
            evented: false,
          }
        )
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

    const handleMouseUp = () => {
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
        const headLength = 25
        const headWidth = 12

        canvas.remove(shape)

        const finalPath = new fabric.Path(
          `M ${start.x} ${start.y} Q ${cp.x} ${cp.y} ${end.x} ${end.y}`,
          {
            stroke: strokeColor,
            strokeWidth: Math.max(strokeWidth, 4),
            fill: 'transparent',
            strokeLineCap: 'round',
            shadow: new fabric.Shadow({
              color: strokeColor,
              blur: 15,
              offsetX: 0,
              offsetY: 0,
            }),
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
          shadow: new fabric.Shadow({
            color: strokeColor,
            blur: 15,
            offsetX: 0,
            offsetY: 0,
          }),
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
        const headLength = 25  // Larger arrowhead
        const headWidth = 12   // Width of arrowhead base

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
          shadow: new fabric.Shadow({
            color: strokeColor,
            blur: 15,
            offsetX: 0,
            offsetY: 0,
          }),
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

    canvas.on('mouse:down', handleMouseDown)
    canvas.on('mouse:move', handleMouseMove)
    canvas.on('mouse:up', handleMouseUp)

    return () => {
      canvas.off('mouse:down', handleMouseDown)
      canvas.off('mouse:move', handleMouseMove)
      canvas.off('mouse:up', handleMouseUp)
    }
  }, [currentTool, strokeColor, strokeWidth, setIsDrawing, createAnnotation])

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
