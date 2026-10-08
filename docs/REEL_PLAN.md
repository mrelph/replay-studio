# Highlight reel plan

Feature: join a chosen, ordered set of clips into **one MP4**, so a coach can
send a single "PK review" or "Player 12" video. Each clip shows its drawings,
magnifiers and holds. Title cards before clips are optional. The MP4 has a
chapter for each clip.

Builds directly on the multi-clip export (see `docs/CLIPS_PLAN.md`). Read that
first. Nothing in its frozen contracts changes. This feature adds to it.

## Decisions (made with Mark, 2026-10-06)

- **Picking clips:** the reel dialog starts from all clips in clip-panel
  order. A tag filter narrows the list using ANY-match, the same rule as the
  panel. The coach can uncheck clips and drag them into a new order. Reels are
  **not** saved in the project (no named reels for now). The last-used reel
  settings are remembered.
- **Between clips:** hard cuts by default. The **"Title cards"** toggle (off
  by default, duration default 2 s, range 1–5 s) adds a card before each clip
  showing `n / N`, the clip name and its tags.
- **Drawings:** always burned in. A reel looks exactly like the clips'
  burned-in exports, holds included. There is no clean-reel option.
- **Extras:** each clip becomes an **MP4 chapter** (always on, it costs
  nothing), named after the clip. A checkbox, **"Also save individual clips"**,
  writes the normal per-clip exports (burned-in files, plus the editable copy
  if that option is checked, plus `clips.csv`) in the same run. That reuses
  the encodes the reel needs anyway, so nothing is encoded twice.
- Output name: `Reel - <name>.mp4` (default name = tag filter, e.g.
  `Reel - PK, Breakout`, else `Reel - <video name>`), sanitized with the same
  rules as `clipFilename.ts`.

## Design

### Shape: encode parts, then join without re-encoding video

A reel is an ordered list of **parts**. Each part is a normal clip encode job
from the existing pipeline, so the output is already frame-exact and the
burn-in is already correct:

```
[card 1] [clip 1] [card 2] [clip 2] … [card N] [clip N]
```

A final ffmpeg pass joins them with the **concat demuxer, `-c:v copy`**, so the
video is never re-encoded. Every part comes from the same source with the same
encoder settings (`libx264`, same CRF/preset, `yuv420p`, `-r fps`, same size
after quality scaling), so the streams join cleanly. Audio **is** re-encoded in
the join (`-c:a aac -b:a 128k`). Each part's AAC encoder adds about 21 ms of
priming at its start. Decoding the parts and re-encoding them as one
continuous track avoids audio drifting out of sync across 20+ joins. Audio
re-encoding is cheap.

Alternatives considered:
- **One big filter graph for the whole reel.** A single input seek would decode
  the gaps between clips, which is slow on a 30-minute game. One input per clip
  hits argv and filter-graph size limits at about 20 clips. It also means
  rewriting the frozen job API.
- **Crossfades.** Rejected by Mark. They would force a full re-encode.

### Title cards reuse the clip job, so main gets no new card code

The bundled `ffmpeg-static` has **no `drawtext`**, so text can't be drawn
inside ffmpeg. Instead, a card is just a clip encode job:

- `segments: [{ kind: 'hold', srcTime: clip.start, duration: cardSeconds }]`
  freezes the clip's first frame, with silent audio (the hold path already
  generates silence).
- One overlay PNG covering the whole frame, drawn in the renderer with Canvas
  2D at `probe.width × probe.height`: a dark scrim (about 80% opacity) over
  the frozen frame, `3 / 12`, the clip name large, tag chips below. It goes
  through the existing `clipEncodeAddOverlay` RGBA→PNG path, so it never uses
  `canvas.toBlob` PNG (too slow). One span covers all frames.

This gives the right size, fps, codec and audio layout for free, and the card
looks like a preview of the clip it introduces. New pure module:
`src/export/titleCard.ts` (layout and text fitting: longest name ellipsized to
two lines, at most 6 tag chips then `+k`).

### Main process: one new job type, `reel`

`electron/reelExport.ts` (new; the pure parts are unit-tested):

- `reelStart({ outputPath, keepParts: string[] | null })` validates that
  `outputPath` is inside an authorized export folder (same check as
  `clipEncodeStart`). It creates a per-reel temp dir under `os.tmpdir()` and
  returns `reelId`.
- **Where parts get written.** `ClipEncodeStartOptions.outputPath` must be
  inside an export folder, so reel parts need somewhere else to go. Add an
  **optional** field `reelId?: string` to `ClipEncodeStartOptions`. When it is
  set, main ignores `outputPath`'s directory, writes the part into that reel's
  temp dir, and returns the part path in `ClipEncodeStartResult`. This is an
  additive change to a frozen contract, so update `CLIPS_PLAN.md` with it.
  When "also save individual clips" is on, the clip parts are written to the
  export folder as usual (normal names). The reel then references those files
  and only the cards go to temp.
