# Multi-clip export plan

Feature: across a long video (e.g. 30 min), mark a dozen or more ranges as named
clips, then export each as a standalone MP4 with its drawings burned in, plus an
editable Replay Studio copy.

## Decisions (made with Mark, 2026-09-28)

- **Output per clip:** `NN - Name.mp4` with annotations burned in, **plus** an
  editable copy: `NN - Name.clean.mp4` (no drawings) and `NN - Name.rsproj`
  pointing at the clean file, with that clip's annotations rebased to t=0.
- **Marking:** I / O set the in/out points, **Shift+C** adds a clip from them to a
  named clip list. Clips show as colored bars on the timeline; drag edges to
  adjust, click to jump.
- **Freeze-frame annotations** (`freezeDuration`) are honored in the burned-in
  export: the video holds on that frame for the duration (silent audio).
  The editable copy keeps `freezeDuration` on the annotation so the app replays it.
- **Player tracker is hidden** (unreliable). Export does not need to support it.

## Why the export renders in the renderer

Annotations are Fabric objects; the magnifier samples live video pixels and
drawings fade in/out, so an overlay-only render can't reproduce the screen.
The export engine composites **video frame + annotations exactly as the live view
draws them** and streams JPEG frames to ffmpeg, which adds the source audio.

Measured on Electron 44 (1080p H.264): seeking costs ~115 ms/frame (too slow),
but **1x playback with `requestVideoFrameCallback` delivers every frame** and a
0.92 JPEG encode costs ~19 ms. So each `play` segment is captured by playing the
hidden video at 1x → export runs at ~real time. Missing frames (mediaTime gaps)
are filled by repeating the previous frame and counted in the result.

## Frozen contracts (do not change without the lead)

- `src/types/clip.ts`: `Clip`, `OutputSegment`, `VideoProbe`,
  `ClipEncodeStartOptions`, `ClipEncodeStartResult`.
- `src/types/electron.d.ts`: `probeVideo`, `chooseExportFolder`,
  `clipEncodeStart/Frame/Finish/Cancel`.
- `src/stores/clipStore.ts`: `useClipStore` (implemented by lead).
- `ProjectData.clips?: Clip[]` in `src/utils/projectSerializer.ts`.
- `src/components/Export/ExportClipsDialog.tsx`: default export, props
  `{ onClose, videoSrc }` (stub until W3 lands).

Output timeline rule: for a clip [start, end), annotations with
`freezeDuration > 0` and `start <= startTime < end` create holds at their
startTime, in time order. Segments are `play(start→t1), hold(t1, d1), play(t1→t2), …`.
`frameCount = round(sum(segment durations) * fps)`.

## Work breakdown (each worker owns only its files)

- **W1 main process:** `electron/clipExport.ts` (new), `electron/main.ts` IPC
  handlers, `electron/preload.cjs`. Probe via `ffmpeg -i` stderr parse; folder
  dialog authorizes a folder for writes (`file:write`, `ffmpeg:export` and
  `clipEncodeStart` accept paths under an authorized folder, names sanitized,
  no traversal); encoder job = `ffmpeg -f image2pipe -framerate fps -c:v mjpeg -i pipe:0`
  + source audio assembled with `atrim/asetpts` per play segment and
  `anullsrc`/`aevalsrc=0` for holds, `concat`; libx264 per quality, yuv420p,
  even dimensions, `+faststart`. Backpressure on stdin. Cancel kills and deletes
  the partial file. Pure arg/filter builder with Vitest tests.
- **W2 clips UI + persistence:** `src/components/Clips/ClipPanel.tsx` (new),
  `src/components/Timeline/*` (clip bars), `src/hooks/useKeyboardShortcuts.ts`
  (`clip.add`), `src/utils/projectSerializer.ts` (clips round-trip, version
  1.1, older files load with no clips), `src/App.tsx` (mount panel, reset clips on
  new video, load/save clips, "Export clips…" opens `ExportClipsDialog`).
  Tests for serializer.
- **W3 export engine + dialog:** `src/export/` (new): `outputTimeline.ts` (pure,
  tested), `annotationTiming.ts` (visibility/opacity at t, shared with live view),
  `clipRenderer.ts` (hidden video + Fabric StaticCanvas, magnifier/spotlight
  parity, rVFC capture, JPEG, send frames), `editableCopy.ts` (rebased
  ProjectData). `DrawingCanvas.tsx`: only replace the inline visibility effect
  with the shared `annotationTiming` function. `ExportClipsDialog.tsx`: select
  clips, choose folder, quality, include-drawings and editable-copy toggles,
  per-clip + overall progress, cancel.
- **Lead:** integrate, full typecheck/lint/test, real-app run, review.
