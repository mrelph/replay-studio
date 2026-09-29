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

## Why the export no longer renders in the renderer

The first version of this feature composited **video frame + annotations
exactly as the live view draws them** by playing a hidden `<video>` at 1x,
capturing frames via `requestVideoFrameCallback`, and streaming JPEGs to
ffmpeg. On a real 1080p30, 30-minute H.264 source this dropped **49% of
frames** — real-time playback capture can't reliably keep up, no matter the
backpressure/pause tricks.

**Current design:** ffmpeg decodes the source directly and builds the output
timeline itself (accurate `-ss` input seek near the clip start, then
`trim`/`setpts`/`loop` per `OutputSegment`, concatenated and CFR-locked with a
final `fps=` filter) — this is exactly as fast as any other ffmpeg transcode
(the end-to-end test in `electron/clipExport.test.ts` encodes 1080p30 at
~85-90 fps, i.e. well faster than real time even with a magnifier and drawing
overlay in the mix).

The renderer's job shrinks to: render the **drawing layer only**, as a
handful of transparent PNGs (one per distinct visible-annotation state —
`src/export/spanBuilder.ts`), and describe magnifiers as crop/scale/mask/
overlay operations in output-time coordinates (`src/export/magnifierOps.ts`).
ffmpeg composites both onto the base video. A magnifier can't be a static PNG
(it shows live video), so its PNG only draws the ring/border; the live-
sampled zoomed content is produced by ffmpeg itself, cropping a region of the
**base** (pre-drawing-overlay) video.