- `reelAssemble(reelId, { parts: PartRef[], chapters: ReelChapter[], hasAudio })`:
  - `buildReelConcatList(parts)` (pure): concat-demuxer list, paths escaped
    the same way as `buildOverlayConcatList`.
  - `buildChapterMetadata(chapters)` (pure): an `;FFMETADATA1` file with
    `[CHAPTER] TIMEBASE=1/1000 START END title=` and escaping for `= ; # \`
    and newlines in titles.
  - Runs ffmpeg as `-f concat -safe 0 -i list -i meta.txt -map 0 -map_metadata 1
    -map_chapters 1 -c:v copy -c:a aac -b:a 128k -movflags +faststart`,
    reporting progress with `-progress pipe:1` the same way as clip jobs.
  - Deletes the temp dir afterwards, whether the join succeeded or failed.
- `reelCancel(reelId)`: kills ffmpeg, deletes the temp dir and the partial
  reel. Kept-part files that are already finished stay, which matches clip
  export's behavior on cancel. `cancelAllReelJobs` runs on quit, next to
  `cancelAllClipEncodeJobs`.
- IPC and preload: `reelStart`, `reelAssemble`, `reelCancel`, and
  `onReelProgress`/`removeReelProgressListener`. The `electron.d.ts` types
  follow the existing pattern.

### Renderer

- `src/export/reelPlan.ts` (pure, the core of the tests):
  `buildReelPlan(clips, annotations, fps, { titleCards, cardSeconds })` →
  `ReelPart[]` (`card` | `clip`, each with its `OutputSegment[]` and exact
  `frameCount` from `buildOutputTimeline`/`segmentFrameCounts`), plus
  `chapters`. Chapter times come from **cumulative frame counts ÷ fps**, not
  summed seconds, so chapters can't drift. A card belongs to its clip's
  chapter (the chapter starts at the card).
- `src/export/reelRenderer.ts`: `renderReel(plan, opts, onProgress, signal)`
  calls `reelStart`. For each part it calls `renderClip`-style logic: clip
  parts reuse `renderClip` with `reelId`, and card parts call the job API with
  the hold segment and the card overlay. Then it calls `reelAssemble`.
  Progress is weighted by frame count, and the join counts as about 5%.
  `AbortSignal` cancels the whole run.
- `clipRenderer.renderClip` gets an optional `reelId` passthrough. Nothing
  else changes there.

### UI: `ReelDialog.tsx`

Opened by an **"Export reel"** button next to "Export clips" in `ClipPanel`.
Same modal styling and folder picker as `ExportClipsDialog`.

- Reel name field (default as above).
- Tag chips (ANY filter) above an ordered list of checkboxes with drag
  handles. Each row shows the swatch, the name, the duration (including
  holds) and its tags. A footer reads "7 clips · 3:42". The total includes
  cards when they're on.
- Options: Title cards [toggle] + seconds. Quality (shared with clip export).
  Also save individual clips [checkbox]. When that's checked, the existing
  "Also save editable copy" option appears.
- Progress: "Clip 3 of 7…", "Title card 3 of 7…", "Joining reel…", with a
  percent and Cancel. At the end it shows **Show in folder**.
- Remembered settings (in `clipPrefsStore`, persisted): `reelTitleCards`,
  `reelCardSeconds`, `reelSaveIndividual`.
- When individual clips are saved, `clips.csv` is written exactly as clip
  export writes it.

## Edge cases

- Clips that overlap or repeat in the source are fine. Every part is
  independent.
- Source without audio: every part has no audio stream, so the join omits
  `-c:a` and maps video only. Cards are already silent holds, so a mix of
  parts with and without audio never happens.
- One clip with cards off still produces a valid reel (a one-part concat)
  with one chapter.
- Odd and fractional frame rates (29.97, 59.94): parts use the same `-r` and
  the frame-exact segment snapping from 1.3.0. The reel's frame count must
  equal the sum of the parts' frame counts, and a test asserts this.
- Very long reels: temp disk use is about the size of the reel when
  individual clips aren't saved. Check free space in `reelStart` (refuse below
  2× an estimate from bitrate × duration). The estimate is rough, so the check
  only warns.

## Tests

- **Pure:** `reelPlan.test.ts` (ordering, the card toggle, frame-exact
  chapter starts at 29.97, holds counted inside a clip part, an empty
  selection rejected). `titleCard.test.ts` (text fitting, tag overflow).
  `reelExport.test.ts` (concat list escaping, ffmetadata escaping, argv for
  sources with and without audio).
- **End-to-end with real ffmpeg** (same style as the test in
  `clipExport.test.ts`): generate a 6 s 29.97 test source with a tone. Build a
  reel of 3 clips, one with a hold, with cards on. Assert the following:
  - The total frame count equals the sum of the parts.
  - The audio duration is within 1 frame of the video duration, so there's
    no drift.
  - `ffprobe` shows 3 chapters, each starting at the expected time.
  - A card frame shows the scrim, and the first clip frame matches the source.
- **In the app over CDP** (same tooling as 1.3.0): open a project, filter by
  tag, reorder, and export with cards on and individual clips on. Check the
  files on disk and the chapters, then play the reel in mpv to look at it.

## Phase 1 status (2026-10-06): done

- `electron/reelExport.ts` with the registry and pure builders. Part
  reservation happens in `clip:encodeStart` when `options.reel` is set.
  `clip:encodeRun`/`clip:encodeCancel` mark the part done or failed.
  `reel:start`/`reel:assemble`/`reel:cancel` and `reel:progress` go through
  preload and `electron.d.ts`. Quit and window close cancel all reels.
- **A/V sync, measured.** The concat demuxer aligns each part's earliest
  timestamp (the AAC priming, −1024 samples) to 0. The copied video therefore
  starts about 21 ms after the audio (a one-time lead-in), but every cut is
  in sync to about 1 ms and nothing drifts: checked over 6 joins. A naive
  `asetpts=PTS-STARTPTS` "fix" makes it *worse* (a 21 ms desync), and the e2e
  test catches exactly that. `-ss 0`, `inpoint`, `outpoint` and
  `-avoid_negative_ts make_zero` don't change it. Chapter times are
  frames ÷ fps, so they sit 21 ms before the frame they name, which can't be
  seen.
- `silencedetect` gives silence *ends* to the sample but silence *starts*
  only to one AAC frame. The e2e test measures onsets tightly (10 ms) and
  starts loosely.
- Verified in the dev app over CDP: a plain clip export still works, the
  denial for a path outside the export folder still works, a two-part reel
  (one temp part, one kept part) joins with 105/105 frames and two chapters,
  a quality mismatch is refused, and the temp dirs are removed.

## Phase 2 status (2026-10-07): done

- `src/export/reelPlan.ts` (pure): `buildReelPlan` (parts in the given
  order, a card before each clip when on, clip parts built with
  `buildOutputTimeline` so freezes match single-clip export, chapters from
  cumulative frame counts), `defaultReelName`, `buildReelBaseName`,
  `clampCardSeconds`, `estimateEncodeBytes` (rough, for the free-space
  warning).
- `src/export/titleCard.ts`: `layoutTitleCard` (pure; text measurement
  injected) with word wrap to two lines and an ellipsis, up to six tag chips
  then `+k`, wrapping to at most two rows. `renderTitleCardRgba` draws it
  with Canvas 2D at the video's native size after `document.fonts.ready`.
  The look: an 80% black scrim, a muted "n / N", a short blue rule, the
  name in bold white, and outlined chips.
- `src/export/reelRenderer.ts`: `renderReel` encodes each part in order
  (cards through the job API with one full-frame span, clips through
  `renderClip` with `reel`), weights progress by frames (the join is the
  last 5%), names the failing part in errors, cancels the whole reel on
  failure or abort, and reports each kept clip's outcome. Dependencies are
  injectable for tests.
- `renderClip` passes an optional `reel` through to `clipEncodeStart`.
- Verified in the dev app (Vite dev server, modules imported over CDP): a
  reel of 3 clips at 29.97 with cards, a burned-in rectangle and a 1 s
  freeze, with one clip kept. Result: 345/345 frames, 3 chapters with full
  titles, cards rendered in Inter with ellipsis and `+2`, the drawing at
  its exact position, the kept clip on disk and the temp dirs removed.
  About 18 s for 11.5 s of 720p output, since every part is its own ffmpeg
  run.

## Phases

1. **Engine (main):** `reelExport.ts`, the additive `reelId` on clip jobs,
   IPC/preload/types, and the pure and end-to-end tests. Proves the
   concat-copy approach and A/V sync before any UI exists.
2. **Renderer:** `reelPlan.ts`, `titleCard.ts`, `reelRenderer.ts`, and the
   `renderClip` passthrough.
3. **UI:** `ReelDialog.tsx`, the ClipPanel button, the prefs, and the shortcut
   entry if wanted (`Ctrl+Shift+E`, editable in the shortcuts editor).
4. **Verify and ship:** CDP run in the app, Mark tests it hands-on, update
   docs (`README`, `KEYBOARD_SHORTCUTS.md`, this file), release v1.4.0.

Open question for Mark after phase 1: the look of the card (scrim strength,
whether notes appear). It's cheap to change once it renders.
