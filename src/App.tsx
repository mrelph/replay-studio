import { useState, useCallback, useEffect, useRef } from 'react'
import { Film, FolderOpen, Save, HelpCircle, X, Sun, Moon, Monitor, Layers, PenTool, Users, Download, Presentation } from 'lucide-react'
import VideoPlayer from './components/VideoPlayer/VideoPlayer'
import DrawingToolbar from './components/Toolbar/DrawingToolbar'
import DrawingCanvas from './components/Canvas/DrawingCanvas'
import ShortcutsHelp from './components/ShortcutsHelp'
import ShortcutsEditor from './components/ShortcutsEditor'
import AnnotationTimeline from './components/Timeline/AnnotationTimeline'
import ExportDialog from './components/Export/ExportDialog'
import LayerPanel from './components/LayerPanel/LayerPanel'
import { Button, IconButton, Kbd, ToastContainer, toast } from './components/ui'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useAudienceStream } from './hooks/useAudienceStream'
import { useAppStore } from './stores/appStore'
import { useVideoStore } from './stores/videoStore'
import { useDrawingStore } from './stores/drawingStore'
import { useAudienceStore } from './stores/audienceStore'
import { useThemeStore } from './stores/themeStore'
import { serializeProject, exportProjectToJSON, importProjectFromJSON, deserializeFabricObject } from './utils/projectSerializer'
import { useWaveformStore } from './stores/waveformStore'
import { ToolRegistry as _ToolRegistry } from './plugins/ToolRegistry'
export const toolRegistry = _ToolRegistry
import fabricModule from 'fabric'

// Handle CommonJS/ESM interop
const fabric: any = (fabricModule as any).fabric || fabricModule