**Known approximation:** magnifier fade-in/out opacity is not reproduced —
a magnifier is either fully enabled or not (see `magnifierOps.ts`). Fading
the *ring* still works (it's part of the drawing-layer PNG), only the live
zoomed content ignores fade.

## Frozen contracts (do not change without the lead)

- `src/types/clip.ts`: `Clip`, `OutputSegment`, `VideoProbe`,
  `ClipEncodeStartOptions`, `ClipEncodeStartResult`, `OverlaySpan`,
  `MagnifierOp`, `ClipEncodeRunOptions`, `ClipEncodeProgressEvent`,
  `ClipExportResult`.
- `src/types/electron.d.ts`: `probeVideo`, `chooseExportFolder`,
  `clipEncodeStart`, `clipEncodeAddOverlay`, `clipEncodeRun`,
  `clipEncodeCancel`, `onClipEncodeProgress`/`removeClipEncodeProgressListener`.
- `src/stores/clipStore.ts`: `useClipStore`.
- `ProjectData.clips?: Clip[]` in `src/utils/projectSerializer.ts`.
- `src/components/Export/ExportClipsDialog.tsx`: default export, props
  `{ onClose, videoSrc }`.

Output timeline rule (unchanged): for a clip [start, end), annotations with
`freezeDuration > 0` and `start <= startTime < end` create holds at their
startTime, in time order. Segments are `play(start→t1), hold(t1, d1), play(t1→t2), …`.
`frameCount = round(sum(segment durations) * fps)`. Built by
`src/export/outputTimeline.ts` (`buildOutputTimeline`, `segmentFrameCounts`,
`frameSourceTimes`) — untouched by the re-architecture.

## Current design (owned end-to-end; update this section together with the code)

- **`electron/clipExport.ts`:** probing (`parseFfmpegProbeOutput`/`probeVideo`,
  unchanged); the pure ffmpeg argv/filter-graph builder
  (`buildClipEncodeFilterGraph`, `computeSeekOffset`, `buildOverlayConcatList`);
  validation (`validateClipEncodeOptions`, `validateOverlaySpans`,
  `validateMagnifierOps`); and a 3-call stateful job registry:
  `startClipEncodeJob` (validates + creates a per-job temp dir under
  `os.tmpdir()`, no ffmpeg spawn yet), `addOverlayToJob` (writes one PNG into
  that temp dir, returns its index — capped at `MAX_OVERLAYS_PER_JOB` /
  `MAX_OVERLAY_PNG_BYTES`, PNG-signature checked), `runClipEncodeJob` (builds
  the concat-demuxer list for the overlay PNG timeline, builds the filter
  graph, spawns ffmpeg with `-progress pipe:1`, parses `out_time_us=` to
  report percent, awaits completion, deletes the temp dir). `cancelClipEncodeJob`
  kills the process (if spawned) and deletes the temp dir + partial output at
  any point in that lifecycle; `cancelAllClipEncodeJobs` runs on quit.
- **ffmpeg pipeline:** single seeked input (`-ss <firstSegmentTime> -i source`,
  frame-accurate because we transcode) feeds both the base video timeline
  (`trim`/`setpts` per `play`; `trim` one frame + `loop`+`setpts` per `hold` —
  `tpad`'s `stop_duration` can't infer spacing from a single-frame input, so
  `loop` is used instead — concatenated, then `fps=` CFR-locked) and the audio
  timeline (`atrim`/`anullsrc` per segment + `concat`, same seek-relative
  times). A second input (concat demuxer over the overlay PNGs, only added
  when there's at least one drawing span) is `fps=`'d to the output rate and
  `overlay`'d on top. Each magnifier crops/scales a region of the *base*
  (pre-drawing-overlay) video, masks it to a circle with `geq` (alpha = 1
  inside the circle, 0 outside), and `overlay`s it with an `enable=` window
  expression built from `between(t,...)` clauses — chained magnifier-by-
  magnifier before the drawing overlay is applied. Quality scaling
  (`videoScaleFilter`, unchanged from the old design) happens only after all
  compositing. `-frames:v <frameCount>` caps the output to the exact frame
  count the timeline computed.
- **`src/export/spanBuilder.ts`:** pure. Walks `frameSourceTimes(segments,
  fps)`; for each frame computes a signature (sorted `(annotationId, opacity
  quantized to 1/50)` pairs via `annotationStateAt`, the same rule the live
  canvas uses) and groups consecutive equal-signature frames into
  `DrawingSpan`s. A static drawing costs ~2-3 spans; a fade costs up to one
  span per frame it covers; a hold's frames always share one signature
  (constant source time) and often merge with an identically-signed
  neighboring frame.
- **`src/export/magnifierOps.ts`:** pure. `computeMagnifierSampleRect`
  (unchanged math, moved here from `clipRenderer.ts`, re-exported there for
  back-compat) computes the video-native sample rect. `buildMagnifierOps`
  walks the same segment timeline to turn a magnifier's `[startTime,
  endTime]` into output-time enable window(s) — a `play` segment contributes
  a linearly-mapped sub-range, a `hold` contributes its *entire* output-time
  range whenever its `srcTime` falls inside the magnifier's visible window.
- **`src/export/clipRenderer.ts`:** `renderClip` is now: build the output
  timeline → `clipEncodeStart` → (if burning in drawings) build spans, render
  each distinct signature once on an offscreen `fabric.StaticCanvas` at
  `probe.width x probe.height` (objects cloned via `object.clone()`; a
  magnifier goes through the project-serializer clone path with its fill
  forced transparent, since the PNG only needs its ring) → `toBlob('image/png')`
  → `clipEncodeAddOverlay` (deduped by signature) → build magnifier ops →
  `clipEncodeRun`. No hidden `<video>`, no rVFC, no JPEG encoding, no
  real-time playback at all.
- **`ExportClipsDialog.tsx`:** real percent progress (renderer PNG work is
  the first ~5%, ffmpeg's own `-progress` reporting fills the rest via
  `onClipEncodeProgress`); no more dropped-frame reporting/warning.
- **Tests:** `src/export/spanBuilder.test.ts`, `src/export/magnifierOps.test.ts`
  (pure, fixtures per the design doc: static drawing, fade-in, hold across a
  drawing, two overlapping drawings, magnifier), `electron/clipExport.test.ts`
  (probing, filter-graph builder, concat-list builder, validation, plus an
  end-to-end test with real ffmpeg that generates a 4s 1080p30 source, two
  overlay PNGs, a magnifier op and a 0.5s hold, runs the job API directly, and
  pixel-samples the output to confirm the overlay only appears in its span
  and the magnifier region differs from the untouched source).
