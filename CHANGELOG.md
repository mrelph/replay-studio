# Changelog

All notable changes to Replay Studio will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- Annotation data import/export (JSON format)
- Plugin system for custom drawing tools
- Collaborative annotation features
- Cloud storage integration

## [1.9.2] - 2026-11-26

### Added
- Four colour themes beside Dark, Light and System: Broadcast Night, Floodlit
  Pitch, Arena Ice and Courtside. Pick one from the theme menu in the header.
- An export folder setting. Exports go to Downloads by default. File → Export
  Folder… picks another folder, and Reset Export Folder to Downloads puts it
  back. Clip and reel exports show where they will save, with a Change… button,
  and no longer ask for a folder every time.
- Double-click a callout to edit its text. Long callout labels wrap at word
  boundaries.
- Shift+Cmd+Z (Shift+Ctrl+Z) redoes, as well as the existing redo shortcut.

### Changed
- A new drawing stays on screen for 1.5 seconds by default.
- Timeline bars that overlap in time never share a row. The timeline grows to
  eight rows, then scrolls and shows how many rows are hidden. Double-click the
  resize handle to go back to automatic height.
- Undo and redo cover slow-motion regions: adding, moving, resizing, deleting
  and changing speed.
- The drawing toolbar and video controls wrap onto a second row in a narrow
  window instead of running off the edge.

### Fixed
- A freeze inside a slow-motion or 2x region no longer makes the frame step
  uneven on either side of it, on replay or in exports.
- Opening a different video clears the undo history, so Undo can no longer
  bring back regions from the previous video.
- Escape closes every dialog, and no longer cancels an export that is running.
- The Clear All confirmation opens over the whole app instead of inside the
  toolbar.
- The Clips and Layers panels stay below the toolbar when it wraps.

## [1.9.1] - 2026-11-25

### Changed
- Updated Electron to 44.11.6 and other dependencies to pick up security fixes.
- The README now matches the current app, and the changelog covers 1.1.0 to
  1.5.0.

## [1.9.0] - 2026-11-25

### Added
- A macOS build (Apple silicon) is published with each release. It is a manual
  download and does not update itself yet; see RELEASING.md for the first-launch
  step macOS asks for.
- Slow motion. Hold W while the video plays (or press and hold the Slow button
  beside Freeze) and playback drops to 50% with the sound muted. Release to
  save that stretch as a slow-motion region. A tap under about a third of a
  second records nothing.
- Slow motion eases in and out over about a quarter of a second at each end of
  a region, on replay and in exports.
- Regions show on a Speed lane in the timeline (it appears once you have one).
  Drag a band to move it, drag an end to resize it, click it and pick 25%, 50%,
  75% or 2x, or delete it with the Delete button or the Delete / Backspace key.
  Regions never overlap: placing one over another trims the other.
- While the playhead is inside a region, a badge beside the speed dropdown
  shows the region's speed. The dropdown is still your own playback speed and
  multiplies with it.
- Exported MP4s and GIFs play each region at its speed and are silent during
  it. Drawings keep their normal draw-on and fade timing inside slow motion.
  "Stays 2s" still means two seconds of the play, which lasts longer on screen
  when slowed, and freezes inside a region hold for their usual length.
- Slow motion repeats frames rather than inventing new ones, so 60 fps footage
  looks smoother than 30 fps. Speed regions are saved in the project file.
  They are not part of Undo yet.

- Player Ring (`G`, in a new Field group of the toolbar). Press on a player's
  skates and drag outward. A flattened ring with a faint fill appears as if lying
  on the ice; a plain click makes a standard-size ring. The edge draws on, then
  the fill fades in. The ring's tilt is fixed.
- Zone (`Z`). Click each corner of an area and finish with a double-click,
  Enter, or a click on the first corner. Backspace removes the last corner and
  Escape cancels; it needs at least three corners. The area fills with a
  translucent tint of the current colour and fades in. While you place corners,
  other shortcut keys are ignored (menu shortcuts with Ctrl/Cmd still work), and
  starting playback, seeking or switching tools cancels the zone.
- Solid / Dashed switch (`D`, a Line control beside Style) for line, arrow, arc
  arrow and pen. It applies to new drawings and to selected ones (one Undo
  step). Dashes scale with the stroke width, draw on along the line, and do not
  stretch when you resize it; arrowheads stay solid. Use dashed for a pass or a
  skating route.
- Callout (`Shift+T`). Press on the thing you are naming, drag to where the
  label should sit, release and type; click away or press Escape to finish. You
  get a dot on the target, a leader line and a label on a background plate,
  using the current text options. You can pick a colour, size, style, line or
  Stays chip while typing and carry on typing; the label shows the new colour
  at once. Pressing Play or moving the playhead to another frame finishes the
  callout on the frame where you started it. An empty label is discarded. The
  words cannot be edited afterwards (delete it and make a new one); it can be
  moved, restyled and re-timed like other drawings.
- The new tools work with automatic freeze and drawn-order reveal, Stays chips,
  Outline / Glow / Clean (on a ring or zone these apply to the edge only, so the
  inside stays a clean tint), slow-motion regions, Undo / Redo, saving and
  loading, and MP4 and GIF export.