function ThemeToggle() {
  const { theme, setTheme } = useThemeStore()

  const cycleTheme = () => {
    if (theme === 'dark') setTheme('light')
    else if (theme === 'light') setTheme('system')
    else setTheme('dark')
  }

  return (
    <IconButton onClick={cycleTheme} title={`Theme: ${theme}`}>
      {theme === 'dark' ? <Moon className="w-4 h-4" /> :
       theme === 'light' ? <Sun className="w-4 h-4" /> :
       <Monitor className="w-4 h-4" />}
    </IconButton>
  )
}

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
  const { isAudienceOpen, openAudienceView, closeAudienceView, setAudienceOpen } = useAudienceStore()
  const [currentProjectPath, setCurrentProjectPath] = useState<string | null>(null)

  // Enable global keyboard shortcuts
  useKeyboardShortcuts()

  // Stream composited frames to audience window when open
  useAudienceStream({ videoElement, fabricCanvas: canvas })

  const loadVideo = useCallback((filePath: string) => {
    // Use custom protocol to serve local video files
    const encodedPath = encodeURIComponent(filePath)
    const videoUrl = `local-video://${encodedPath}`
    setVideoSrc(videoUrl)
    addRecentFile(filePath)
    resetVideo()
    // Decode audio for waveform display (uses streaming, not full file load)
    useWaveformStore.getState().decodeAudio(videoUrl)
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
        toast('success', 'Project saved')
      } else {
        toast('error', `Failed to save project: ${result.error}`)
      }
    } catch (err) {
      toast('error', 'Error saving project')
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
        toast('error', `Failed to read project file: ${result.error}`)
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
      toast('success', 'Project loaded')
    } catch (err) {
      toast('error', 'Error loading project')
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

  // Refs to hold the latest callback versions so IPC listeners are never stale
  const loadVideoRef = useRef(loadVideo)
  const handleSaveProjectRef = useRef(handleSaveProject)
  const handleLoadProjectRef = useRef(handleLoadProject)
  useEffect(() => { loadVideoRef.current = loadVideo }, [loadVideo])
  useEffect(() => { handleSaveProjectRef.current = handleSaveProject }, [handleSaveProject])
  useEffect(() => { handleLoadProjectRef.current = handleLoadProject }, [handleLoadProject])

  // Listen for menu events from Electron - register once, delegate through refs
  useEffect(() => {
    if (window.electronAPI) {
      window.electronAPI.onFileOpened((filePath) => {
        loadVideoRef.current(filePath)
      })

      window.electronAPI.onExportClip(() => {
        setShowExport(true)
      })

      window.electronAPI.onShowShortcuts(() => {
        setShowShortcuts(true)
      })

      window.electronAPI.onSaveProject(() => {
        handleSaveProjectRef.current()
      })

      window.electronAPI.onLoadProject(() => {
        handleLoadProjectRef.current()
      })

      window.electronAPI.onAudienceReady(() => {
        useAudienceStore.getState().setAudienceOpen(true)
      })

      window.electronAPI.onAudienceClosed(() => {
        useAudienceStore.getState().setAudienceOpen(false)
      })

      return () => {
        window.electronAPI.removeFileOpenedListener()
        window.electronAPI.removeExportClipListener()
        window.electronAPI.removeShowShortcutsListener()
        window.electronAPI.removeSaveProjectListener()
        window.electronAPI.removeLoadProjectListener()
        window.electronAPI.removeAudienceReadyListener()
        window.electronAPI.removeAudienceClosedListener()
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
      className="h-screen flex flex-col bg-surface-base"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {dragOver && (
        <div className="fixed inset-0 bg-accent/20 border-2 border-dashed border-accent z-50 flex items-center justify-center pointer-events-none">
          <div className="text-text-primary text-2xl font-bold">Drop video file here</div>
        </div>
      )}
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 bg-surface-elevated border-b border-border-subtle shadow-sm">
        <div className="flex items-center gap-2">
          <Film className="w-4 h-4 text-text-tertiary" />
          <span className="text-sm text-text-secondary font-medium">Replay Studio</span>
        </div>
        <div className="flex items-center gap-1.5">
          {/* Project save/load */}
          <IconButton
            onClick={handleLoadProject}
            title="Load Project (Ctrl+Shift+O)"
          >
            <FolderOpen className="w-4 h-4" />
          </IconButton>
          {annotations.length > 0 && (
            <IconButton
              onClick={handleSaveProject}
              title="Save Project (Ctrl+S)"
            >
              <Save className="w-4 h-4" />
            </IconButton>
          )}
          <div className="w-px h-5 bg-border-subtle mx-0.5" />
          {videoSrc && (
            <>
              <IconButton
                onClick={() => setShowLayerPanel(!showLayerPanel)}
                title="Toggle Layer Panel"
                className={showLayerPanel ? 'text-accent' : ''}
              >
                <Layers className="w-4 h-4" />
              </IconButton>
              <Button
                onClick={() => isAudienceOpen ? closeAudienceView() : openAudienceView()}
                variant={isAudienceOpen ? 'danger' : 'secondary'}
                size="sm"
                title="Toggle Audience View (Ctrl+Shift+A)"
              >
                {isAudienceOpen ? 'Close Audience' : 'Audience View'}
              </Button>
              <Button
                onClick={() => setShowExport(true)}
                size="sm"
                className="bg-success hover:brightness-90 text-white"
              >
                Export
              </Button>
            </>
          )}
          <ThemeToggle />
          <IconButton
            onClick={() => setShowShortcuts(true)}
            title="Keyboard Shortcuts (?)"
          >
            <HelpCircle className="w-4 h-4" />
          </IconButton>
          <Button onClick={handleOpenFile} size="sm">
            Open Video
          </Button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {videoSrc ? (
          <>
            <div className="flex-1 flex min-h-0 relative">
              <div className="flex-1 flex flex-col min-h-0">
                <div className="video-container flex-1 flex flex-col min-h-0 relative">
                  <VideoPlayer src={videoSrc} onVideoRef={handleVideoRef} />
                  {videoElement && <DrawingCanvas videoElement={videoElement} />}
                </div>
              </div>
              <LayerPanel isOpen={showLayerPanel} onToggle={() => setShowLayerPanel(!showLayerPanel)} />
            </div>
            <DrawingToolbar />
            <AnnotationTimeline />
          </>
        ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center max-w-lg">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-surface-elevated border border-border-subtle flex items-center justify-center">
                  <Film className="w-8 h-8 text-text-tertiary" />
                </div>
                <h2 className="text-xl font-medium text-text-primary mb-2">
                  Replay Studio
                </h2>
                <p className="text-text-tertiary mb-6">
                  Drag and drop a video file, or click Open to start
                </p>
                <Button onClick={handleOpenFile} size="lg">
                  Open Video File
                </Button>

                {/* Feature cards */}
                <div className="grid grid-cols-2 gap-3 mt-8">
                  {[
                    { icon: PenTool, title: 'Draw & Annotate', desc: 'Freehand, arrows, shapes, and text overlays' },
                    { icon: Users, title: 'Player Tracking', desc: 'Spotlight, magnifier, and motion tracking' },
                    { icon: Download, title: 'Export Clips', desc: 'MP4 and animated GIF with annotations' },
                    { icon: Presentation, title: 'Present Live', desc: 'Audience view with laser pointer' },
                  ].map(({ icon: Icon, title, desc }) => (
                    <div
                      key={title}
                      className="flex items-start gap-3 p-3 bg-surface-elevated border border-border-subtle rounded-lg text-left"
                    >
                      <div className="p-2 rounded-lg bg-accent/10 text-accent flex-shrink-0">
                        <Icon className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-sm font-medium text-text-primary">{title}</div>
                        <div className="text-xs text-text-tertiary mt-0.5">{desc}</div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Recent files */}
                {recentFiles.length > 0 && (
                  <div className="mt-8">
                    <h3 className="text-sm font-medium text-text-tertiary mb-3">Recent Files</h3>
                    <div className="space-y-1">
                      {recentFiles.slice(0, 5).map((file) => (
                        <div
                          key={file.path}
                          className="flex items-center gap-2 px-3 py-2 bg-surface-elevated hover:bg-surface-sunken border border-border-subtle rounded-lg cursor-pointer group transition-colors"
                          onClick={() => loadVideo(file.path)}
                        >
                          <Film className="w-4 h-4 text-text-disabled flex-shrink-0" />
                          <span className="text-sm text-text-secondary truncate flex-1 text-left">{file.name}</span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              removeRecentFile(file.path)
                            }}
                            className="p-1 opacity-0 group-hover:opacity-100 hover:bg-error-subtle rounded text-text-tertiary hover:text-error transition-all"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <p className="text-text-disabled text-sm mt-6">
                  Press <Kbd>?</Kbd> for keyboard shortcuts
                </p>
              </div>
            </div>
          )}
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
      {showExport && videoSrc && (
        <ExportDialog onClose={() => setShowExport(false)} videoSrc={videoSrc} />
      )}

      <ToastContainer />
    </div>
  )
}

export default App
