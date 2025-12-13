import { useEffect, useCallback } from 'react'
import { useToolStore, type ToolType } from '@/stores/toolStore'
import { useVideoStore } from '@/stores/videoStore'
import { useDrawingStore } from '@/stores/drawingStore'

const TOOL_SHORTCUTS: Record<string, ToolType> = {
  v: 'select',
  p: 'pen',
  a: 'arrow',
  r: 'rectangle',
  c: 'circle',
  t: 'text',
  s: 'spotlight',
}

export function useKeyboardShortcuts() {
  const { setCurrentTool, currentTool } = useToolStore()
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
    const isCtrlOrCmd = e.ctrlKey || e.metaKey

    // Ctrl/Cmd shortcuts
    if (isCtrlOrCmd) {
      switch (key) {
        case 'z':
          e.preventDefault()
          if (e.shiftKey) {
            redo()
          } else {
            undo()
          }
          return
        case 'y':
          e.preventDefault()
          redo()
          return
        case 'a':
          e.preventDefault()
          // Select all objects on canvas
          if (canvas) {
            const objects = canvas.getObjects()
            if (objects.length > 0) {
              canvas.discardActiveObject()
              // Use fabric.ActiveSelection
              const { fabric } = require('fabric')
              const selection = new fabric.ActiveSelection(objects, { canvas })
              canvas.setActiveObject(selection)
              canvas.renderAll()
            }
          }
          return
        case 'delete':
        case 'backspace':
          e.preventDefault()
          // Delete selected objects
          if (canvas) {
            const active = canvas.getActiveObjects()
            active.forEach((obj) => canvas.remove(obj))
            canvas.discardActiveObject()
            canvas.renderAll()
          }
          return
      }
    }

    // Tool shortcuts (single key)
    if (!isCtrlOrCmd && !e.altKey) {
      // Tool selection
      if (TOOL_SHORTCUTS[key]) {
        e.preventDefault()
        setCurrentTool(TOOL_SHORTCUTS[key])
        return
      }

      // Shift + key for tools that conflict with video controls
      if (e.shiftKey) {
        switch (key) {
          case 'l':
            e.preventDefault()
            setCurrentTool('line')
            return
          case 'm':
            e.preventDefault()
            setCurrentTool('magnifier')
            return
          case 'k':
            e.preventDefault()
            setCurrentTool('tracker')
            return
        }
      }

      // Video control shortcuts
      switch (key) {
        case ' ':
          e.preventDefault()
          togglePlay()
          return
        case 'arrowleft':
          e.preventDefault()
          stepFrame('backward')
          return
        case 'arrowright':
          e.preventDefault()
          stepFrame('forward')
          return
        case 'j':
          e.preventDefault()
          skip(-10)
          return
        case 'k':
          e.preventDefault()
          if (videoElement) {
            videoElement.pause()
          }
          return
        case 'l':
          e.preventDefault()
          if (e.shiftKey) {
            setIsLooping(!isLooping)
          } else {
            skip(10)
          }
          return
        case 'm':
          e.preventDefault()
          toggleMute()
          return
        case 'f':
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
        case 'i':
          e.preventDefault()
          if (videoElement) {
            setInPoint(videoElement.currentTime)
          }
          return
        case 'o':
          e.preventDefault()
          if (videoElement) {
            setOutPoint(videoElement.currentTime)
          }
          return
        case '[':
          e.preventDefault()
          const inPoint = useVideoStore.getState().inPoint
          if (inPoint !== null) {
            seek(inPoint)
          }
          return
        case ']':
          e.preventDefault()
          const outPoint = useVideoStore.getState().outPoint
          if (outPoint !== null) {
            seek(outPoint)
          }
          return
        case 'home':
          e.preventDefault()
          seek(0)
          return
        case 'end':
          e.preventDefault()
          seek(duration)
          return
        case 'delete':
        case 'backspace':
          e.preventDefault()
          if (canvas) {
            const active = canvas.getActiveObjects()
            if (active.length > 0) {
              active.forEach((obj) => canvas.remove(obj))
              canvas.discardActiveObject()
              canvas.renderAll()
            }
          }
          return
        case 'escape':
          e.preventDefault()
          if (canvas) {
            canvas.discardActiveObject()
            canvas.renderAll()
          }
          setCurrentTool('select')
          return
      }
    }

    // Number keys for color presets
    if (!isCtrlOrCmd && !e.altKey && /^[1-9]$/.test(key)) {
      const colorIndex = parseInt(key) - 1
      const presetColors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ffffff', '#000000', '#ff8000']
      if (colorIndex < presetColors.length) {
        e.preventDefault()
        useToolStore.getState().setStrokeColor(presetColors[colorIndex])
      }
    }
  }, [setCurrentTool, currentTool, togglePlay, stepFrame, skip, seek, duration, setInPoint, setOutPoint, toggleMute, setIsLooping, isLooping, videoElement, undo, redo, canvas])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}
