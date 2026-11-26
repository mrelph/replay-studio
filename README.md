# Replay Studio

A desktop video markup app with telestrator-style drawing tools for annotating, highlighting and analysing video, built with sports coaching in mind.

## Overview

Replay Studio is an Electron app. Load a video, draw on it, cut clips, and export MP4 or GIF with the drawings burned in. It suits sports analysis, coaching feedback, tutorials and content creation. The default ice-hockey-friendly tools (player rings, zones, callouts) are aimed at game footage, but nothing limits it to that.

## Installation

Download an installer from [GitHub Releases](https://github.com/mrelph/replay-studio/releases):

- **Linux**: AppImage. Updates itself.
- **Windows**: NSIS installer. Updates itself. The installer is unsigned, so SmartScreen may warn on first run.
- **macOS**: dmg for Apple silicon only (Intel Macs are not covered). It is unsigned: on first launch, open System Settings → Privacy & Security and choose **Open Anyway**. It does not auto-update; download the new dmg from the release page.

See [RELEASING.md](RELEASING.md) for how releases are cut and what auto-update looks like.

## Features

### Video Playback
- Load local video files (MP4, AVI, MOV, MKV, WebM) by drag and drop, the Open button or the recent files list
- Frame-by-frame stepping, J/K/L shuttle and variable playback speed
- In/Out points, and a timeline with snapping to the playhead, freezes and whole frames
- Waveform display

### Drawing Tools
- **Select (V)** - select, move and restyle annotations
- **Freehand (P)**, **Line (Shift+L)**, **Arrow (A)**, **Arc Arrow (Shift+A)**
- **Rectangle (R)**, **Ellipse (C)**
- **Text (T)** - size, bold/italic/underline, font (Arial, Inter, Oswald, Roboto Slab, Marker) and an optional background plate
- **Spotlight (S)** and **Zoom Lens (Shift+M)**
- **Eraser (E)**
- **Player Ring (G)**, **Zone (Z)** and **Callout (Shift+T)**, in the toolbar's Field group

### Annotations
- Ten preset colors and stroke widths from the Size group
- Outline, Glow and Clean styles
- Solid / Dashed switch (`D`) for lines, arrows, arc arrows and freehand strokes
- Draw-on animation: drawings draw themselves along the stroke, with a per-annotation Draw-on time
- "Stays" chips (Freeze only, 1s, 1.5s, 2s, 4s, To end; 1.5s is the default) set how long drawings stay on screen
- Undo / Redo and Clear all

### Freeze Frames and Slow Motion
- Drawing while the video plays pauses on that frame and adds a freeze automatically; drawings on a frozen frame appear one after another in the order you drew them
- Pressing Play after drawing previews the freeze before the video resumes
- `H` records a freeze by holding the current frame
- Hold `W` while the video plays to record a 50% slow-motion region; adjust regions on the timeline's Speed lane (25%, 50%, 75%, 2x)

### Clips and Highlight Reels
- Mark clips from In/Out (`Shift+C`) or around the playhead (`X`)
- Tag clips, add notes, set tags that auto-apply to new clips, and filter by tag
- Export selected clips to individual MP4s with a `clips.csv` manifest
- "Export reel…" joins chosen clips into one MP4, with optional title cards and chapters

### Export
- MP4 or GIF with annotations burned in (drawings, timing and fades, zoom lenses, freezes, slow motion)
- Quality presets (High 1080p, Medium 720p, Low 480p) and frame rate (24, 30, 60 fps; GIFs are capped at 15 fps)
- Full video or In/Out range only; turn "Include annotations" off to export the plain video
- MP4 exports keep the source audio

### Projects
- Save and load projects as `.rsproj` files (annotations, freezes, clips and speed regions)

## Keyboard Shortcuts

Press `?` in the app for the full list; most shortcuts can be rebound there. See [KEYBOARD_SHORTCUTS.md](KEYBOARD_SHORTCUTS.md) for the complete reference. The most used:

| Key | Action |
|-----|--------|
| `Space` | Play / Pause |
| `←` / `→` | Previous / next frame |
| `J` / `K` / `L` | Shuttle reverse / stop / shuttle forward |
| `I` / `O` | Set In / Out point |
| `Shift+C` / `X` | Add clip from In/Out / mark a moment around the playhead |
| `H` | Freeze the current frame |
| `W` (hold) | Slow motion while held |
| `V` `P` `A` `R` `C` `T` `S` | Select, Freehand, Arrow, Rectangle, Ellipse, Text, Spotlight |
| `D` | Solid / Dashed |
| `1`-`9` | Color presets |
| `Ctrl+Z` / `Ctrl+Y` | Undo / Redo (`Cmd` on macOS) |

## Usage

1. **Open a video**: drag it into the window, or use Open.
2. **Draw**: pick a tool (or press its key), choose a color, size, style and "Stays" length, then drag on the video. Drawing during playback freezes the frame for you.
3. **Mark clips** (optional): set In/Out and press `Shift+C`, or press `X` while watching.
4. **Export**: click Export, pick MP4 or GIF, quality and frame rate, then choose where to save. Use the Clips panel for clips and reels, and File → Save Project to keep an editable project.

## Development

Requires Node.js and npm.

```bash
git clone https://github.com/mrelph/replay-studio.git
cd replay-studio
npm install
npm run dev
```

| Script | What it does |
|--------|--------------|
| `npm run dev` | Vite dev server; builds and launches Electron with hot reload |
| `npm run typecheck` | `tsc --noEmit` for `src/` and for `electron/` |
| `npm run lint` | ESLint |
| `npm run test` | Vitest (jsdom) |
| `npm run build` | `vite build` then electron-builder; installers go to `release/` |
| `npm run electron:dev` | Build the renderer and run the production bundle locally |
| `npm run preview` | Vite preview of the renderer only |

### Stack

Electron, React, TypeScript, Vite, Fabric.js (drawing), Zustand (state), Tailwind CSS, and FFmpeg via `ffmpeg-static` for export.

### Architecture notes

- `electron/main.ts` is the main process (windows, dialogs, IPC, the `local-video://` protocol for local files); `electron/ffmpegExport.ts` runs exports; `src/` is the React renderer.
- **`electron/preload.cjs` is the preload script that actually loads.** `electron/preload.ts`, if present, is not built or used. The preload must stay CommonJS.
- Adding an IPC channel touches `electron/main.ts`, `electron/preload.cjs` and `src/types/electron.d.ts`.
- The player tracker / object detection, audience view and laser pointer exist in the code but are hidden from the interface.

More detail: [ARCHITECTURE.md](ARCHITECTURE.md), [TROUBLESHOOTING.md](TROUBLESHOOTING.md), [CONTRIBUTING.md](CONTRIBUTING.md), [CHANGELOG.md](CHANGELOG.md), [QUICK_START.md](QUICK_START.md).

## Known Limitations

- Video support depends on what Chromium/Electron can decode.
- Slow motion repeats frames rather than interpolating, so higher-frame-rate footage looks smoother.
- Speed regions are not part of Undo yet.

## Contributing

Contributions are welcome. Fork the repository, create a feature branch, and open a pull request; see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

No license file is included in the repository yet.
