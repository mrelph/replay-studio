# Speed ramps: slow motion regions, live and in export

Release 3 of 4 in the "broadcast quality" track. Target version: 1.9.0.
Builds on release 1 (`2026-11-23-broadcast-look-design.md`) and release 2
(`2026-11-25-timing-made-easy-design.md`).

## Intent

Mark wants the key second of a play in slow motion, the way a broadcast replay
shows it, and he wants to make it the way he makes a freeze: live, while
watching. Today speed is one global playback setting. It is not saved, and
export ignores it, so every exported clip runs at normal speed.

## Goals

- Hold a key while the video plays to slow it down; the stretch becomes a saved
  speed region.
- Regions can be re-timed and re-sped on the timeline with one click.
- Speed eases in and out of a region (a ramp), live and in export.
- Exported MP4 and GIF play each region at its speed, with drawings, freezes
  and the magnifier still landing on the right frames.
- Projects without regions play and export exactly as before.

## Non-goals

- Synthesising in-between frames (motion interpolation). Slow motion repeats
  source frames; 60 fps footage looks smoother than 30.
- Slowed or pitch-shifted audio.
- An adjustable ramp length, or ramp curves per region.
- Undo/redo for speed regions.
- Reverse playback regions.
- New drawing tools (release 4).

## Anti-goals

- Live view and export disagreeing about which source frame is on screen when,
  or about when a drawing appears.
- A drawing's fade or draw-on crawling in slow motion.
- Any change to the output of a project that has no speed regions.

## What Mark decided

1. Regions are **recorded live by holding a key**, like Freeze; they can then be
   dragged and re-sped on the timeline.
2. Speed changes with a **short smooth ramp** at each edge (about a quarter of a
   second, fixed length in this release).
3. Exported sound is **silent during slow or fast sections**, normal elsewhere.

Everything else below is Claude's call unless marked.

## Approaches

| Approach | Trade-off | Verdict |
|---|---|---|
| **One shared speed map** (source time ↔ presentation time) used by live playback, export frame planning, overlays and audio; the ramp is a fixed number of small constant-speed steps that both sides follow | One source of truth; export gains a speed per play segment | **Picked** (Mark left the how to Claude) |
| One continuous ffmpeg time formula per region | Smoother in theory, but overlays are planned per frame outside ffmpeg and would drift from the video | Rejected |
| Live-only slow motion, export by real-time screen capture | No exporter change, but slow, lossy, and not frame-exact | Rejected |

## Design

### 1. Data model

```ts
interface SpeedRegion { id: string; start: number; end: number; speed: number }
```

- `start`/`end` are source seconds, snapped to frame starts, `end > start`.
- `speed` is a multiplier of normal speed: chips offer `0.25`, `0.5`, `0.75`
  and `2`. Default for a new region: `0.5`. Stored as a number so other values
  from a hand-edited file still work; clamp to `[0.1, 4]` on load.
- Regions never overlap. Adding or resizing one trims or splits whatever it
  covers; a remnant shorter than 0.1 s is dropped.
- A new Zustand store, `speedStore`, holds the list (sorted by `start`) with
  add / update / remove / replaceAll. It is not part of the drawing undo
  history.
- Project file: a new optional top-level `speedRegions` array; bump the written
  version to `'1.3'`. Files without it load with no regions. Sanitize on load
  (drop malformed entries, sort, resolve overlaps).

### 2. The speed map (pure, shared)

A new module, `src/export/speedMap.ts`, turns the region list into a list of
constant-speed **steps** covering the whole video, and converts between source
time and presentation time. Everything else asks this module.

- Outside regions the speed is 1.
- **Ramp:** at each region edge, speed moves between the outside speed and the
  region's speed over about `RAMP_SOURCE_SECONDS = 0.25` of source time, in up
  to `RAMP_STEPS = 5` steps with linearly interpolated speeds. The ramp sits
  **inside** the region (its first and last quarter second), so the region's
  edges are exactly where the speed starts and finishes changing.
- **Every step edge is a whole source frame.** The map takes the source fps.
  ffmpeg snaps each segment edge to a frame while the renderer plans overlays
  from the segment list; if a step edge fell inside a frame, the two would
  drift apart by a frame or two wherever the speed changes (an anti-goal). So:
  the ramp length is rounded to whole frames, each step is at least 2 source
  frames long, and the step count drops below 5 when the ramp has fewer than
  10 frames (at 24 fps a ramp is 6 frames: 3 steps). Region edges are frame
  starts too, and a region must be at least 4 source frames long.
