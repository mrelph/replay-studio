# Replay Studio

A professional desktop video markup application with telestrator-style drawing tools for creating annotations, highlights, and analysis overlays on video content.

## Overview

Replay Studio is an Electron-based application that allows users to load video files, draw annotations frame-by-frame, and export the results with drawings burned into the video. Perfect for sports analysis, video tutorials, coaching feedback, and content creation.

## Features

### Video Playback
- Load local video files (MP4, AVI, MOV, MKV, WebM)
- Frame-by-frame navigation with keyboard shortcuts
- Playback controls with variable speed
- Set In/Out points for clip selection
- Timeline scrubbing with visual feedback
- Drag-and-drop video loading
- Recent files history

### Drawing Tools
- **Select Tool (V)** - Select, move, and modify existing annotations
- **Pen (P)** - Freehand drawing with adjustable stroke width
- **Line (L)** - Draw straight lines
- **Arrow (A)** - Draw arrows with automatic arrowheads
- **Rectangle (R)** - Draw rectangular shapes
- **Circle (C)** - Draw circles and ellipses
- **Text (T)** - Add text annotations with custom styling
- **Spotlight (S)** - Highlight specific areas with a spotlight effect
- **Magnifier (M)** - Create magnification zones for detailed analysis
- **Player Tracker (K)** - Track player/object movement with crosshair markers

### Annotation Features
- Color picker with 10 preset colors
- Adjustable stroke width (2px to 16px)
- Time-based annotations (appear/disappear at specific times)
- Undo/Redo support
- Clear all annotations
- Layer management

### Export Capabilities
- Export to MP4 or GIF format
- Quality presets (High 1080p, Medium 720p, Low 480p)
- Frame rate selection (24, 30, 60 fps)
- Export full video or In/Out range only
- Toggle annotations on/off in export
- File size estimation

## Tech Stack

- **Electron** - Desktop application framework
- **React** - UI component library
- **TypeScript** - Type-safe JavaScript
- **Vite** - Fast build tool and dev server
- **Fabric.js** - HTML5 canvas library for drawing tools
- **Zustand** - Lightweight state management
- **Tailwind CSS** - Utility-first CSS framework
- **PostCSS** - CSS processing

## Installation

### Prerequisites
- Node.js 16+ and npm
- Git (for cloning the repository)

### Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd replay-studio
```

2. Install dependencies:
```bash
npm install
```

## Development

### Running in Development Mode

Start the development server with hot reload:

```bash
npm run dev
```

This will:
- Start the Vite dev server for the React frontend
- Launch Electron with the development build
- Enable hot module replacement (HMR)

### Project Structure

```
replay-studio/
├── src/
│   ├── components/
│   │   ├── Canvas/
│   │   │   ├── DrawingCanvas.tsx        # Main canvas component
│   │   │   └── tools/                   # Drawing tool implementations
│   │   ├── Export/
│   │   │   └── ExportDialog.tsx         # Export settings dialog
│   │   ├── Timeline/
│   │   │   └── AnnotationTimeline.tsx   # Video timeline
│   │   ├── Toolbar/
│   │   │   └── DrawingToolbar.tsx       # Tool selection sidebar
│   │   ├── VideoPlayer/
│   │   │   ├── VideoPlayer.tsx          # Video player component
│   │   │   └── VideoControls.tsx        # Playback controls
│   │   └── ShortcutsHelp.tsx           # Keyboard shortcuts modal
│   ├── hooks/
│   │   └── useKeyboardShortcuts.ts     # Global keyboard shortcuts
│   ├── stores/
│   │   ├── appStore.ts                 # Application state
│   │   ├── drawingStore.ts             # Annotations state
│   │   ├── toolStore.ts                # Drawing tools state
│   │   └── videoStore.ts               # Video playback state
│   ├── types/
│   │   └── electron.d.ts               # Electron type definitions
│   ├── App.tsx                         # Main application component
│   ├── main.tsx                        # React entry point
│   └── index.css                       # Global styles
├── electron/
│   ├── main.ts                         # Electron main process
│   └── preload.js                      # Electron preload script
├── dist-electron/                      # Electron build output
├── release/                            # Built application packages
├── package.json                        # Project dependencies
├── vite.config.ts                      # Vite configuration
├── tsconfig.json                       # TypeScript configuration
├── tailwind.config.js                  # Tailwind CSS configuration
└── postcss.config.js                   # PostCSS configuration
```

## Building

### Build for Production

Create production builds for distribution:

```bash
npm run build
```

This will:
1. Compile TypeScript to JavaScript
2. Build the React application with Vite
3. Package the Electron application with electron-builder
4. Output platform-specific installers to the `release/` directory

### Build Configuration

The build settings are configured in `package.json`:
- **App ID**: `com.replaystudio.app`
- **Product Name**: Replay Studio
- **Output Directory**: `release/`
- **Windows Target**: NSIS installer

## Keyboard Shortcuts

### Tools
- `V` - Select tool
- `P` - Pen (freehand draw)
- `L` - Line tool
- `A` - Arrow tool
- `R` - Rectangle tool
- `C` - Circle/Ellipse tool
- `T` - Text tool
- `S` - Spotlight tool
- `M` - Magnifier tool
- `K` - Player tracker

### Video Playback
- `Space` - Play / Pause
- `←` - Previous frame
- `→` - Next frame
- `J` - Step backward
- `K` - Pause
- `L` - Step forward
- `Home` - Go to start
- `End` - Go to end

### In/Out Points
- `I` - Set In point
- `O` - Set Out point
- `[` - Jump to In point
- `]` - Jump to Out point

### Editing
- `Ctrl+Z` - Undo
- `Ctrl+Y` - Redo
- `Ctrl+A` - Select all annotations
- `Delete` - Delete selected
- `Escape` - Deselect / Switch to Select tool

### Colors
- `1-9` - Quick color presets

### General
- `?` or `Shift+/` - Show keyboard shortcuts help
- `Escape` - Close modals/dialogs

## Usage Guide

### Loading Videos

1. **Drag and Drop**: Drag a video file directly into the application window
2. **Open Button**: Click "Open Video" in the header or use the file menu
3. **Recent Files**: Select from recently opened files on the welcome screen

### Drawing Annotations

1. Select a drawing tool from the left sidebar (or use keyboard shortcut)
2. Choose a color and stroke width
3. Click and drag on the video canvas to create the annotation
4. Annotations automatically have a time range (visible for 5 seconds by default)
5. Use the Select tool (V) to move or modify existing annotations

### Setting In/Out Points

1. Navigate to your desired start point
2. Press `I` to set the In point
3. Navigate to your desired end point
4. Press `O` to set the Out point
5. The timeline will show the selected range

### Exporting

1. Click the "Export" button in the header
2. Choose your format (MP4 or GIF)
3. Select quality and frame rate
4. Toggle In/Out range if desired
5. Choose whether to include annotations
6. Click "Export" and select save location

## Known Limitations

- Export functionality uses a simplified implementation; full FFmpeg integration is planned for future releases
- Player tracker and magnifier tools have basic implementations
- No support for audio-only annotations
- Limited video codec support (depends on Chromium/Electron support)

## Future Enhancements

- Full FFmpeg integration for production-quality exports
- Audio waveform visualization
- Multi-layer annotation support
- Import/export annotation data (JSON/XML)
- Customizable keyboard shortcuts
- Plugin system for custom tools
- Cloud storage integration
- Collaborative annotation features

## Development Notes

### State Management

The application uses Zustand for state management with four main stores:
- **appStore**: Application-level state (recent files, settings)
- **videoStore**: Video playback state (time, duration, in/out points)
- **toolStore**: Drawing tool state (current tool, colors, stroke width)
- **drawingStore**: Annotation state (canvas, annotations, undo/redo)

### Electron Architecture

- **Main Process** (`electron/main.ts`): Handles window creation, file dialogs, and system integration
- **Renderer Process** (`src/`): React application running in the browser window
- **Preload Script** (`electron/preload.js`): Secure bridge between main and renderer processes

### Custom Protocol

The application uses a custom `local-video://` protocol to serve local video files securely in the Electron environment.

## Troubleshooting

### Video Won't Load
- Ensure the video format is supported (MP4, WebM, MKV, AVI, MOV)
- Check that the file path doesn't contain special characters
- Try dragging and dropping the file instead of using the file picker

### Annotations Not Appearing
- Verify you're at the correct timestamp (annotations are time-based)
- Check that the annotation isn't selected (appears differently)
- Ensure you've completed the drawing gesture (click and drag, then release)

### Performance Issues
- Close other applications to free up system resources
- Reduce video quality/resolution if possible
- Clear all annotations and restart the application

## Contributing

Contributions are welcome! Please follow these guidelines:
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

[Add your license information here]

## Acknowledgments

- Built with [Electron](https://www.electronjs.org/)
- Canvas drawing powered by [Fabric.js](http://fabricjs.com/)
- UI components with [React](https://react.dev/)
- Styled with [Tailwind CSS](https://tailwindcss.com/)

---

**Replay Studio** - Professional video markup and annotation tool
