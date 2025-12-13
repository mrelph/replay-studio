import { useState, useCallback, useEffect } from 'react'
import VideoPlayer from './components/VideoPlayer/VideoPlayer'
import DrawingToolbar from './components/Toolbar/DrawingToolbar'
import DrawingCanvas from './components/Canvas/DrawingCanvas'
import ShortcutsHelp from './components/ShortcutsHelp'
import ShortcutsEditor from './components/ShortcutsEditor'
import AnnotationTimeline from './components/Timeline/AnnotationTimeline'
import ExportDialog from './components/Export/ExportDialog'
import LayerPanel from './components/LayerPanel/LayerPanel'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useAppStore } from './stores/appStore'
import { useVideoStore } from './stores/videoStore'
import { useDrawingStore } from './stores/drawingStore'
import { serializeProject, exportProjectToJSON, importProjectFromJSON, deserializeFabricObject } from './utils/projectSerializer'
import fabricModule from 'fabric'

// Handle CommonJS/ESM interop
const fabric: any = (fabricModule as any).fabric || fabricModule

function App() {
  const [videoSrc, setVideoSrc] = useState<string | null>(null)
  const [videoElement, setVideoElement] = useState<HTMLVideoElement | null>(null)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [showShortcutsEditor, setShowShortcutsEditor] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [showLayerPanel, setShowLayerPanel] = useState(true)
  const [dragOver, setDragOver] = useState(false)

  const { recentFiles, addRecentFile, removeRecentFile } = useAppStore()
  const { reset: resetVideo, inPoint, outPoint, setInPoint, setOutPoint } = useVideoStore()
  const { annotations, canvas, addAnnotation, clearAnnotations } = useDrawingStore()
  const [currentProjectPath, setCurrentProjectPath] = useState<string | null>(null)

  // Enable global keyboard shortcuts
  useKeyboardShortcuts()

  const loadVideo = useCallback((filePath: string) => {
    // Use custom protocol to serve local video files
    const encodedPath = encodeURIComponent(filePath)
    const videoUrl = `local-video://${encodedPath}`
    setVideoSrc(videoUrl)
    addRecentFile(filePath)
    resetVideo()
  }, [addRecentFile, resetVideo])

  const handleOpenFile = useCallback(async () => {
    if (window.electronAPI) {
      try {
        const filePath = await window.electronAPI.openFile()
        if (filePath) {
          loadVideo(filePath)
        }
      } catch (err) {
        console.error('Error opening file:', err)
      }
    }
  }, [loadVideo])

  const handleVideoRef = useCallback((video: HTMLVideoElement | null) => {
    setVideoElement(video)
  }, [])

  // Save project
  const handleSaveProject = useCallback(async () => {
    if (!window.electronAPI) return

    try {
      const defaultName = currentProjectPath || 'project.rsproj'
      const filePath = await window.electronAPI.saveProject(defaultName)
      if (!filePath) return

      // Get the actual video path from the URL
      let actualVideoPath: string | undefined
      if (videoSrc) {
        actualVideoPath = await window.electronAPI.resolveVideoPath(videoSrc)
      }

      const project = serializeProject(annotations, actualVideoPath, inPoint, outPoint)
      const json = exportProjectToJSON(project)

      const result = await window.electronAPI.writeFile(filePath, json)
      if (result.success) {
        setCurrentProjectPath(filePath)
        console.log('Project saved successfully')
      } else {
        console.error('Failed to save project:', result.error)
      }
    } catch (err) {
      console.error('Error saving project:', err)
    }
  }, [annotations, videoSrc, inPoint, outPoint, currentProjectPath])

  // Load project
  const handleLoadProject = useCallback(async () => {
    if (!window.electronAPI || !canvas) return

    try {
      const filePath = await window.electronAPI.loadProject()
      if (!filePath) return

      const result = await window.electronAPI.readFile(filePath)
      if (!result.success || !result.content) {
        console.error('Failed to read project file:', result.error)
        return
      }

      const project = importProjectFromJSON(result.content)

      // Load the video if specified
      if (project.videoPath) {
        loadVideo(project.videoPath)
      }

      // Set in/out points
      if (project.inPoint !== null) setInPoint(project.inPoint)
      if (project.outPoint !== null) setOutPoint(project.outPoint)

      // Clear existing annotations
      clearAnnotations()
      canvas.clear()

      // Recreate annotations from project
      for (const serializedAnn of project.annotations) {
        const fabricObj = deserializeFabricObject(fabric, serializedAnn.fabricData)
        canvas.add(fabricObj)

        addAnnotation({
          id: serializedAnn.id,
          object: fabricObj,
          startTime: serializedAnn.startTime,
          endTime: serializedAnn.endTime,
          layer: serializedAnn.layer,
          toolType: serializedAnn.toolType,
          fadeIn: serializedAnn.fadeIn,
          fadeOut: serializedAnn.fadeOut,
        })
      }

      canvas.renderAll()
      setCurrentProjectPath(filePath)
      console.log('Project loaded successfully')
    } catch (err) {
      console.error('Error loading project:', err)
    }
  }, [canvas, loadVideo, setInPoint, setOutPoint, clearAnnotations, addAnnotation])

  // Handle drag and drop (works without electronAPI)
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)

    const files = e.dataTransfer.files
    if (files.length > 0) {
      const file = files[0]
      // Electron adds a 'path' property to File objects
      const filePath = (file as File & { path?: string }).path

      // Check if it's a video file
      if (file.type.startsWith('video/') || /\.(mp4|avi|mov|mkv|webm)$/i.test(file.name)) {
        // In Electron, files have a path property
        if (filePath) {
          loadVideo(filePath)
        } else {
          // Fallback: create object URL
          const url = URL.createObjectURL(file)
          setVideoSrc(url)
          resetVideo()
        }
      }
    }
  }, [loadVideo, resetVideo])

  // Listen for menu events from Electron - run only once on mount
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.onFileOpened((filePath) => {
        loadVideo(filePath)
      })

      window.electronAPI.onExportClip(() => {
        setShowExport(true)
      })

      window.electronAPI.onShowShortcuts(() => {
        setShowShortcuts(true)
      })

      window.electronAPI.onSaveProject(() => {
        handleSaveProject()
      })

      window.electronAPI.onLoadProject(() => {
        handleLoadProject()
      })

      return () => {
        window.electronAPI.removeFileOpenedListener()
        window.electronAPI.removeExportClipListener()
        window.electronAPI.removeShowShortcutsListener()
        window.electronAPI.removeSaveProjectListener()
        window.electronAPI.removeLoadProjectListener()
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Toggle shortcuts help with ? key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === '?' || (e.key === '/' && e.shiftKey)) {
        setShowShortcuts((prev) => !prev)
      }
      if (e.key === 'Escape') {
        if (showShortcutsEditor) setShowShortcutsEditor(false)
        else if (showShortcuts) setShowShortcuts(false)
        if (showExport) setShowExport(false)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [showShortcuts, showShortcutsEditor, showExport])

  return (
    <div
      className="h-screen flex flex-col bg-gray-900"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {dragOver && (
        <div className="fixed inset-0 bg-blue-600/50 z-50 flex items-center justify-center pointer-events-none">
          <div className="text-white text-2xl font-bold">Drop video file here</div>
        </div>
      )}
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <h1 className="text-lg font-semibold text-white">Replay Studio</h1>
        <div className="flex items-center gap-2">
          {/* Project save/load */}
          <button
            onClick={handleLoadProject}
            className="p-2 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors"
            title="Load Project (Ctrl+Shift+O)"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
            </svg>
          </button>
          {annotations.length > 0 && (
            <button
              onClick={handleSaveProject}
              className="p-2 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors"
              title="Save Project (Ctrl+S)"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
            </button>
          )}
          <div className="w-px h-6 bg-gray-600 mx-1" />
          {videoSrc && (
            <button
              onClick={() => setShowExport(true)}
              className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded transition-colors"
            >
              Export
            </button>
          )}
          <button
            onClick={() => setShowShortcuts(true)}
            className="p-2 hover:bg-gray-700 rounded text-gray-400 hover:text-white transition-colors"
            title="Keyboard Shortcuts (?)"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
          <button
            onClick={handleOpenFile}
            className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded transition-colors"
          >
            Open Video
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Drawing toolbar */}
        <DrawingToolbar />

        {/* Video area */}
        <div className="flex-1 flex flex-col">
          {videoSrc ? (
            <div className="flex-1 flex min-h-0">
              <div className="flex-1 flex flex-col min-h-0">
                <div className="video-container flex-1 flex flex-col min-h-0 relative">
                  <VideoPlayer src={videoSrc} onVideoRef={handleVideoRef} />
                  {videoElement && <DrawingCanvas videoElement={videoElement} />}
                </div>
                <AnnotationTimeline />
              </div>
              {/* <LayerPanel isOpen={showLayerPanel} onToggle={() => setShowLayerPanel(!showLayerPanel)} /> */}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center max-w-md">
                <div className="text-6xl mb-4">🎬</div>
                <h2 className="text-xl font-medium text-gray-300 mb-2">
                  No video loaded
                </h2>
                <p className="text-gray-500 mb-6">
                  Drag and drop a video file, or click Open to start
                </p>
                <button
                  onClick={handleOpenFile}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
                >
                  Open Video File
                </button>

                {/* Recent files */}
                {recentFiles.length > 0 && (
                  <div className="mt-8">
                    <h3 className="text-sm font-medium text-gray-400 mb-3">Recent Files</h3>
                    <div className="space-y-1">
                      {recentFiles.slice(0, 5).map((file) => (
                        <div
                          key={file.path}
                          className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded cursor-pointer group"
                          onClick={() => loadVideo(file.path)}
                        >
                          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="text-sm text-gray-300 truncate flex-1 text-left">{file.name}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              removeRecentFile(file.path)
                            }}
                            className="p-1 opacity-0 group-hover:opacity-100 hover:bg-gray-600 rounded text-gray-400 hover:text-white transition-all"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <p className="text-gray-600 text-sm mt-6">
                  Press <kbd className="px-1.5 py-0.5 bg-gray-700 rounded text-gray-400">?</kbd> for keyboard shortcuts
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showShortcuts && (
        <ShortcutsHelp
          onClose={() => setShowShortcuts(false)}
          onOpenEditor={() => {
            setShowShortcuts(false)
            setShowShortcutsEditor(true)
          }}
        />
      )}
      {/* {showShortcutsEditor && (
        <ShortcutsEditor onClose={() => setShowShortcutsEditor(false)} />
      )} */}
      {showExport && videoSrc && (
        <ExportDialog onClose={() => setShowExport(false)} videoSrc={videoSrc} />
      )}
    </div>
  )
}

export default App
