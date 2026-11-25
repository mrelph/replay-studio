# Changelog

All notable changes to Replay Studio will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Drawing while the video plays now pauses on that frame and adds a freeze
  for you. The freeze lasts as long as the drawings need plus a second to
  read, however long you took to draw.
- Drawings on one frozen frame draw on one after another, in the order you
  drew them, live and in exported MP4s and GIFs. A frame set to Freeze 0 shows
  its drawings together.
- Pressing Play after drawing previews the freeze before the video resumes.
- "Stays" chips in the toolbar (Freeze only, 1s, 2s, 4s, To end) set how long
  drawings remain on screen, and re-time the drawings you have selected.
- Timeline bars snap to the playhead, freeze frames and whole frames. Hold Alt
  to skip snapping to the playhead and freeze frames; whole-frame snapping
  stays.

### Changed
- The inspector's Freeze field now edits the freeze on that frame, up to 30 s.
  0 keeps the frame freeze-free, and the new Auto button restores the
  calculated length. A length you type is kept as typed, not recalculated.

### Fixed
- A freeze recorded with H no longer lands one or two frames late.
- Undo after deleting all the words in a text brings the text back as it was,
  instead of an empty box.
- At some frame rates and clip lengths, an export that starts at the very
  beginning of the video could leave a drawing off its first frame when that
  frame has no freeze, and could leave out a one-frame (Freeze only) drawing
  entirely. Both now show.
- A magnifier's zoom in an export no longer starts a frame after its ring.

### Planned
- Audio waveform visualization in timeline
- Annotation data import/export (JSON format)
- Customizable keyboard shortcuts
- Plugin system for custom drawing tools
- Collaborative annotation features
- Cloud storage integration

## [1.7.0] - 2026-11-25

### Added
- Text options in the toolbar, shown while the Text tool is active or a text
  annotation is selected: size (12 to 128), bold, italic and underline.
- Font choice for text: Arial, Inter, Oswald, Roboto Slab and Marker. The
  bundled fonts look the same on Linux and Windows.
- Background plate for text: a rounded backing that keeps captions readable
  over busy video. It is dark under light text and light under dark text.

## [1.6.0] - 2026-11-25

### Added
- Drawings now draw themselves on along the stroke during playback and in
  exported MP4s and GIFs. Set the time per annotation with the new Draw-on
  field (0 turns it off).
- Outline, Glow and Clean annotation styles in the toolbar. Outline, the new
  default, keeps drawings readable on bright ice.

### Changed
- Arrowheads scale with stroke width.

## [1.5.1] - 2026-11-05

### Fixed
- The regular Export Video dialog now burns annotations into MP4 and GIF files,
  including timed fades, zoom lenses, and freeze frames. Annotations are included
  by default and can be turned off for a clean export.
- Source cut points stay aligned to source frames when the selected export frame
  rate differs from the video's frame rate.

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
