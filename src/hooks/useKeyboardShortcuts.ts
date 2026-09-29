import { useEffect, useCallback, useRef } from 'react'
import { useToolStore, PRESET_COLORS, type ToolType } from '@/stores/toolStore'
import { useVideoStore } from '@/stores/videoStore'
import { useDrawingStore } from '@/stores/drawingStore'
import { useClipStore } from '@/stores/clipStore'
import { useClipPrefsStore } from '@/stores/clipPrefsStore'
import { useShortcutsStore, type ShortcutAction } from '@/stores/shortcutsStore'
import { fabric } from '@/lib/fabric'
import { toast } from '@/components/ui'
import { stepFrames } from '@/utils/frames'

/**
 * Moves an In or Out edge by whole frames: the selected clip's edge when a
 * clip is selected, else the loose In/Out point. Pauses and parks the
 * playhead on the edge (for Out, the last frame still inside) so the
 * result is visible.
 */
function nudgeEdge(edge: 'in' | 'out', frames: number) {
  const video = useVideoStore.getState()
  const { fps, duration } = video
  video.shuttleStop()
  const clipState = useClipStore.getState()
  const clip = clipState.clips.find((c) => c.id === clipState.selectedClipId)

  let edgeTime: number
  if (clip) {
    const t = stepFrames(edge === 'in' ? clip.start : clip.end, frames, fps, duration)
    clipState.updateClip(clip.id, edge === 'in' ? { start: t } : { end: t })
    // updateClip rejects ranges below the minimum length; show where it really is.
    const updated = useClipStore.getState().clips.find((c) => c.id === clip.id) ?? clip
    edgeTime = edge === 'in' ? updated.start : updated.end
  } else {
    const point = edge === 'in' ? video.inPoint : video.outPoint
    if (point === null) {
      toast('info', `Select a clip or set ${edge === 'in' ? 'In (I)' : 'Out (O)'} first`)
      return
    }
    edgeTime = stepFrames(point, frames, fps, duration)
    if (edge === 'in') video.setInPoint(edgeTime)
    else video.setOutPoint(edgeTime)
  }
  video.seek(edge === 'in' ? edgeTime : stepFrames(edgeTime, -1, fps, duration))
}

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
  'tool.erase': 'erase',
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
  const { undo, redo, canvas, removeAnnotations } = useDrawingStore()
  // NLE convention: while the stop key (K) is held, J/L step single frames.
  const stopKeyHeldRef = useRef(false)

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
    if (action === 'video.pause') stopKeyHeldRef.current = true

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
        if (!e.repeat) useVideoStore.getState().shuttleStop()
        return
      case 'video.shuttleForward':
        e.preventDefault()
        if (stopKeyHeldRef.current) stepFrame('forward')
        else if (!e.repeat) useVideoStore.getState().shuttleForward()
        return
      case 'video.shuttleReverse':
        e.preventDefault()
        if (stopKeyHeldRef.current) stepFrame('backward')
        else if (!e.repeat) useVideoStore.getState().shuttleReverse()
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
      case 'video.toggleFullscreen': {
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
      }
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

      case 'trim.inBackward':
        e.preventDefault()
        nudgeEdge('in', -1)
        return
      case 'trim.inForward':
        e.preventDefault()
        nudgeEdge('in', 1)
        return
      case 'trim.outBackward':
        e.preventDefault()
        nudgeEdge('out', -1)
        return
      case 'trim.outForward':
        e.preventDefault()
        nudgeEdge('out', 1)
        return

      // Clips
      case 'clip.add': {
        e.preventDefault()
        const { inPoint: clipIn, outPoint: clipOut } = useVideoStore.getState()
        if (clipIn === null || clipOut === null) {
          toast('info', 'Set In (I) and Out (O) first')
          return
        }
        const stickyTags = useClipPrefsStore.getState().stickyTags
        const clip = useClipStore.getState().addClip(clipIn, clipOut, undefined, stickyTags)
        if (!clip) {
          toast('error', 'Clip range is too short')
          return
        }
        setInPoint(null)
        setOutPoint(null)
        return
      }

      case 'clip.markMoment': {
        e.preventDefault()
        // Read time straight off the <video> element rather than the (possibly
        // one tick stale) store value, so the clip lands on the exact moment
        // the key was pressed, including while playing. Doesn't pause or seek.
        const { videoElement: el, currentTime: storeTime, duration: videoDuration } = useVideoStore.getState()
        const t = el?.currentTime ?? storeTime
        const { preRoll, postRoll, stickyTags } = useClipPrefsStore.getState()
        const start = Math.max(0, t - preRoll)
        const end = Math.min(videoDuration, t + postRoll)
        const clip = useClipStore.getState().addClip(start, end, undefined, stickyTags)
        if (!clip) {
          toast('error', 'Clip range is too short')
          return
        }
        toast('success', `${clip.name} marked (−${preRoll}s / +${postRoll}s)`)
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
          const drawingState = useDrawingStore.getState()
          const activeObjects = new Set(active)
          const annotationIds = drawingState.annotations
            .filter((annotation) => activeObjects.has(annotation.object))
            .map((annotation) => annotation.id)

          // Timeline/layer selection may exist without a Fabric active object.
          if (annotationIds.length === 0 && drawingState.selectedAnnotationId) {
            annotationIds.push(drawingState.selectedAnnotationId)
          }

          removeAnnotations(annotationIds)
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
  }, [setCurrentTool, togglePlay, stepFrame, skip, seek, duration, setInPoint, setOutPoint, toggleMute, setIsLooping, isLooping, videoElement, undo, redo, canvas, removeAnnotations])

  useEffect(() => {
    const handleKeyUp = (e: KeyboardEvent) => {
      const stopKey = useShortcutsStore.getState().getShortcut('video.pause')?.binding.key
      if (e.key.toLowerCase() === stopKey) stopKeyHeldRef.current = false
    }
    const handleBlur = () => { stopKeyHeldRef.current = false }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleBlur)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleBlur)
    }
  }, [handleKeyDown])
}
