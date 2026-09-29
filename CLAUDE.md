# CLAUDE.md

Replay Studio: an Electron + React desktop app for video markup — telestrator-style drawing tools over video, with FFmpeg-based export (MP4/GIF).

## Commands

- `npm run dev` — Vite dev server; vite-plugin-electron builds `electron/main.ts` and launches Electron with HMR
- `npm run typecheck` — `tsc --noEmit` for `src/` plus `tsc -p tsconfig.node.json` for `electron/` (the two projects are independent; no `tsc -b`)
- `npm run lint` — `eslint .` (flat config in `eslint.config.js`; TS recommended rules + react-hooks; `@typescript-eslint/no-explicit-any` is a warning, not an error — the codebase has many pre-existing `any`s not yet cleaned up)
- `npm run test` — `vitest run` (jsdom environment; tests live alongside source as `*.test.ts`)
- `npm run test:watch` — `vitest` in watch mode
- `npm run build` — `vite build && electron-builder` → installers in `release/`
- `npm run electron:dev` — `vite build && electron .` (runs the production bundle locally)
- `npm run preview` — Vite preview of the renderer only

Verify changes with `npm run typecheck`, `npm run lint`, `npm run test`, and by running the app.

## Releases

Packaged Linux (AppImage) and Windows builds auto-update via `electron-updater`
against GitHub Releases on `mrelph/replay-studio` (`electron/updater.ts`). A
`v*` tag push runs `.github/workflows/release.yml`, which builds and publishes
both installers plus the update-feed `latest*.yml` files. See
[RELEASING.md](RELEASING.md) for the release process and auto-update behavior.

## Architecture

Electron two-process app:

- `electron/main.ts` — main process (ESM): window creation, all `ipcMain.handle` channels (`dialog:*`, `file:*`, `ffmpeg:*`, `audience:*`, `video:resolvePath`), custom `local-video://` protocol for serving local video files
- `electron/ffmpegExport.ts` — export pipeline using `child_process.spawn` + `ffmpeg-static`
- `electron/preload.cjs` — THE live preload script (CommonJS), exposes `window.electronAPI` via contextBridge
- `src/` — React renderer
  - `src/stores/` — Zustand stores: `videoStore` (playback, in/out points), `toolStore` (active tool, color, stroke), `drawingStore` (annotations, undo/redo), `appStore`, plus `shortcutsStore`, `audienceStore`, `themeStore`, `waveformStore`
  - `src/components/Canvas/DrawingCanvas.tsx` + `Canvas/tools/` — Fabric.js drawing tools (spotlight, magnifier; player tracker + YOLO detector via onnxruntime-web exist but are hidden from the UI and docs until tracking is reliable)
  - `src/plugins/ToolRegistry.ts` — tool plugin registration
  - `src/types/electron.d.ts` — renderer-side types for `window.electronAPI` (keep in sync with preload.cjs)
- Path alias: `@` → `./src` (vite.config.ts)

Data flow: renderer calls `window.electronAPI.*` (preload) → `ipcRenderer.invoke` → `ipcMain.handle` in main.ts. Videos load through `local-video://` URLs, resolved back to file paths for FFmpeg export.

## Conventions

- TypeScript throughout; state changes go through Zustand stores, not component state, when shared
- Tailwind CSS for styling; shared primitives in `src/components/ui/`; theme tokens in `src/theme/tokens.css`
- Adding an IPC channel touches three files: `electron/main.ts` (handler), `electron/preload.cjs` (bridge), `src/types/electron.d.ts` (types)

## Gotchas

- **Preload**: `electron/preload.cjs` is the file actually loaded (main.ts resolves `preload.cjs`; vite.config.ts copies it to `dist-electron/`). `electron/preload.ts` is NOT built or used — do not edit it expecting changes to apply. Preload must stay CommonJS even though the package is `"type": "module"`.
- `dist-electron/` is gitignored EXCEPT `dist-electron/preload.cjs`, which is tracked — rebuilds overwrite it; commit intentional changes.
- YOLO model `public/models/yolov8n.onnx` is gitignored and the `public/` dir may be absent locally; object detection needs the model downloaded separately (packaged via `asarUnpack: dist/models`).
- `onnxruntime-web` is excluded from Vite `optimizeDeps` and split into its own chunk — don't "fix" that.
- README.md predates several features (preload.cjs, audience view, waveform, YOLO, project serialization); trust the code over the docs. Deeper docs: ARCHITECTURE.md, KEYBOARD_SHORTCUTS.md, TROUBLESHOOTING.md.