- A region shorter than twice the ramp uses half its length for each ramp
  (rounded to frames, same rules).
- Two regions that touch ramp directly from one speed to the other over the
  first region's tail and the second's head.
- The stepped ramp is the definition, not an approximation: export follows
  the steps exactly. What "agree" means: which source frame a drawing appears
  and animates on is exact in both (both read the source time). Live playback
  *speed* is best effort: the rate can only change once per screen refresh, so
  a step may be entered a few milliseconds late, and at high shuttle rates
  steps can be skipped. That is accepted.
- API (names for the builder to settle): `buildSpeedSteps(regions, duration)`,
  `speedAt(steps, srcTime)`, `presentationOffset(steps, fromSrc, toSrc)`
  (seconds on screen between two source times, excluding holds), and its
  inverse `sourceAtPresentation(steps, fromSrc, presentationSeconds)`.
- With no regions the step list is one step of speed 1 and every function is
  the identity; callers must produce byte-identical results to today.

### 3. Recording a region live

- New shortcut `video.slow`, default key **`W`** (`S` is the spotlight tool).
  Customisable like the others; listed in `KEYBOARD_SHORTCUTS.md`.
- While the video is **playing forward**, key down starts recording: playback
  drops to the default region speed at once (no ease on the way in while
  recording; the ramp appears on replay). Key up ends it and adds a region from
  the source time at key down to the source time at key up, both snapped to
  frames. A toast confirms it, with the length and speed.
- Shorter than 0.3 s of wall-clock hold: nothing recorded, playback returns to
  normal ("Slow motion too short: nothing recorded").
- Key repeat is ignored. Pressing while paused, or during reverse shuttle, does
  nothing. A pause by the user, a seek, or the window losing focus while the
  key is held ends the recording at that point. An **automatic freeze** that
  fires during the recording does not end it: the hold plays out and the
  recording continues, giving one region.
- This is new input handling, not a copy of Freeze: Freeze is a press-to-toggle
  and the shortcuts hook only handles key-up for the stop key today.
- Recording over existing regions replaces the part it covers (section 1).
- A "Slow" button beside the Freeze button does the same with press and hold.

### 4. Live playback

- The effective rate is `userRate × speedAt(currentTime)`, where `userRate` is
  the existing speed dropdown / shuttle rate, clamped to `[0.0625, 16]`
  (Chromium throws outside that range). There must be exactly one place that
  writes `video.playbackRate`: today an effect in `VideoPlayer.tsx` rewrites it
  whenever the store's rate changes; fold the two together. A small per-frame loop (the
  canvas already runs one while playing; reuse or mirror that pattern) reads
  `video.currentTime` and sets `video.playbackRate` when the step changes. Do
  not change how often the store's `currentTime` updates.
- The speed dropdown keeps showing the user's rate; a small badge near it shows
  the region's speed (e.g. "50%") while the playhead is inside one.
- Sound is muted while the playhead is in a region whose speed is not 1, and
  restored on leaving it, without changing the user's own mute setting.
- Reverse shuttle ignores regions. Frame-stepping is unaffected.
- Freezes work as today: the hold lasts its own wall-clock length whatever the
  region speed, then motion continues at the region's speed.

### 5. Drawings in slow motion

- A drawing's `startTime`/`endTime` stay in source time. "Stays 2s" is two
  seconds of the play, which lasts four on screen at 50%.
- **Animations run in presentation time.** Fade-in, fade-out, draw-on and
  `revealDelay` are measured in on-screen seconds:
  - today `revealElapsed` is `(t − startTime) + holdElapsed − revealDelay`; the
    source term becomes `presentationOffset(steps, startTime, t)`.
  - `annotationStateAt` computes fades from `t − startTime` and `endTime − t`;
    both become presentation offsets.
  - `isRevealDue` uses the same presentation offset.
- These functions take the offset (or the step list) as an argument so they
  stay pure; with no regions the offset equals the source difference and all
  existing tests pass unchanged.
- The live loop and the span builder both pass the same step list.

### 6. Export

- `OutputSegment`'s `play` kind gains an optional `speed` (default 1).
  `buildOutputTimeline` splits each play stretch at step boundaries, so every
  play segment has one constant speed; consecutive steps of equal speed merge.
  A play segment's output duration is `(srcEnd − srcStart) / speed`.