### Changed
- A newly opened video now starts muted when the mute button shows muted.
  Before, it played with sound while the button showed muted.
- Recolouring a ring, zone or spotlight in the timeline's colour picker now keeps
  it see-through. Before, a spotlight turned solid.

### Fixed
- The text tool now uses the font you pick. It was always Arial.
- Arrowheads keep their position and angle after a project is saved and
  reloaded.
- Round line ends and corner joins on lines and pen strokes are kept when a
  project is reloaded. They used to come back square.
- A drawing the app cannot read is skipped, with a message saying how many,
  instead of loading as a small rectangle.

## [1.8.0] - 2026-11-25

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

## [1.5.0] - 2026-10-08

### Added
- Highlight reel. Choose Export reel in the Clips panel to join clips into one
  MP4. It starts from the panel's tag filter; you can rename the reel, untick
  clips, reorder them (drag, or use the up and down buttons), and add a title
  card before each clip showing its name and tags. Each clip becomes a chapter
  in the file, and freezes and drawings come through as in a single-clip export.
  A progress view with Cancel and Show in folder follows. You can also save the
  individual clips (with editable copies and clips.csv) in the same run.

## [1.4.0] - 2026-10-07

### Changed
- Freeze and hold are now one Freeze control beside Play. It stops on the
  current frame and times it; pressing Freeze again or Play records a freeze
  of that length. Plain Pause never records a freeze, seeking away cancels it,
  and frame steps are allowed. H keeps its key, and a custom binding carries
  over. The separate hold length setting and toolbar popover are gone. Project
  files are unchanged.

### Fixed
- Drawings stay aligned with the video when it moves without resizing, such as
  when a panel opens or the window is retiled. Before, they looked right on
  screen but were saved offset, so burned-in exports showed them misplaced.

## [1.3.0] - 2026-10-05

### Added
- Frame-accurate editing. The app reads the video's real frame rate when you
  open it, and frame stepping, nudges and the mm:ss:ff timecode use it instead
  of a fixed 30 fps.
- J / K / L shuttle. L plays and doubles speed up to 8x, J plays in reverse and
  doubles, K stops, and holding K with J or L steps single frames. The reverse
  speed shows next to the timecode.
- Alt+Left / Alt+Right nudge the In point by one frame and Alt+Shift+Left /
  Alt+Shift+Right nudge the Out point, for the selected clip or else the loose
  In / Out points.
- Holds. H on a paused frame freezes it for a set time (H again removes it).
  Shift+H records your pauses as holds, each lasting as long as you paused.

### Changed
- Skip 10 seconds moved from J / L to Shift+Left / Shift+Right.

### Fixed
- Playback now resumes after a live hold, and seeking while playing no longer
  snaps back to an earlier hold.
- Exports no longer start or freeze one frame late: a clip begins on the In
  frame, holds freeze the paused frame, and the clip ends on the last frame
  before Out.

## [1.2.0] - 2026-09-29

### Added
- Quick clip marking. Press X to clip a stretch around the playhead without
  pausing or seeking (8 seconds before and 4 seconds after by default; both are
  adjustable in the Clips panel).
- Tags and notes on clips. Tags show as chips on each clip, a tag filter bar
  narrows the list, and sticky tags are applied to every new clip.
- Hovering a clip bar in the timeline shows its name, times and tags.
- Exported clip files are named with the clip's tags, and each export run also
  writes a clips.csv listing the clips.
- Export Clips can select clips by tag.

## [1.1.1] - 2026-09-29

### Fixed
- Cancelling an export on Windows now removes the partly written video instead
  of leaving it behind.

## [1.1.0] - 2026-09-29

### Added
- Clips. Press Shift+C to turn the current In / Out range into a named clip.
  A Clips panel lists them with rename, jump, loop, reorder and delete, and
  clips show as coloured bars on the timeline that you can click to jump to or
  drag the ends of to adjust. Clips are saved in the project file.
- Export Clips. Export any number of clips in one run, each as its own MP4 with
  drawings burned in, plus an optional clean copy and a project file you can
  reopen and keep editing. Drawing fades, magnifiers and frame freezes carry
  through to the export. Exports refuse to overwrite the source video.
- Automatic updates for the Linux (AppImage) and Windows builds. The app checks
  on launch and every four hours, downloads in the background and offers a
  Restart now / Later banner; Help > Check for Updates also works. It never
  interrupts an export.
- An app icon.
- Project save and load, a layers panel with visibility and lock controls, an
  Erase tool, freeze-frame drawings that pause playback for a set time, a theme
  system with a refreshed interface, and a loop toggle with playback speed
  controls.

### Changed
- The player tracker, audience view and laser pointer were added during
  development (the audience view and laser pointer first, the tracker later
  reworked) and are hidden from the interface (code kept).
- Electron was upgraded from 28 to 44.
- The app is more locked down: the interface can only read and write video and
  project files you picked in the app.

### Fixed
- Projects load only once the video and canvas are ready, so drawings no longer
  land in the wrong place or go missing on load.
- The drawing toolbar scrolls in small windows instead of overflowing.
- Drawing positions are kept correct when the window is resized.
- Several tracker, laser pointer, freeze-resume and text placeholder bugs.

## [1.0.0] - 2025-12-12

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
