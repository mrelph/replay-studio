# Replay Studio Architecture

This document provides an overview of the Replay Studio architecture, design decisions, and technical implementation details.

## Table of Contents

1. [Overview](#overview)
2. [Technology Stack](#technology-stack)
3. [Application Architecture](#application-architecture)
4. [State Management](#state-management)
5. [Component Structure](#component-structure)
6. [Electron Architecture](#electron-architecture)
7. [Drawing System](#drawing-system)
8. [Video Processing](#video-processing)
9. [Data Flow](#data-flow)
10. [Performance Considerations](#performance-considerations)

## Overview

Replay Studio is a desktop application built on Electron that combines video playback with real-time canvas-based drawing capabilities. The application follows a modern React architecture with TypeScript for type safety and Zustand for predictable state management.

### Key Design Principles

- **Separation of Concerns**: Clear boundaries between video playback, drawing, and UI
- **Reactive State**: Unidirectional data flow using Zustand stores
- **Type Safety**: TypeScript throughout for compile-time error detection
- **Performance**: Optimized rendering and state updates for smooth drawing
- **Modularity**: Self-contained components and tools

## Technology Stack

### Core Technologies

```
┌─────────────────────────────────────────┐
│           Electron v28+                  │
├─────────────────────────────────────────┤
│  React 18    │  TypeScript 5.3          │
│  Zustand 4   │  Fabric.js 5             │
│  Vite 5      │  Tailwind CSS 3          │
└─────────────────────────────────────────┘
```

### Build Tools

- **Vite**: Fast development server and build tool
- **electron-builder**: Application packaging and distribution
- **PostCSS**: CSS processing with Tailwind
- **TypeScript Compiler**: Type checking and transpilation

## Application Architecture

### High-Level Architecture

```
┌──────────────────────────────────────────────────────┐
│                 Electron Main Process                 │
│  - Window Management                                  │
│  - File System Access                                 │
│  - Custom Protocol Handler (local-video://)           │
│  - Menu Integration                                   │
└───────────────────┬──────────────────────────────────┘
                    │ IPC Communication
┌───────────────────┴──────────────────────────────────┐
│              Electron Renderer Process                │
│                                                        │
│  ┌──────────────────────────────────────────────┐   │
│  │            React Application                  │   │
│  │                                                │   │
│  │  ┌─────────────────────────────────────┐    │   │
│  │  │     Zustand State Stores            │    │   │
│  │  │  - videoStore                       │    │   │
│  │  │  - toolStore                        │    │   │
│  │  │  - drawingStore                     │    │   │
│  │  │  - appStore                         │    │   │
│  │  └─────────────────────────────────────┘    │   │
│  │                                                │   │
│  │  ┌─────────────────────────────────────┐    │   │
│  │  │      Component Tree                  │    │   │
│  │  │                                       │    │   │
│  │  │  App                                 │    │   │
│  │  │  ├─ VideoPlayer                     │    │   │
│  │  │  │  ├─ VideoControls                │    │   │
│  │  │  │  └─ DrawingCanvas (Fabric.js)    │    │   │
│  │  │  ├─ DrawingToolbar                  │    │   │
│  │  │  ├─ AnnotationTimeline              │    │   │
│  │  │  ├─ ShortcutsHelp                   │    │   │
│  │  │  └─ ExportDialog                    │    │   │
│  │  └─────────────────────────────────────┘    │   │
│  └──────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘
```

## State Management

Replay Studio uses Zustand for state management, organized into four domain-specific stores:

### Store Architecture

```typescript
┌─────────────────────────────────────────────────┐
│                  appStore                       │
│  - recentFiles: File[]                          │
│  - settings: AppSettings                        │
│  - addRecentFile()                              │
│  - removeRecentFile()                           │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│                 videoStore                      │
│  - videoElement: HTMLVideoElement | null        │
│  - isPlaying: boolean                           │
│  - currentTime: number                          │
│  - duration: number                             │
│  - inPoint: number | null                       │
│  - outPoint: number | null                      │
│  - play(), pause(), seek(), stepFrame()         │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│                  toolStore                      │
│  - currentTool: ToolType                        │
│  - strokeColor: string                          │
│  - fillColor: string                            │
│  - strokeWidth: number                          │
│  - setCurrentTool(), setStrokeColor()           │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│                drawingStore                     │
│  - canvas: fabric.Canvas | null                 │
│  - annotations: Annotation[]                    │
│  - undoStack: Annotation[][]                    │
│  - redoStack: Annotation[][]                    │
│  - addAnnotation(), undo(), redo()              │
└─────────────────────────────────────────────────┘
```

### Why Zustand?

- Minimal boilerplate compared to Redux
- No provider/wrapper components needed
- Built-in TypeScript support
- Excellent performance with selective subscriptions
- Simple API for beginners and powerful for experts

## Component Structure

### Component Hierarchy

```
App.tsx (Main container)
│
├─ Header
│  ├─ Logo
│  ├─ Export Button
│  ├─ Shortcuts Button
│  └─ Open Video Button
│
├─ Main Layout
│  │
│  ├─ DrawingToolbar (Left sidebar)
│  │  ├─ Tool Buttons (Select, Pen, Line, Arrow, etc.)
│  │  ├─ Color Picker
│  │  ├─ Stroke Width Selector
│  │  └─ Undo/Redo/Clear Buttons
│  │
│  └─ Video Area (Right main area)
│     │
│     ├─ VideoPlayer
│     │  ├─ <video> element
│     │  ├─ DrawingCanvas (Fabric.js canvas overlay)
│     │  └─ VideoControls
│     │     ├─ Play/Pause button
│     │     ├─ Timeline scrubber
│     │     ├─ In/Out markers
│     │     ├─ Time display
│     │     └─ Playback speed selector
│     │
│     └─ AnnotationTimeline
│        └─ Annotation markers with time ranges
│
└─ Modals
   ├─ ShortcutsHelp (? key)
   └─ ExportDialog (Export button)
```

### Component Responsibilities

#### App.tsx
- Top-level application container
- Video loading logic
- Drag-and-drop handling
- Modal state management
- Electron IPC event listeners

#### VideoPlayer.tsx
- Video element management
- Playback event handling
- Keyboard shortcut implementation
- Video state synchronization with store

#### DrawingCanvas.tsx
- Fabric.js canvas initialization
- Drawing tool implementation
- Mouse/touch event handling
- Annotation creation and management
- Canvas dimension synchronization with video

#### DrawingToolbar.tsx
- Tool selection UI
- Color and stroke width controls
- Undo/Redo buttons
- Clear annotations button

#### VideoControls.tsx
- Playback controls UI
- Timeline scrubbing
- In/Out point management
- Time display and formatting

## Electron Architecture

### Process Model

```
Main Process (electron/main.ts)
├─ Application lifecycle management
├─ Window creation and management
├─ Menu bar setup
├─ File dialog integration
├─ Custom protocol registration (local-video://)
└─ IPC handlers

Renderer Process (React App)
├─ UI rendering
├─ User interaction handling
├─ Video playback
├─ Canvas drawing
└─ State management

Preload Script (electron/preload.js)
└─ Secure IPC bridge between Main and Renderer
```

### Custom Protocol Handler

Replay Studio uses a custom `local-video://` protocol to securely serve local video files:

```javascript
// Main process registers protocol
protocol.registerFileProtocol('local-video', (request, callback) => {
  const filePath = decodeURIComponent(request.url.replace('local-video://', ''))
  callback({ path: filePath })
})

// Renderer uses protocol
<video src="local-video://C:/Users/username/video.mp4" />
```

This approach:
- Works around CORS restrictions
- Provides secure file access
- Maintains cross-platform compatibility

### IPC Communication

```
Main ←→ Renderer Communication

File Operations:
  Renderer → Main: openFile()
  Main → Renderer: onFileOpened(filePath)

Export Operations:
  Renderer → Main: saveFile(defaultName)
  Main → Renderer: returns savePath

Menu Actions:
  Main → Renderer: onExportClip()
  Main → Renderer: onShowShortcuts()
```

## Drawing System

### Fabric.js Integration

Replay Studio uses Fabric.js for canvas-based drawing:

```
Fabric.js Canvas
├─ Canvas Initialization
│  ├─ Match video dimensions
│  ├─ Overlay video element
│  └─ Configure drawing mode
│
├─ Drawing Tools
│  ├─ PencilBrush (Pen tool)
│  ├─ Line objects
│  ├─ Rectangle objects
│  ├─ Ellipse objects
│  ├─ IText objects (Text tool)
│  └─ Custom objects (Spotlight, Tracker)
│
└─ Event Handling
   ├─ mouse:down - Start drawing
   ├─ mouse:move - Update shape
   ├─ mouse:up - Complete drawing
   └─ path:created - Pen tool completion
```

### Annotation Data Structure

```typescript
interface Annotation {
  id: string                    // Unique identifier
  object: fabric.Object         // Fabric.js canvas object
  startTime: number             // When annotation appears (seconds)
  endTime: number               // When annotation disappears (seconds)
  layer: number                 // Z-index for layering
}
```

### Time-Based Annotation System

Annotations are automatically shown/hidden based on video time:

```typescript
// On video time update
annotations.forEach(annotation => {
  const isVisible = currentTime >= annotation.startTime
                 && currentTime <= annotation.endTime
  annotation.object.visible = isVisible
})
canvas.renderAll()
```

## Video Processing

### Supported Formats

- **MP4**: H.264/H.265 codecs (most common)
- **WebM**: VP8/VP9 codecs
- **MKV**: Matroska container
- **AVI**: Various codecs
- **MOV**: QuickTime format

Codec support depends on Chromium's built-in decoders.

### Frame-by-Frame Navigation

```typescript
// 30 fps frame duration
const FRAME_DURATION = 1 / 30

// Step forward one frame
videoElement.currentTime += FRAME_DURATION

// Step backward one frame
videoElement.currentTime -= FRAME_DURATION
```

### In/Out Point System

```typescript
// Set In point at current time
setInPoint(videoElement.currentTime)

// Set Out point at current time
setOutPoint(videoElement.currentTime)

// Calculate clip duration
const clipDuration = outPoint - inPoint
```

## Data Flow

### User Interaction Flow

```
User Action
    ↓
Event Handler (Component)
    ↓
Zustand Action
    ↓
State Update
    ↓
Component Re-render
    ↓
UI Update
```

### Drawing Flow Example

```
1. User selects Pen tool
   → toolStore.setCurrentTool('pen')

2. User draws on canvas
   → Canvas mouse events captured
   → Fabric.js creates Path object

3. Drawing completed
   → path:created event fired
   → drawingStore.addAnnotation()

4. Annotation stored with time range
   → annotations array updated
   → Canvas re-rendered with new annotation
```

### Video Playback Flow

```
1. User clicks Play
   → VideoPlayer calls videoElement.play()

2. Video starts playing
   → 'play' event fired
   → videoStore.setIsPlaying(true)

3. Time updates
   → 'timeupdate' event fired continuously
   → videoStore.setCurrentTime(currentTime)

4. Annotations updated
   → DrawingCanvas watches currentTime
   → Shows/hides annotations based on time
   → canvas.renderAll()
```

## Performance Considerations

### Optimization Strategies

1. **Selective Re-rendering**
   - Components only subscribe to needed store values
   - Zustand prevents unnecessary re-renders
   - React.memo for pure components

2. **Canvas Performance**
   - Fabric.js object pooling
   - RequestAnimationFrame for smooth updates
   - Debounced resize handlers

3. **Video Performance**
   - Hardware-accelerated video decoding
   - Efficient time update handling
   - Throttled timeline scrubbing

4. **State Updates**
   - Batch multiple state changes
   - Avoid deep object mutations
   - Use functional updates for arrays

### Memory Management

```typescript
// Cleanup on component unmount
useEffect(() => {
  // Setup
  return () => {
    // Cleanup canvas, event listeners, etc.
    canvas.dispose()
    fabricRef.current = null
  }
}, [])
```

### Event Handling

- Use event delegation where possible
- Debounce expensive operations (resize, scrubbing)
- Throttle high-frequency events (mousemove)
- Remove listeners on cleanup

## Future Architecture Considerations

### Planned Improvements

1. **Worker Threads**
   - Offload heavy computations to Web Workers
   - FFmpeg processing in separate thread
   - Annotation data processing

2. **Lazy Loading**
   - Code-split drawing tools
   - Dynamic import of heavy dependencies
   - Progressive feature loading

3. **Caching Strategy**
   - Cache rendered frames
   - Memoize expensive calculations
   - IndexedDB for annotation persistence

4. **Plugin System**
   - Define plugin API
   - Hot-load custom tools
   - Third-party extensions

---

This architecture document is a living document and will be updated as the application evolves.