- `segmentFrameCounts`, `frameSourceTimes` and `framePresentations` use that
  duration, so each output frame's source time comes from the same map as
  everything else. `framePresentations` also carries the presentation offset
  needed by section 5.
- `electron/clipExport.ts`: a play segment with speed `s ≠ 1` becomes
  `trim` + `setpts=(PTS-STARTPTS)/s`, resampled to the output rate **inside
  the segment** and forced to its exact planned frame count, the way holds
  already get an exact count. The `concat` filter judges a video segment's
  length from its frames, so a short slowed segment left to the final `fps=`
  filter would lose or gain frames mid-timeline and drift from the
  sample-exact silent audio. Speed-1 segments keep today's graph unchanged, so
  projects without regions export byte-identically. Validation accepts `speed`
  in `[0.1, 4]`, and the main process's own copy of the frame-count
  calculation must take `speed` into account too.
- Audio: a play segment with `speed !== 1` contributes silence of its output
  duration (the same `anullsrc` path holds use); speed-1 segments are unchanged.
- Magnifier zoom windows (`magnifierOps.ts`) map source time to output time
  through the segments' speeds. Today one enable window is emitted per play
  segment and the main process rejects more than 200 per magnifier; with ten
  segments per region that limit is easy to hit, so merge windows that touch.
- The 500-overlay budget: animations run in presentation time, so a draw-on
  costs the same number of overlays at any speed. No new fallback is needed.
- Many short ramp steps mean many segments in the ffmpeg graph (10 per region).
  Cap regions per export job at 40 (400 play segments) and fail with a clear
  message beyond that.
- Reel export uses the same timeline and gets this for free; check that parts
  with different speeds still concatenate.
- GIF: unchanged limits; slow regions simply produce more frames.

### 7. Timeline and inspector

- A "Speed" lane between the clips lane and the annotation bars shows each
  region as a band labelled with its speed ("50%"); the ramp portions are drawn
  as a gradient at each end.
- Click selects a region. Dragging an edge resizes it and dragging the body
  moves it, with the same snapping as annotation bars (playhead, whole frames;
  Alt disables the playhead snap). Overlaps resolve per section 1 on mouse-up.
- With a region selected, the inspector area shows chips `25% · 50% · 75% · 2x`
  and a Delete button; Delete / Backspace also removes it.
- The lane is hidden when there are no regions, so the timeline is unchanged
  for projects that do not use the feature.

## Constraints

- Hidden features stay hidden (project CLAUDE.md).
- No new dependencies.
- IPC: no new channels expected; the export job's segment list already crosses
  the bridge. If the job shape's types live in `src/types/`, keep
  `electron/` validation in step.
- Testing budget (Mark, 2026-11-25): while building, run only the test files
  for the code touched, plus typecheck and lint. No full-suite run and no full
  in-app pass per task. One short smoke check at the end of the release; the
  major full test happens once, later.
- On this machine tests run with `npx vitest run <file> --no-file-parallelism`.

## Testing

- Speed map: no regions is the identity; one region with ramps; short region;
  touching regions; presentation offset and its inverse round-trip; the step
  list covers the video with no gaps or overlaps.
- Region list rules: overlap trimming and splitting, minimum length, sanitizing
  on load.
- Timing: a draw-on and a fade inside a 50% region take the same on-screen time
  as outside it; with no regions every existing timing test is unchanged.
- Output timeline: segment speeds, frame counts and per-frame source times for
  a clip with one region; a freeze inside a region; a clip whose in or out
  point falls inside a ramp; regions outside the clip ignored.
- Export job: validation of `speed`; the filter graph for a slowed segment; the
  audio graph has silence of the right length; the existing end-to-end ffmpeg
  test extended with one slow region (frame count and a pixel check).
- Serializer: round-trip of `speedRegions`; a 1.2 file loads with none.
- Smoke check in the app at the end: hold `W` during playback, replay through
  the region, export an MP4 across it and confirm its length and that a drawing
  inside the region appears on the right frame.

## Left to the builder

- Module and function names, and whether `speedStore` is its own file.
- How the live rate loop is hosted (its own hook or part of an existing one).
- The exact look of the lane, the badge and the ramp gradient.
- Whether consecutive equal-speed steps are merged in the map or in the timeline.
