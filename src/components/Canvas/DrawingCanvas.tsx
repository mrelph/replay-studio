import { useEffect, useRef, useState, useCallback } from 'react'
import { fabric } from 'fabric'
import { useToolStore } from '@/stores/toolStore'
import { useDrawingStore } from '@/stores/drawingStore'
import { useVideoStore } from '@/stores/videoStore'
import { SpotlightTool } from './tools/SpotlightTool'
import { AnimatedArrow } from './tools/AnimatedArrow'
import { PlayerTracker } from './tools/PlayerTracker'

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

  const { currentTool, strokeColor, strokeWidth, setIsDrawing } = useToolStore()
  const { setCanvas, addAnnotation } = useDrawingStore()
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

  // Create annotation with proper time range
  const createAnnotation = useCallback((object: any, toolType: string) => {
    const annotationDuration = toolType === 'tracker' ? 30 : 5 // Trackers last longer
    addAnnotation({
      id: `${toolType}-${Date.now()}`,
      object,
      startTime: currentTime,
      endTime: duration > 0 ? Math.min(currentTime + annotationDuration, duration) : currentTime + annotationDuration,
      layer: 0,
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
          shape = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
            stroke: strokeColor,
            strokeWidth: strokeWidth,
            selectable: false,
            evented: false,
          })
          break

        case 'arrow':
          // Create initial line for arrow
          shape = new fabric.Line([pointer.x, pointer.y, pointer.x, pointer.y], {
            stroke: strokeColor,
            strokeWidth: strokeWidth,
            selectable: false,
            evented: false,
          })
          break

        case 'rectangle':
          shape = new fabric.Rect({
            left: pointer.x,
            top: pointer.y,
            width: 0,
            height: 0,
            fill: 'transparent',
            stroke: strokeColor,
            strokeWidth: strokeWidth,
            selectable: false,
            evented: false,
          })
          break

        case 'circle':
          shape = new fabric.Ellipse({
            left: pointer.x,
            top: pointer.y,
            rx: 0,
            ry: 0,
            fill: 'transparent',
            stroke: strokeColor,
            strokeWidth: strokeWidth,
            selectable: false,
            evented: false,
          })
          break

        case 'spotlight':
          // Create spotlight with darkening effect
          shape = new fabric.Ellipse({
            left: pointer.x,
            top: pointer.y,
            rx: 0,
            ry: 0,
            fill: 'rgba(255, 255, 0, 0.15)',
            stroke: '#ffff00',
            strokeWidth: 3,
            strokeDashArray: [8, 4],
            selectable: false,
            evented: false,
          })
          break

        case 'magnifier':
          // Create magnifier circle
          shape = new fabric.Circle({
            left: pointer.x,
            top: pointer.y,
            radius: 0,
            fill: 'rgba(0, 212, 255, 0.1)',
            stroke: '#00d4ff',
            strokeWidth: 3,
            selectable: false,
            evented: false,
          })
          break

        case 'tracker':
          // Create player tracker marker
          const trackerRadius = 25
          const trackerCircle = new fabric.Circle({
            left: pointer.x - trackerRadius,
            top: pointer.y - trackerRadius,
            radius: trackerRadius,
            fill: 'transparent',
            stroke: strokeColor,
            strokeWidth: strokeWidth,
            selectable: true,
            evented: true,
          })

          // Add crosshairs
          const crossSize = trackerRadius * 0.6
          const crossH = new fabric.Line([
            pointer.x - crossSize, pointer.y,
            pointer.x + crossSize, pointer.y,
          ], {
            stroke: strokeColor,
            strokeWidth: 2,
          })
          const crossV = new fabric.Line([
            pointer.x, pointer.y - crossSize,
            pointer.x, pointer.y + crossSize,
          ], {
            stroke: strokeColor,
            strokeWidth: 2,
          })

          canvas.add(trackerCircle)
          canvas.add(crossH)
          canvas.add(crossV)

          createAnnotation(trackerCircle, 'tracker')

          isDrawingRef.current = false
          setIsDrawing(false)
          return

        case 'text':
          const text = new IText('Type here', {
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

      if (shape instanceof Line) {
        shape.set({ x2: pointer.x, y2: pointer.y })
      } else if (shape instanceof Rect) {
        const width = pointer.x - start.x
        const height = pointer.y - start.y
        shape.set({
          left: width > 0 ? start.x : pointer.x,
          top: height > 0 ? start.y : pointer.y,
          width: Math.abs(width),
          height: Math.abs(height),
        })
      } else if (shape instanceof Ellipse) {
        const rx = Math.abs(pointer.x - start.x) / 2
        const ry = Math.abs(pointer.y - start.y) / 2
        shape.set({
          left: Math.min(start.x, pointer.x),
          top: Math.min(start.y, pointer.y),
          rx,
          ry,
        })
      } else if (shape instanceof Circle) {
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

      // Add arrowhead for arrow tool
      if (currentTool === 'arrow' && shape instanceof Line) {
        const x1 = shape.x1 || 0
        const y1 = shape.y1 || 0
        const x2 = shape.x2 || 0
        const y2 = shape.y2 || 0

        const angle = Math.atan2(y2 - y1, x2 - x1)
        const headLength = 15

        const arrowHead1 = new Line([
          x2,
          y2,
          x2 - headLength * Math.cos(angle - Math.PI / 6),
          y2 - headLength * Math.sin(angle - Math.PI / 6),
        ], {
          stroke: strokeColor,
          strokeWidth: strokeWidth,
        })

        const arrowHead2 = new Line([
          x2,
          y2,
          x2 - headLength * Math.cos(angle + Math.PI / 6),
          y2 - headLength * Math.sin(angle + Math.PI / 6),
        ], {
          stroke: strokeColor,
          strokeWidth: strokeWidth,
        })

        canvas.add(arrowHead1)
        canvas.add(arrowHead2)
      }

      createAnnotation(shape, currentTool)

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
      className="absolute inset-0 flex items-center justify-center pointer-events-none"
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
