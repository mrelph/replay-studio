import { fabric } from 'fabric'

export interface AnimatedArrowOptions {
  startX: number
  startY: number
  endX: number
  endY: number
  color?: string
  strokeWidth?: number
  headSize?: number
  animationDuration?: number // in seconds
  animationType?: 'grow' | 'pulse' | 'dash'
}

export interface AnimatedArrowState {
  group: fabric.Group
  startTime: number
  endTime: number
  options: AnimatedArrowOptions
}

export class AnimatedArrow {
  private canvas: fabric.Canvas
  private arrows: Map<string, AnimatedArrowState> = new Map()
  private animationFrame: number | null = null

  constructor(canvas: fabric.Canvas) {
    this.canvas = canvas
  }

  create(id: string, options: AnimatedArrowOptions, startTime: number, duration: number = 2): fabric.Group {
    const {
      startX,
      startY,
      endX,
      endY,
      color = '#ff0000',
      strokeWidth = 4,
      headSize = 20,
    } = options

    // Create the arrow shaft
    const shaft = new fabric.Line([startX, startY, endX, endY], {
      stroke: color,
      strokeWidth: strokeWidth,
      strokeLineCap: 'round',
    })

    // Calculate arrow head
    const angle = Math.atan2(endY - startY, endX - startX)
    const headAngle = Math.PI / 6 // 30 degrees

    const head1EndX = endX - headSize * Math.cos(angle - headAngle)
    const head1EndY = endY - headSize * Math.sin(angle - headAngle)
    const head2EndX = endX - headSize * Math.cos(angle + headAngle)
    const head2EndY = endY - headSize * Math.sin(angle + headAngle)

    const head1 = new fabric.Line([endX, endY, head1EndX, head1EndY], {
      stroke: color,
      strokeWidth: strokeWidth,
      strokeLineCap: 'round',
    })

    const head2 = new fabric.Line([endX, endY, head2EndX, head2EndY], {
      stroke: color,
      strokeWidth: strokeWidth,
      strokeLineCap: 'round',
    })

    // Group all parts
    const group = new fabric.Group([shaft, head1, head2], {
      selectable: true,
      evented: true,
    })

    // Store animation state
    ;(group as any).arrowId = id
    ;(group as any).animationProgress = 0

    this.arrows.set(id, {
      group,
      startTime,
      endTime: startTime + duration,
      options,
    })

    this.canvas.add(group)
    return group
  }

  // Create a curved/path arrow
  createCurved(
    id: string,
    points: { x: number; y: number }[],
    options: Partial<AnimatedArrowOptions>,
    startTime: number,
    duration: number = 2
  ): fabric.Path {
    const { color = '#ff0000', strokeWidth = 4 } = options

    if (points.length < 2) {
      throw new Error('Need at least 2 points for a curved arrow')
    }

    // Build SVG path
    let pathData = `M ${points[0].x} ${points[0].y}`

    if (points.length === 2) {
      // Straight line
      pathData += ` L ${points[1].x} ${points[1].y}`
    } else if (points.length === 3) {
      // Quadratic curve
      pathData += ` Q ${points[1].x} ${points[1].y} ${points[2].x} ${points[2].y}`
    } else {
      // Cubic curves
      for (let i = 1; i < points.length - 2; i += 3) {
        pathData += ` C ${points[i].x} ${points[i].y} ${points[i + 1].x} ${points[i + 1].y} ${points[i + 2].x} ${points[i + 2].y}`
      }
    }

    const path = new fabric.Path(pathData, {
      fill: 'transparent',
      stroke: color,
      strokeWidth: strokeWidth,
      strokeLineCap: 'round',
      selectable: true,
      evented: true,
    })

    // Add arrow head at the end
    const lastPoint = points[points.length - 1]
    const secondLast = points[points.length - 2]
    const angle = Math.atan2(lastPoint.y - secondLast.y, lastPoint.x - secondLast.x)
    const headSize = 15

    const head1 = new fabric.Line([
      lastPoint.x,
      lastPoint.y,
      lastPoint.x - headSize * Math.cos(angle - Math.PI / 6),
      lastPoint.y - headSize * Math.sin(angle - Math.PI / 6),
    ], {
      stroke: color,
      strokeWidth: strokeWidth,
      strokeLineCap: 'round',
    })

    const head2 = new fabric.Line([
      lastPoint.x,
      lastPoint.y,
      lastPoint.x - headSize * Math.cos(angle + Math.PI / 6),
      lastPoint.y - headSize * Math.sin(angle + Math.PI / 6),
    ], {
      stroke: color,
      strokeWidth: strokeWidth,
      strokeLineCap: 'round',
    })

    const group = new fabric.Group([path, head1, head2], {
      selectable: true,
      evented: true,
    })

    ;(group as any).arrowId = id

    this.arrows.set(id, {
      group,
      startTime,
      endTime: startTime + duration,
      options: { ...options, startX: points[0].x, startY: points[0].y, endX: lastPoint.x, endY: lastPoint.y },
    })

    this.canvas.add(group)
    return path
  }

  // Update animation based on current video time
  update(currentTime: number) {
    this.arrows.forEach((state) => {
      const { group, startTime, endTime, options } = state
      const animationType = options.animationType || 'grow'

      if (currentTime < startTime) {
        // Before animation starts - hide or show at 0%
        group.set({ opacity: 0 })
      } else if (currentTime >= endTime) {
        // Animation complete - show fully
        group.set({ opacity: 1, scaleX: 1, scaleY: 1 })
      } else {
        // During animation
        const progress = (currentTime - startTime) / (endTime - startTime)

        switch (animationType) {
          case 'grow':
            // Scale from start point
            group.set({
              opacity: 1,
              scaleX: progress,
              scaleY: progress,
            })
            break

          case 'pulse':
            // Pulsing opacity
            const pulse = 0.5 + 0.5 * Math.sin(progress * Math.PI * 4)
            group.set({ opacity: pulse })
            break

          case 'dash':
            // Animated dash (would need strokeDashOffset support)
            group.set({ opacity: 1 })
            break

          default:
            group.set({ opacity: progress })
        }
      }
    })

    this.canvas.renderAll()
  }

  // Start animation loop
  startAnimation(getTime: () => number) {
    const animate = () => {
      this.update(getTime())
      this.animationFrame = requestAnimationFrame(animate)
    }
    animate()
  }

  stopAnimation() {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame)
      this.animationFrame = null
    }
  }

  remove(id: string) {
    const state = this.arrows.get(id)
    if (state) {
      this.canvas.remove(state.group)
      this.arrows.delete(id)
    }
  }

  removeAll() {
    this.stopAnimation()
    this.arrows.forEach((state) => {
      this.canvas.remove(state.group)
    })
    this.arrows.clear()
  }

  getArrow(id: string) {
    return this.arrows.get(id)?.group
  }

  getAllArrows() {
    return Array.from(this.arrows.values()).map((s) => s.group)
  }
}

// Helper to create a simple animated arrow
export function createGrowingArrow(
  canvas: fabric.Canvas,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  color: string = '#ff0000',
  strokeWidth: number = 4
): fabric.Group {
  const tool = new AnimatedArrow(canvas)
  return tool.create(`arrow-${Date.now()}`, {
    startX,
    startY,
    endX,
    endY,
    color,
    strokeWidth,
    animationType: 'grow',
  }, 0, 1)
}
