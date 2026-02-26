import { useEffect, useRef, useState, useCallback } from 'react'
import fabricModule from 'fabric'
import { useToolStore } from '@/stores/toolStore'
import { useDrawingStore } from '@/stores/drawingStore'
import { useVideoStore } from '@/stores/videoStore'
import { useAudienceStore } from '@/stores/audienceStore'
import { SpotlightTool } from './tools/SpotlightTool'
import { AnimatedArrow } from './tools/AnimatedArrow'
import { PlayerTracker } from './tools/PlayerTracker'
import { getToolDefaults } from '@/utils/annotationDefaults'

// Handle CommonJS/ESM interop - fabric exports { fabric: ... } structure
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fabric: any = (fabricModule as any).fabric || fabricModule

interface DrawingCanvasProps {
  videoElement: HTMLVideoElement
}

export default function DrawingCanvas({ videoElement }: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const fabricRef = useRef<fabric.Canvas | null>(null)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0, offsetX: 0, offsetY: 0 })

  // Tool instances
  const spotlightToolRef = useRef<SpotlightTool | null>(null)
  const animatedArrowRef = useRef<AnimatedArrow | null>(null)
  const playerTrackerRef = useRef<PlayerTracker | null>(null)

  // Track magnifiers for live video zoom updates
  const magnifiersRef = useRef<Map<string, { circle: any, centerX: number, centerY: number, radius: number }>>(new Map())

  const { currentTool, strokeColor, strokeWidth, setIsDrawing } = useToolStore()
  const isAudienceOpen = useAudienceStore((s) => s.isAudienceOpen)
  const laserColor = useAudienceStore((s) => s.laserColor)
  const { setCanvas, addAnnotation, annotations } = useDrawingStore()
  const { currentTime, duration } = useVideoStore()

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

  // Initialize Fabric canvas once when video element is ready
  useEffect(() => {
    if (!canvasRef.current || !videoElement) return

    const dims = calcDimensions()
    if (dims.width === 0) return

    const canvas = new fabric.Canvas(canvasRef.current, {
      width: dims.width,
      height: dims.height,
      selection: currentTool === 'select',
      isDrawingMode: currentTool === 'pen',
      enableRetinaScaling: true,
    })

    fabricRef.current = canvas
    setCanvas(canvas)
    setDimensions(dims)

    // Initialize tool instances
    spotlightToolRef.current = new SpotlightTool(canvas)
    animatedArrowRef.current = new AnimatedArrow(canvas)
    playerTrackerRef.current = new PlayerTracker(canvas)

    return () => {
      canvas.dispose()
      fabricRef.current = null
      setCanvas(null)
      spotlightToolRef.current = null
      animatedArrowRef.current = null
      playerTrackerRef.current = null
    }
  // Only re-init when the video element itself changes, not on resize
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoElement, setCanvas])

  // Update canvas dimensions on resize/metadata load (without recreating)
  useEffect(() => {
    if (!videoElement) return

    let resizeTimer: ReturnType<typeof setTimeout>

    const updateDimensions = () => {
      clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        const canvas = fabricRef.current
        if (!canvas) return

        const dims = calcDimensions()
        if (dims.width === 0) return

        canvas.setDimensions({ width: dims.width, height: dims.height })
        setDimensions(dims)
        canvas.renderAll()
      }, 50) // Debounce resize
    }

    videoElement.addEventListener('loadedmetadata', updateDimensions)
    window.addEventListener('resize', updateDimensions)

    return () => {
      clearTimeout(resizeTimer)
      videoElement.removeEventListener('loadedmetadata', updateDimensions)
      window.removeEventListener('resize', updateDimensions)
    }
  }, [videoElement, calcDimensions])

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

  // Update animated arrows and trackers when video time changes
  useEffect(() => {
    if (animatedArrowRef.current) {
      animatedArrowRef.current.update(currentTime)
    }
    if (playerTrackerRef.current) {
      playerTrackerRef.current.update(currentTime)
    }
  }, [currentTime])

  // Update magnifier content from video frame
  const updateMagnifierContent = useCallback((magnifierId: string, circle: any, centerX: number, centerY: number, radius: number) => {
    if (!videoElement || !fabricRef.current) return

    const zoomLevel = 2.5
    const canvas = fabricRef.current

    // Create off-screen canvas for zoomed content (HiDPI-aware)
    const dpr = window.devicePixelRatio || 1
    const tempCanvas = document.createElement('canvas')
    const size = radius * 2
    tempCanvas.width = size * dpr
    tempCanvas.height = size * dpr
    const ctx = tempCanvas.getContext('2d')
    if (!ctx) return
    ctx.scale(dpr, dpr)

    // Calculate source region from video
    const videoScaleX = videoElement.videoWidth / dimensions.width
    const videoScaleY = videoElement.videoHeight / dimensions.height

    const sourceSize = (radius * 2) / zoomLevel
    const sourceX = (centerX - sourceSize / 2) * videoScaleX
    const sourceY = (centerY - sourceSize / 2) * videoScaleY
    const sourceWidth = sourceSize * videoScaleX
    const sourceHeight = sourceSize * videoScaleY

    // Draw zoomed video portion
    ctx.save()
    ctx.beginPath()
    ctx.arc(radius, radius, radius - 4, 0, Math.PI * 2)
    ctx.clip()

    try {
      ctx.drawImage(
        videoElement,
        Math.max(0, sourceX),
        Math.max(0, sourceY),
        Math.min(sourceWidth, videoElement.videoWidth - sourceX),
        Math.min(sourceHeight, videoElement.videoHeight - sourceY),
        0, 0, size, size
      )
    } catch (e) {
      // Video might not be ready
    }

    ctx.restore()

    // Draw border inside
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

    // Create pattern from temp canvas and apply to circle
    const pattern = new fabric.Pattern({
      source: tempCanvas,
      repeat: 'no-repeat',
    })

    circle.set({
      fill: pattern,
      dirty: true
    })

    canvas.renderAll()
  }, [videoElement, dimensions])

  // Update all magnifiers when video time changes
  useEffect(() => {
    magnifiersRef.current.forEach((mag, id) => {
      updateMagnifierContent(id, mag.circle, mag.centerX, mag.centerY, mag.radius)
    })
  }, [currentTime, updateMagnifierContent])

  // Control annotation visibility based on current time with fade effects
  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas) return

    annotations.forEach((annotation) => {
      const { startTime, endTime, fadeIn = 0, fadeOut = 0 } = annotation
      const isInTimeRange = currentTime >= startTime && currentTime <= endTime

      if (!isInTimeRange) {
        // Hide annotation outside time range
        annotation.object.visible = false
        annotation.object.opacity = 0
      } else {
        // Show annotation and calculate opacity for fade effects
        annotation.object.visible = true

        const timeInRange = currentTime - startTime
        const timeToEnd = endTime - currentTime

        let opacity = 1

        // Fade in effect - ensure minimum 0.5 opacity so new drawings are visible
        if (fadeIn > 0 && timeInRange < fadeIn) {
          opacity = Math.max(0.5, timeInRange / fadeIn)
        }
        // Fade out effect
        else if (fadeOut > 0 && timeToEnd < fadeOut) {
          opacity = Math.max(0.2, timeToEnd / fadeOut)
        }

        annotation.object.opacity = opacity
      }
    })

    canvas.renderAll()
  }, [currentTime, annotations])

  // Clean up magnifier refs when annotations are removed
  useEffect(() => {
    const annotationIds = new Set(annotations.map(a => a.id))
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

  // Create annotation with proper time range
  const createAnnotation = useCallback((object: any, toolType: string) => {
    const defaults = getToolDefaults(toolType)
    const endTime = duration > 0
      ? Math.min(currentTime + defaults.duration, duration)
      : currentTime + defaults.duration

    addAnnotation({
      id: `${toolType}-${Date.now()}`,
      object,
      startTime: currentTime,
      endTime,
      layer: 0,
      toolType,
      fadeIn: defaults.fadeIn,
      fadeOut: defaults.fadeOut,
    })
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

    const handleMouseDown = (e: any) => {
      if (currentTool === 'pen' || currentTool === 'select' || currentTool === 'laser') return

      const pointer = canvas.getPointer(e.e)
      isDrawingRef.current = true
      startPointRef.current = { x: pointer.x, y: pointer.y }
      setIsDrawing(true)

      let shape: fabric.Line | fabric.Circle | fabric.Rect | fabric.Ellipse | fabric.Group | null = null

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

        case 'magnifier':
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
          updateMagnifierContent(magId, magnifierCircle, pointer.x, pointer.y, magRadius)

          // Store magId on the object for cleanup
          ;(magnifierCircle as any).magnifierId = magId

          createAnnotation(magnifierCircle, 'magnifier')

          isDrawingRef.current = false
          setIsDrawing(false)
          return

        case 'tracker': {
          // Broadcast-style player tracker with glowing ring
          // All parts grouped so they move/delete/serialize as one annotation
          const trackerRadius = 30
          const outerRing = new fabric.Circle({
            left: -trackerRadius,
            top: -trackerRadius,
            radius: trackerRadius,
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

          const innerRing = new fabric.Circle({
            left: -trackerRadius * 0.7,
            top: -trackerRadius * 0.7,
            radius: trackerRadius * 0.7,
            fill: 'transparent',
            stroke: strokeColor,
            strokeWidth: 2,
            opacity: 0.5,
          })

          const crossSize = trackerRadius * 0.5
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

          const trackerGroup = new fabric.Group([outerRing, innerRing, crossH, crossV], {
            left: pointer.x - trackerRadius,
            top: pointer.y - trackerRadius,
            selectable: true,
            evented: true,
          })

          canvas.add(trackerGroup)
          createAnnotation(trackerGroup, 'tracker')

          // Enable auto-tracking via color template matching
          if (playerTrackerRef.current) {
            const trackerId = `tracker-${Date.now()}`
            playerTrackerRef.current.create(trackerId, {
              time: currentTime,
              x: pointer.x,
              y: pointer.y,
            }, { color: strokeColor, radius: trackerRadius })
            playerTrackerRef.current.enableAutoTracking(
              trackerId, videoElement,
              dimensions.width, dimensions.height
            )
          }

          isDrawingRef.current = false
          setIsDrawing(false)
          return
        }

        case 'text':
          const text = new fabric.IText('Type here', {
            left: pointer.x,
            top: pointer.y,
            fontSize: 24,
            fill: strokeColor,
            fontFamily: 'Arial',
          })
          canvas.add(text)
          canvas.setActiveObject(text)
          text.enterEditing()

          createAnnotation(text, 'text')

          isDrawingRef.current = false
          setIsDrawing(false)
          return
      }

      if (shape) {
        currentShapeRef.current = shape
        canvas.add(shape)
      }
    }

    const handleMouseMove = (e: any) => {
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
        shape.set({ x2: pointer.x, y2: pointer.y })
      } else if (shape instanceof fabric.Rect) {
        const width = pointer.x - start.x
        const height = pointer.y - start.y
        shape.set({
          left: width > 0 ? start.x : pointer.x,
          top: height > 0 ? start.y : pointer.y,
          width: Math.abs(width),
          height: Math.abs(height),
        })
      } else if (shape instanceof fabric.Ellipse) {
        const rx = Math.abs(pointer.x - start.x) / 2
        const ry = Math.abs(pointer.y - start.y) / 2
        shape.set({
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
        shape.set({
          left: start.x - radius,
          top: start.y - radius,
          radius,
        })
      }

      canvas.renderAll()
    }

    const handleMouseUp = () => {
      if (!isDrawingRef.current || !currentShapeRef.current) return

      const shape = currentShapeRef.current
      shape.set({ selectable: true, evented: true })

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
        const x1 = shape.x1 || 0
        const y1 = shape.y1 || 0
        const x2 = shape.x2 || 0
        const y2 = shape.y2 || 0

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

    const handlePathCreated = (e: any) => {
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

    const handleLaserMove = (e: any) => {
      const pointer = canvas.getPointer(e.e)
      const dot = laserDotRef.current
      if (dot) {
        dot.style.display = 'block'
        dot.style.left = `${pointer.x - 10}px`
        dot.style.top = `${pointer.y - 10}px`
      }
      if (isAudienceOpen && window.electronAPI && dimensions.width > 0) {
        window.electronAPI.sendLaserPosition({
          x: pointer.x / dimensions.width,
          y: pointer.y / dimensions.height,
          visible: true,
        })
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
