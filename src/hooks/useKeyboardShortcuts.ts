import { useEffect, useCallback } from 'react'
import { useToolStore, PRESET_COLORS, type ToolType } from '@/stores/toolStore'
import { useVideoStore } from '@/stores/videoStore'
import { useDrawingStore } from '@/stores/drawingStore'
import { useShortcutsStore, type ShortcutAction } from '@/stores/shortcutsStore'
import fabricModule from 'fabric'

// Handle CommonJS/ESM interop
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fabric: any = (fabricModule as any).fabric || fabricModule

// Map shortcut actions to tool types
const TOOL_ACTION_MAP: Partial<Record<ShortcutAction, ToolType>> = {
  'tool.select': 'select',
  'tool.pen': 'pen',
  'tool.line': 'line',
  'tool.arrow': 'arrow',
  'tool.arcArrow': 'arc-arrow',
  'tool.rectangle': 'rectangle',
  'tool.circle': 'circle',
  'tool.text': 'text',
  'tool.spotlight': 'spotlight',
  'tool.magnifier': 'magnifier',
  'tool.tracker': 'tracker',
  'tool.laser': 'laser',
}

export function useKeyboardShortcuts() {
  const { setCurrentTool } = useToolStore()
  const {
    togglePlay,
    stepFrame,
    skip,
    seek,
    duration,
    setInPoint,
    setOutPoint,
    toggleMute,
    setIsLooping,
    isLooping,
    videoElement
  } = useVideoStore()
  const { undo, redo, canvas } = useDrawingStore()

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't handle shortcuts when typing in inputs
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return
    }

    const key = e.key.toLowerCase()
    const ctrl = e.ctrlKey || e.metaKey
    const shift = e.shiftKey
    const alt = e.altKey

    // Look up the action from the shortcuts store
    const action = useShortcutsStore.getState().getActionForKey(key, ctrl, shift, alt)

    if (!action) return

    // Tool actions
    const toolType = TOOL_ACTION_MAP[action]
    if (toolType) {
      e.preventDefault()
      setCurrentTool(toolType)
      return
    }

    // Video actions
    switch (action) {
      case 'video.playPause':
        e.preventDefault()
        togglePlay()
        return
      case 'video.stepForward':
        e.preventDefault()
        stepFrame('forward')
        return
      case 'video.stepBackward':
        e.preventDefault()
        stepFrame('backward')
        return
      case 'video.skipForward':
        e.preventDefault()
        skip(10)
        return
      case 'video.skipBackward':
        e.preventDefault()
        skip(-10)
        return
      case 'video.pause':
        e.preventDefault()
        if (videoElement) {
          videoElement.pause()
        }
        return
      case 'video.goToStart':
        e.preventDefault()
        seek(0)
        return
      case 'video.goToEnd':
        e.preventDefault()
        seek(duration)
        return
      case 'video.toggleMute':
        e.preventDefault()
        toggleMute()
        return
      case 'video.toggleFullscreen':
        e.preventDefault()
        const videoContainer = document.querySelector('.video-container')
        if (videoContainer) {
          if (document.fullscreenElement) {
            document.exitFullscreen()
          } else {
            videoContainer.requestFullscreen()
          }
        }
        return
      case 'video.toggleLoop':
        e.preventDefault()
        setIsLooping(!isLooping)
        return

      // In/Out points
      case 'inout.setIn':
        e.preventDefault()
        if (videoElement) {
          setInPoint(videoElement.currentTime)
        }
        return
      case 'inout.setOut':
        e.preventDefault()
        if (videoElement) {
          setOutPoint(videoElement.currentTime)
        }
        return
      case 'inout.jumpToIn': {
        e.preventDefault()
        const inPoint = useVideoStore.getState().inPoint
        if (inPoint !== null) {
          seek(inPoint)
        }
        return
      }
      case 'inout.jumpToOut': {
        e.preventDefault()
        const outPoint = useVideoStore.getState().outPoint
        if (outPoint !== null) {
          seek(outPoint)
        }
        return
      }

      // Editing
      case 'edit.undo':
        e.preventDefault()
        undo()
        return
      case 'edit.redo':
        e.preventDefault()
        redo()
        return
      case 'edit.selectAll':
        e.preventDefault()
        if (canvas) {
          const objects = canvas.getObjects()
          if (objects.length > 0) {
            canvas.discardActiveObject()
            const selection = new fabric.ActiveSelection(objects, { canvas })
            canvas.setActiveObject(selection)
            canvas.renderAll()
          }
        }
        return
      case 'edit.delete':
        e.preventDefault()
        if (canvas) {
          const active = canvas.getActiveObjects()
          if (active.length > 0) {
            active.forEach((obj: fabric.Object) => canvas.remove(obj))
            canvas.discardActiveObject()
            canvas.renderAll()
          }
        }
        return
      case 'edit.deselect':
        e.preventDefault()
        if (canvas) {
          canvas.discardActiveObject()
          canvas.renderAll()
        }
        setCurrentTool('select')
        return
    }

    // Color presets
    if (action.startsWith('color.')) {
      const colorIndex = parseInt(action.split('.')[1]) - 1
      if (colorIndex >= 0 && colorIndex < PRESET_COLORS.length) {
        e.preventDefault()
        useToolStore.getState().setStrokeColor(PRESET_COLORS[colorIndex])
      }
    }
  }, [setCurrentTool, togglePlay, stepFrame, skip, seek, duration, setInPoint, setOutPoint, toggleMute, setIsLooping, isLooping, videoElement, undo, redo, canvas])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}
