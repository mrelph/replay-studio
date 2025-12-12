# Changelog

All notable changes to Replay Studio will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- Full FFmpeg integration for production-quality video export
- Audio waveform visualization in timeline
- Annotation data import/export (JSON format)
- Customizable keyboard shortcuts
- Plugin system for custom drawing tools
- Collaborative annotation features
- Cloud storage integration

## [1.0.0] - 2024-XX-XX

### Added
- Initial release of Replay Studio
- Video playback support for MP4, AVI, MOV, MKV, and WebM formats
- Drag-and-drop video loading
- Recent files history
- Frame-by-frame video navigation
- Playback speed controls
- In/Out point markers for clip selection
- Timeline scrubbing with visual feedback

#### Drawing Tools
- Select tool for manipulating annotations
- Pen tool for freehand drawing
- Line tool for straight lines
- Arrow tool with automatic arrowheads
- Rectangle and circle shape tools
- Text annotation tool
- Spotlight tool for highlighting areas
- Magnifier tool for zoom analysis
- Player tracker with crosshair markers

#### Annotation Features
- Time-based annotations (appear/disappear automatically)
- Color picker with 10 preset colors
- Adjustable stroke width (2px-16px)
- Undo/Redo support
- Clear all annotations function
- Annotation timeline visualization

#### Export Features
- Export to MP4 or GIF format
- Quality presets (High 1080p, Medium 720p, Low 480p)
- Frame rate selection (24, 30, 60 fps)
- Export full video or In/Out range
- Toggle annotations in export
- File size estimation

#### Keyboard Shortcuts
- Tool selection shortcuts (V, P, L, A, R, C, T, S, M, K)
- Playback controls (Space, Arrow keys, J/K/L, Home/End)
- In/Out point shortcuts (I, O, [, ])
- Editing shortcuts (Ctrl+Z, Ctrl+Y, Delete, Escape)
- Quick color selection (1-9)
- Help dialog (? key)

#### Technical Features
- Electron-based desktop application
- React + TypeScript frontend
- Fabric.js canvas integration
- Zustand state management
- Tailwind CSS styling
- Custom local-video:// protocol for secure video loading
- Hot module replacement in development mode

### Known Issues
- Export uses simplified implementation; full FFmpeg integration pending
- Player tracker has basic interpolation
- Limited codec support (depends on Chromium)
- No audio-only annotation support

---

## Version History

### [1.0.0] - Initial Release
First public release of Replay Studio with core video markup and annotation features.

---

**Note**: This project is under active development. Features and functionality may change between versions.
