import { useEffect, useRef, useState, useCallback } from 'react'
import fabricModule from 'fabric'
import { useToolStore } from '@/stores/toolStore'
import { useDrawingStore } from '@/stores/drawingStore'
import { useVideoStore } from '@/stores/videoStore'
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
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

  // Tool instances
  const spotlightToolRef = useRef<SpotlightTool | null>(null)
  const animatedArrowRef = useRef<AnimatedArrow | null>(null)
  const playerTrackerRef = useRef<PlayerTracker | null>(null)

  // Track magnifiers for live video zoom updates
  const magnifiersRef = useRef<Map<string, { circle: any, centerX: number, centerY: number, radius: number }>>(new Map())

  const { currentTool, strokeColor, strokeWidth, setIsDrawing } = useToolStore()
  const { setCanvas, addAnnotation, annotations } = useDrawingStore()
  const { currentTime, duration } = useVideoStore()

  // Track drawing state for shapes
  const isDrawingRef = useRef(false)
  const startPointRef = useRef({ x: 0, y: 0 })
  const currentShapeRef = useRef<fabric.Line | fabric.Circle | fabric.Rect | fabric.Ellipse | fabric.Group | null>(null)

  // Update canvas dimensions to match video
  useEffect(() => {
    const updateDimensions = () => {
      if (!videoElement || !containerRef.current) return

      const containerRect = containerRef.current.getBoundingClientRect()

      // Calculate the actual video display size (respecting aspect ratio)
      const videoAspect = videoElement.videoWidth / videoElement.videoHeight
      const containerAspect = containerRect.width / containerRect.height

      let width, height
      if (videoAspect > containerAspect) {
        width = containerRect.width
        height = width / videoAspect
      } else {
        height = containerRect.height
        width = height * videoAspect
      }

      setDimensions({ width, height })
    }

    updateDimensions()
    videoElement.addEventListener('loadedmetadata', updateDimensions)
    window.addEventListener('resize', updateDimensions)

    return () => {
      videoElement.removeEventListener('loadedmetadata', updateDimensions)
      window.removeEventListener('resize', updateDimensions)
    }
  }, [videoElement])

  // Initialize Fabric canvas
  useEffect(() => {
    if (!canvasRef.current || dimensions.width === 0) return

    const canvas = new fabric.Canvas(canvasRef.current, {
      width: dimensions.width,
      height: dimensions.height,
      selection: currentTool === 'select',
      isDrawingMode: currentTool === 'pen',
    })

    fabricRef.current = canvas
    setCanvas(canvas)

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
  }, [dimensions, setCanvas])

  // Update canvas settings when tool changes
  useEffect(() => {
    const canvas = fabricRef.current
    if (!canvas) return

    canvas.isDrawingMode = currentTool === 'pen'
    canvas.selection = currentTool === 'select'

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

    // Create off-screen canvas for zoomed content
    const tempCanvas = document.createElement('canvas')
    const size = radius * 2
    tempCanvas.width = size
    tempCanvas.height = size
    const ctx = tempCanvas.getContext('2d')
    if (!ctx) return

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

    const handleMouseDown = (e: any) => {
      if (currentTool === 'pen' || currentTool === 'select') return

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

        case 'tracker':
          // Broadcast-style player tracker with glowing ring
          const trackerRadius = 30
          const trackerCircle = new fabric.Circle({
            left: pointer.x - trackerRadius,
            top: pointer.y - trackerRadius,
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
            selectable: true,
            evented: true,
          })

          // Add inner ring for depth
          const innerRing = new fabric.Circle({
            left: pointer.x - trackerRadius * 0.7,
            top: pointer.y - trackerRadius * 0.7,
            radius: trackerRadius * 0.7,
            fill: 'transparent',
            stroke: strokeColor,
            strokeWidth: 2,
            opacity: 0.5,
          })

          // Add crosshairs with glow
          const crossSize = trackerRadius * 0.5
          const crossH = new fabric.Line([
            pointer.x - crossSize, pointer.y,
            pointer.x + crossSize, pointer.y,
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
            pointer.x, pointer.y - crossSize,
            pointer.x, pointer.y + crossSize,
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

          canvas.add(trackerCircle)
          canvas.add(innerRing)
          canvas.add(crossH)
          canvas.add(crossV)

          createAnnotation(trackerCircle, 'tracker')

          isDrawingRef.current = false
          setIsDrawing(false)
          return

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

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 flex items-center justify-center pointer-events-none z-10"
    >
      <canvas
        ref={canvasRef}
        className="pointer-events-auto"
        style={{
          width: dimensions.width,
          height: dimensions.height,
        }}
      />
    </div>
  )
}
