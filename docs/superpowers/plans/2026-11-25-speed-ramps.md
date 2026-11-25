# Speed Ramps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Slow-motion (and 2x) regions recorded live by holding a key, with eased ramps, that play the same in the live view and in exported MP4/GIF.

**Architecture:** A saved list of non-overlapping speed regions feeds one pure "speed map" that turns them into frame-aligned constant-speed steps and converts source time to on-screen time. Live playback, annotation animation timing, the export's segment list and the ffmpeg graph all read that map. Play segments in the export gain a `speed`.

**Tech Stack:** Electron, React 18, TypeScript, Zustand, Fabric.js 5, ffmpeg (ffmpeg-static 6), Vitest (jsdom).

**Spec:** `docs/superpowers/specs/2026-11-25-speed-ramps-design.md`. Read it before any task.

## Global Constraints

- Work on branch `speed-ramps` (create from `main`). Conventional commits. Do not push. Never touch `git stash`.
- A project with no speed regions must play and export exactly as before: every existing test stays green unchanged, and the ffmpeg filter graph for speed-1 segments is byte-identical to today's.
- Hidden features stay hidden (tracker/YOLO, audience view, laser pointer). No new dependencies. No new IPC channels.
- Exact values: chips `0.25`, `0.5`, `0.75`, `2`; default speed `0.5`; speed clamp `[0.1, 4]`; `RAMP_SOURCE_SECONDS = 0.25`; `RAMP_STEPS = 5`; each step at least 2 source frames; a region at least 4 source frames; remnants shorter than 0.1 s dropped; minimum recorded hold 0.3 s wall-clock; live rate clamp `[0.0625, 16]`; at most 40 regions per export job; default key `W`.
- Region edges and every step edge are whole source frames (`frameStart` / `frameIndexAt` in `src/utils/frames.ts`).
- Speed regions are not part of undo/redo.
- Do not change how often the store's `currentTime` updates. Exactly one place writes `video.playbackRate`.
- **Testing budget (owner's instruction):** run only the test files for the code you touch (`npx vitest run <files> --no-file-parallelism`), plus `npm run typecheck` and `npm run lint` (0 errors) before each commit. Do NOT run the full suite and do NOT run the app; one smoke check happens at the end and a full test pass happens later.
- Don't add comments or types to code you didn't change.

## Review Focus

1. **A clip whose in or out point falls inside a ramp or a region**: segments start and end mid-step; frame counts still sum to the clip's output length, and the first/last frames show the right source frame. (Task 4)
2. **A freeze inside a slow region**: the hold keeps its own length, play resumes at the region's speed, and a drawing on the frozen frame still reveals in drawn order with normal-length draw-on. (Tasks 3, 4)
3. **Hand-edited or damaged project data**: `speedRegions` with overlaps, `end <= start`, NaN, speed 0 or 100, or not an array, loads as a clean list (or none) without throwing. (Task 1)
4. **Key released while paused, after a seek, or after the window lost focus**: no stuck slow playback, no zero-length region, no region spanning a seek. (Task 7)
5. **A region at the very start or end of the video, and one shorter than twice the ramp**: steps cover it with no gap, overlap, or step shorter than 2 frames. (Task 2)

---

### Task 1: Speed regions — rules, store, project file

**Files:**
- Create: `src/utils/speedRegions.ts`, `src/utils/speedRegions.test.ts`, `src/stores/speedStore.ts`
- Modify: `src/utils/projectSerializer.ts` (+ its test), `src/App.tsx` (save, load, new-video reset; follow how `clips` is carried)

**Interfaces — Produces:**

```ts
// speedRegions.ts
export interface SpeedRegion { id: string; start: number; end: number; speed: number }
export const SPEED_CHIPS = [0.25, 0.5, 0.75, 2] as const
export const DEFAULT_REGION_SPEED = 0.5
export const MIN_SPEED = 0.1, MAX_SPEED = 4
export const MIN_REGION_FRAMES = 4
export const MIN_REMNANT_SECONDS = 0.1
export function clampSpeed(speed: number): number
/** Snaps to frame starts, clamps to [0, duration]; null when shorter than MIN_REGION_FRAMES. */
export function normalizeRegion(region: SpeedRegion, duration: number, fps: number): SpeedRegion | null
/** Adds or replaces (same id) `region`: trims or splits every other region it covers, drops remnants < MIN_REMNANT_SECONDS, returns the list sorted by start. */
export function placeSpeedRegion(regions: SpeedRegion[], region: SpeedRegion, duration: number, fps: number): SpeedRegion[]
/** Load-time cleanup of untrusted data: non-arrays → []; malformed entries dropped; speeds clamped; earlier entries win overlaps. */
export function sanitizeSpeedRegions(raw: unknown, duration: number, fps: number): SpeedRegion[]
// speedStore.ts
useSpeedStore: { regions: SpeedRegion[]; selectedId: string | null;
  place(region: SpeedRegion): void; remove(id: string): void; setSpeed(id: string, speed: number): void;
  select(id: string | null): void; replaceAll(regions: SpeedRegion[]): void }
```

The store reads `duration` and `fps` from `useVideoStore.getState()`. Serializer: optional top-level `speedRegions`; written version becomes `'1.3'`; sanitize on import where `clips` is sanitized (if duration/fps are not known at import time, do a structural cleanup there and call `sanitizeSpeedRegions` when the regions are put in the store).

- [ ] **Step 1: Failing tests** in `speedRegions.test.ts` (fps 30, duration 20):

```ts
const r = (id: string, start: number, end: number, speed = 0.5) => ({ id, start, end, speed })
expect(placeSpeedRegion([], r('a', 2, 4), 20, 30)).toEqual([r('a', 2, 4)])
// new region inside an old one splits it
expect(placeSpeedRegion([r('a', 2, 8)], r('b', 4, 6, 0.25), 20, 30).map(x => [x.start, x.end, x.speed]))
  .toEqual([[2, 4, 0.5], [4, 6, 0.25], [6, 8, 0.5]])
// covering an old one removes it; partial overlap trims it
expect(placeSpeedRegion([r('a', 3, 4)], r('b', 2, 5), 20, 30).map(x => x.id)).toEqual(['b'])
expect(placeSpeedRegion([r('a', 2, 5)], r('b', 4, 7), 20, 30).map(x => [x.start, x.end])).toEqual([[2, 4], [4, 7]])
// a remnant under 0.1 s is dropped
expect(placeSpeedRegion([r('a', 2, 5)], r('b', 2.05, 7), 20, 30).map(x => x.id)).toEqual(['b'])
// moving a region (same id) does not collide with itself
expect(placeSpeedRegion([r('a', 2, 4)], r('a', 3, 5), 20, 30)).toEqual([r('a', 3, 5)])
expect(normalizeRegion(r('a', 2.011, 2.05), 20, 30)).toBeNull()               // under 4 frames
expect(normalizeRegion(r('a', -1, 25), 20, 30)).toMatchObject({ start: 0, end: 20 })
// Review Focus 3
expect(sanitizeSpeedRegions('nope', 20, 30)).toEqual([])
expect(sanitizeSpeedRegions([{ id: 'a', start: 2, end: 4, speed: 100 }, { start: NaN, end: 1 }, null, r('b', 5, 4), r('c', 3, 6, 0)], 20, 30)
  .map(x => [x.id, x.start, x.end, x.speed])).toEqual([['a', 2, 4, 4], ['c', 4, 6, 0.1]])
```

  Serializer test: round-trip a project with two regions (version `'1.3'`); a `'1.2'` JSON without the field imports with `speedRegions` undefined or `[]`.

- [ ] **Step 2: Run** the two test files; new cases fail.
- [ ] **Step 3: Implement** the pure functions, the store, the serializer field, and the App wiring.
- [ ] **Step 4: Run** the two files, typecheck, lint; pass.
- [ ] **Step 5: Commit** `feat: add speed regions to the project model`

---

### Task 2: The speed map (pure)

**Files:** Create `src/export/speedMap.ts`, `src/export/speedMap.test.ts`

**Interfaces:**
- Consumes: `SpeedRegion` (Task 1), `frameStart`/`frameIndexAt` (`src/utils/frames.ts`).
- Produces:

```ts
export interface SpeedStep { start: number; end: number; speed: number }
export const RAMP_SOURCE_SECONDS = 0.25
export const RAMP_STEPS = 5
export const MIN_STEP_FRAMES = 2
/** Constant-speed steps covering [0, duration] with no gaps or overlaps; equal-speed neighbours merged; every edge a frame start. `regions` must already be clean (Task 1). No regions → [{ start: 0, end: duration, speed: 1 }]. */
export function buildSpeedSteps(regions: SpeedRegion[], duration: number, fps: number): SpeedStep[]
export function speedAt(steps: SpeedStep[], srcTime: number): number
/** On-screen seconds between two source times, excluding holds. Negative when toSrc < fromSrc. */
export function presentationOffset(steps: SpeedStep[], fromSrc: number, toSrc: number): number
/** Inverse of presentationOffset for seconds >= 0; clamps at the last step's end. */
export function sourceAtPresentation(steps: SpeedStep[], fromSrc: number, seconds: number): number
```

Ramp rule: ramp frames = `round(RAMP_SOURCE_SECONDS * fps)`, limited to half the region's frames (floor); step count `n = min(RAMP_STEPS, floor(rampFrames / MIN_STEP_FRAMES))`, at least 1 when the ramp has ≥ 2 frames, 0 ramp steps when it has fewer (the region is then a single step); the ramp's frames are split as evenly as whole frames allow, extra frames going to the steps nearest the region's middle; step `i` of `n` (1-based, from the outside in) has speed `outside + (inside − outside) * i / (n + 1)`. The ramp lies inside the region. Where two regions touch, `outside` for each is the other's speed.

- [ ] **Step 1: Failing tests** (fps 30, duration 10):

```ts
const one = buildSpeedSteps([{ id: 'a', start: 2, end: 4, speed: 0.5 }], 10, 30)
// 0.25 s = 7.5 → 8 ramp frames → 4 steps of 2 frames; speeds 0.9, 0.8, 0.7, 0.6
expect(one.map(s => +s.speed.toFixed(3))).toEqual([1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.6, 0.7, 0.8, 0.9, 1])
expect(one[0]).toEqual({ start: 0, end: 2, speed: 1 })
expect(one[1].end - one[1].start).toBeCloseTo(2 / 30)
expect(one.at(-1)!.end).toBe(10)
for (let i = 1; i < one.length; i++) expect(one[i].start).toBe(one[i - 1].end)          // no gaps
for (const s of one) expect(Math.abs(s.start * 30 - Math.round(s.start * 30))).toBeLessThan(1e-6)
expect(buildSpeedSteps([], 10, 30)).toEqual([{ start: 0, end: 10, speed: 1 }])
expect(presentationOffset(one, 0, 2)).toBeCloseTo(2)
expect(presentationOffset(one, 2.5, 3.5)).toBeCloseTo(2)                                 // 1 s at 0.5
expect(presentationOffset(one, 3.5, 2.5)).toBeCloseTo(-2)
expect(presentationOffset(one, 2, 4)).toBeCloseTo(2 * (2 / 30) * (1 / 0.9 + 1 / 0.8 + 1 / 0.7 + 1 / 0.6) + (2 - 16 / 30) / 0.5)
expect(sourceAtPresentation(one, 2.5, 2)).toBeCloseTo(3.5)
expect(sourceAtPresentation(one, 0, presentationOffset(one, 0, 7.3))).toBeCloseTo(7.3)   // round trip
expect(speedAt(one, 3)).toBe(0.5); expect(speedAt(one, 1)).toBe(1); expect(speedAt(one, 99)).toBe(1)
// 60 fps: 15 ramp frames → 5 steps of 3 frames
expect(buildSpeedSteps([{ id: 'a', start: 2, end: 4, speed: 0.25 }], 10, 60).length).toBe(13)
```

  Review Focus 5: a region `[0, 0.2]` at 30 fps (6 frames → 3 ramp frames each side → 1 step of 3 frames each side, no middle or a zero-length middle omitted): every step ≥ 2 frames, first step starts at 0. A region ending at `duration`. A 4-frame region. Touching regions `[2,4]@0.5` and `[4,6]@0.25`: no step returns to speed 1 between them, and the speeds across the join move monotonically from 0.5 to 0.25.

- [ ] **Step 2: Run**; fails (module missing).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run**, typecheck, lint; pass.
- [ ] **Step 5: Commit** `feat: add the speed map`

---

### Task 3: Annotation animations run in presentation time

**Files:**
- Modify: `src/export/annotationTiming.ts`, `src/export/liveReveal.ts`, `src/hooks/useLiveReveal.ts`, `src/export/spanBuilder.ts`, `src/components/Canvas/DrawingCanvas.tsx` (the paused visibility effect, if it computes fades)
- Test: `src/export/annotationTiming.test.ts`, `src/export/liveReveal.test.ts`, `src/export/spanBuilder.test.ts`

**Interfaces:**
- Consumes: `SpeedStep`, `presentationOffset` (Task 2).
- Produces: a shared type and one optional trailing parameter on the timing functions; omitted means source-time difference (today's behaviour):

```ts
export type ElapsedBetween = (fromSrc: number, toSrc: number) => number      // on-screen seconds, excluding holds
export function annotationStateAt(annotation: AnnotationTimingInput, t: number, elapsed?: ElapsedBetween): AnnotationTimingState
export function revealElapsed(startTime: number, t: number, holdElapsed: number, revealDelay?: number, elapsed?: ElapsedBetween): number
export function isRevealDue(startTime: number, t: number, holdElapsed: number, revealDelay?: number, elapsed?: ElapsedBetween): boolean
// liveReveal.ts
LiveRevealInput.speedSteps?: SpeedStep[]
// spanBuilder.ts
SpanOptions.speedSteps?: SpeedStep[]
```

  Visibility itself (`startTime <= t <= endTime`) stays in source time. Fade-in uses `elapsed(startTime, t)`, fade-out uses `elapsed(t, endTime)`. `useLiveReveal` builds the steps from `useSpeedStore` + the video store's `duration`/`fps` (memoised on the region list) and passes them; the span builder builds its `ElapsedBetween` from `opts.speedSteps`.

- [ ] **Step 1: Failing tests.** With `steps` = one region `[2,4]@0.5` (fps 30, duration 10) and `el = (a, b) => presentationOffset(steps, a, b)`:

```ts
// a 0.3 s fade-in starting at 3.0 (inside the 0.5 region) is over after 0.15 s of source time
expect(annotationStateAt({ startTime: 3, endTime: 3.9, fadeIn: 0.3 }, 3.1, el).opacity).toBeCloseTo(Math.max(0.5, 0.2 / 0.3))
expect(annotationStateAt({ startTime: 3, endTime: 3.9, fadeIn: 0.3 }, 3.16, el).opacity).toBe(1)
expect(annotationStateAt({ startTime: 3, endTime: 3.9, fadeIn: 0.3 }, 3.16).opacity).toBeLessThan(1)   // without the map: still fading
expect(revealElapsed(3, 3.1, 0, 0, el)).toBeCloseTo(0.2)
expect(revealElapsed(3, 3.1, 0.5, 0.35, el)).toBeCloseTo(0.35)
expect(isRevealDue(3, 3.1, 0, 0.35, el)).toBe(false)
expect(isRevealDue(3, 3.18, 0, 0.35, el)).toBe(true)
```

  `spanBuilder.test.ts`: the same arrow (drawIn 0.35) placed at 3.0 inside the region and at 6.0 outside it, with segments built by hand to play 2.9→3.6 at speed 0.5 and 5.9→6.6 at speed 1 (use the `speed` field from Task 4 if it exists yet; otherwise pass frames via the existing helpers and note the dependency): the number of output frames from first appearance to fully drawn is the same (± 1) in both. Every existing span fixture passes untouched when `speedSteps` is omitted. `liveReveal.test.ts`: with `speedSteps` and `time` advancing at half speed, the fraction after 0.2 s of wall time matches the no-region case after 0.2 s.

- [ ] **Step 2: Run** the three files; new cases fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `src/export` and `src/hooks` tests, typecheck, lint; pass.
- [ ] **Step 5: Commit** `feat: run annotation animations on presentation time`

---

### Task 4: Export timeline with per-segment speed

**Files:**
- Modify: `src/types/clip.ts`, `src/export/outputTimeline.ts`, `src/export/spanBuilder.ts`, `src/export/magnifierOps.ts`, `src/export/clipRenderer.ts`, `src/export/reelPlan.ts` (callers of `buildOutputTimeline`)
- Test: `src/export/outputTimeline.test.ts`, `src/export/magnifierOps.test.ts`, `src/export/clipRenderer.test.ts`

**Interfaces:**
- Produces:

```ts
// clip.ts
export type OutputSegment =
  | { kind: 'play'; srcStart: number; srcEnd: number; speed?: number }   // omitted = 1
  | { kind: 'hold'; srcTime: number; duration: number }
// outputTimeline.ts
export function segmentOutputDuration(segment: OutputSegment): number     // play: (srcEnd - srcStart) / (speed ?? 1)
buildOutputTimeline(..., speedSteps?: SpeedStep[])                         // new optional last parameter
```

  `buildOutputTimeline` splits each play stretch at step boundaries inside it; a play segment gets `speed` only when it is not 1 (so no-region output is deep-equal to today's). `segmentFrameCounts`, `frameSourceTimes` and `framePresentations` use `segmentOutputDuration`. The exporter (`clipRenderer`, `reelPlan`) builds the steps from the project's regions with `probe.fps` and passes them to `buildOutputTimeline` and to the span builder's `speedSteps`. `buildMagnifierOps` maps through segment speeds and merges enable windows that touch (`end === next.start` within 1e-6). A clip with more than 40 regions intersecting it fails before encoding with: `Too many speed regions in this clip (max 40)`.

- [ ] **Step 1: Failing tests** (fps 30; steps from `[2,4]@0.5`, duration 10):
  - Clip 1→5: play segments' speeds are `[undefined, 0.9, 0.8, 0.7, 0.6, 0.5, 0.6, 0.7, 0.8, 0.9, undefined]`; total duration `1 + presentationOffset(steps, 2, 4) + 1`; `frameCount === Math.round(duration * 30)`; `segmentFrameCounts` sums to `frameCount`.
  - `frameSourceTimes`: inside the 0.5 segment consecutive frames advance by `0.5 / 30` of source time.
  - Review Focus 1: clip 2.1→3.9 (in and out inside the ramps): first segment starts at 2.1 with the speed of the step containing 2.1; frame counts sum; last frame's source time < 3.9.
  - Review Focus 2: a 1.5 s freeze at 3.0 inside the region: segments are play(…→3.0, 0.5), hold(3.0, 1.5), play(3.0→…, 0.5); the hold's frame count is 45.
  - No `speedSteps` argument, or `[{start:0,end:duration,speed:1}]`: result deep-equals today's output for an existing fixture.
  - Magnifier visible 2.5→3.5 in clip 1→5: its zoom is enabled for `2 s ± 1 frame` of output time, as ONE window; with no regions the ops equal an existing fixture.
  - 41 regions in one clip → the error above.
- [ ] **Step 2: Run** the three files; new cases fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** all of `src/export`, typecheck, lint; pass.
- [ ] **Step 5: Commit** `feat: carry speed through the export timeline`

---

### Task 5: ffmpeg graph for slowed segments

**Files:** Modify `electron/clipExport.ts`; Test `electron/clipExport.test.ts`

**Interfaces:**
- Consumes: `OutputSegment.speed` (Task 4).

Behaviour:
- `validateClipEncodeOptions`: `speed`, when present, must be a finite number in `[0.1, 4]`; reject otherwise with a message naming the segment index.
- `alignSegmentsToFrames` keeps `speed`.
- `segmentFrameCountsForBuilder` divides a play segment's duration by its speed (keep it in step with `segmentFrameCounts`; add a test that the two agree on a shared case).
- Video, play segment with `speed !== 1` (speed 1 or absent: today's string, unchanged): trim as today, then `setpts=(PTS-STARTPTS)/<speed>`, resample to the output rate inside the segment and force exactly `segFrameCounts[i]` frames with sequential timestamps at `fps`, so `concat` sees a normal run of frames. Suggested chain (verify against the bundled ffmpeg and change if it misbehaves): `trim…,setpts=(PTS-STARTPTS)/S,fps=F,trim=end_frame=N,setpts=N/(F*TB)`, padding with a cloned last frame when the resample yields fewer than N. A segment whose planned count is 0 is omitted from the concat inputs (and from the audio concat) rather than emitted empty.
- Audio, play segment with `speed !== 1`: the `anullsrc` silence block holds use, with `atrim=duration=<segmentOutputDuration>`.
- The existing end-to-end ffmpeg test (it generates fixtures and checks frames/pixels) gains one case: a clip with a 0.5 region; assert the output frame count equals the planned `frameCount`, that a frame in the middle of the slow section shows the expected source frame (the fixture burns in or encodes frame identity; reuse its method), and that the audio stream's duration matches the video's within one frame.

- [ ] **Step 1: Failing tests**: validation accepts 0.5 and rejects 0, 5, NaN and `'fast'`; the graph for `[play 1→2, play 2→3 @0.5, hold 3 for 1 s, play 3→4]` contains today's exact string for segments 0 and 3, contains `/0.5` and `end_frame=60` for segment 1 (at 30 fps), and its audio part has `anullsrc…atrim=duration=2` for segment 1; a graph with no `speed` anywhere equals today's graph string for string (reuse an existing fixture); the e2e case above.
- [ ] **Step 2: Run** `npx vitest run electron/clipExport.test.ts --no-file-parallelism`; new cases fail.
- [ ] **Step 3: Implement.** If the e2e case shows frame loss or A/V drift with the suggested chain, fix the chain, not the test's tolerance.
- [ ] **Step 4: Run** that file, typecheck, lint; pass.
- [ ] **Step 5: Commit** `feat: encode slowed segments with exact frame counts`

---

### Task 6: Live playback follows the speed map

**Files:**
- Create: `src/hooks/useSpeedPlayback.ts`, `src/utils/liveRate.ts`, `src/utils/liveRate.test.ts`
- Modify: `src/components/VideoPlayer/VideoPlayer.tsx` (remove the "Sync playback rate" effect; mount the hook), `src/components/VideoPlayer/VideoControls.tsx` (badge)

**Interfaces:**
- Consumes: `buildSpeedSteps`, `speedAt` (Task 2), `useSpeedStore` (Task 1).
- Produces:

```ts
// liveRate.ts
export const MIN_LIVE_RATE = 0.0625, MAX_LIVE_RATE = 16
/** userRate × region speed, clamped. `recordingSpeed` (Task 7) overrides the map while a region is being recorded. */
export function liveRate(userRate: number, regionSpeed: number, recordingSpeed: number | null): number
/** Whether region audio muting applies: true when the effective region speed is not 1. */
export function regionMutes(regionSpeed: number, recordingSpeed: number | null): boolean
```

  `useSpeedPlayback(video)`: the single writer of `video.playbackRate`. It applies the rate immediately when the user's rate changes or playback starts, and while playing runs a `requestAnimationFrame` loop that reads `video.currentTime`, looks up the step, and writes the rate only when it changes. Reverse shuttle (the store's `reverseRate > 0`) is left alone. Region muting: set `video.muted = true` while `regionMutes(...)`, restoring the user's own mute state (from the store) on leaving; never write the user's mute setting to the store from here. The controls show a small badge with the region speed (e.g. `50%`) while the playhead is in a region; the dropdown keeps showing the user's rate.

- [ ] **Step 1: Failing tests** in `liveRate.test.ts`: `liveRate(1, 0.5, null) === 0.5`; `liveRate(8, 4, null) === 16`; `liveRate(0.25, 0.1, null) === 0.0625`; `liveRate(1, 1, 0.5) === 0.5`; `liveRate(2, 0.25, 0.5) === 1` (recording overrides the map); `regionMutes(1, null) === false`; `regionMutes(0.5, null) === true`; `regionMutes(1, 0.5) === true`.
- [ ] **Step 2: Run**; fails.
- [ ] **Step 3: Implement** the helpers, the hook and the wiring. Grep for every other write to `playbackRate` (the store's `setPlaybackRate`, shuttle code) and route them so the hook stays the only writer to the element, or document in the report why a second writer is safe.
- [ ] **Step 4: Run** that file plus `src/stores/videoStore.test.ts`, typecheck, lint; pass.
- [ ] **Step 5: Commit** `feat: play speed regions live`

---

### Task 7: Record a region by holding a key

**Files:**
- Create: `src/utils/slowRecording.ts`, `src/utils/slowRecording.test.ts`
- Modify: `src/stores/shortcutsStore.ts`, `src/hooks/useKeyboardShortcuts.ts`, `src/stores/videoStore.ts`, `src/components/VideoPlayer/VideoControls.tsx` (Slow button), `src/components/VideoPlayer/VideoPlayer.tsx` (end recording on user pause / seek)

**Interfaces:**
- Consumes: `useSpeedStore.place`, `DEFAULT_REGION_SPEED`, `normalizeRegion`, `liveRate`'s `recordingSpeed`.
- Produces:

```ts
// slowRecording.ts
export const MIN_SLOW_HOLD_SECONDS = 0.3
export type SlowRecordingResult =
  | { record: true; region: { start: number; end: number; speed: number } }
  | { record: false; reason: 'too-short' | 'no-motion' }
/** Decides what a finished hold becomes. `heldSeconds` is wall-clock. */
export function finishSlowRecording(startSrc: number, endSrc: number, heldSeconds: number, speed: number, duration: number, fps: number): SlowRecordingResult
// videoStore.ts
slowRecording: { startSrc: number; at: number; speed: number } | null
beginSlowRecording: () => void        // only when playing forward and not already recording
endSlowRecording: () => void          // places the region or toasts why not; always clears the state
```

Behaviour: shortcut action `video.slow`, default key `w`, category Video Playback, label "Slow motion: hold while playing". Key down (ignoring `e.repeat`) calls `beginSlowRecording`; key up calls `endSlowRecording`; add key-up handling beside the existing stop-key handler. A "Slow" button next to Freeze does the same on pointer down / up (and pointer leave/cancel). `endSlowRecording` is also called on: user pause (not the pause an automatic freeze causes), any seek, `window` blur, and video element change. Toasts: success `"<length>s slow motion at 50%"` (length = source seconds, one decimal); `'too-short'` → `"Slow motion too short: nothing recorded"`; `'no-motion'` → no toast.

- [ ] **Step 1: Failing tests** in `slowRecording.test.ts` (fps 30, duration 20):

```ts
expect(finishSlowRecording(2.011, 3.517, 3.0, 0.5, 20, 30)).toEqual({ record: true, region: { start: 2, end: 3.5, speed: 0.5 } })
expect(finishSlowRecording(2, 2.1, 0.2, 0.5, 20, 30)).toEqual({ record: false, reason: 'too-short' })
expect(finishSlowRecording(2, 2.05, 1.0, 0.5, 20, 30)).toEqual({ record: false, reason: 'no-motion' })   // under 4 frames of source
expect(finishSlowRecording(3, 2, 1.0, 0.5, 20, 30)).toEqual({ record: false, reason: 'no-motion' })
```

  `videoStore.test.ts` (fake video element): `beginSlowRecording` while paused or while `reverseRate > 0` leaves `slowRecording` null; while playing it records `startSrc` from `videoElement.currentTime`; a second `begin` while recording changes nothing; `endSlowRecording` with no recording is a no-op; after `end`, `slowRecording` is null in every outcome (Review Focus 4).

- [ ] **Step 2: Run** both files; new cases fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** both files, typecheck, lint; pass.
- [ ] **Step 5: Commit** `feat: record slow motion by holding W`

---

### Task 8: Speed lane on the timeline

**Files:**
- Create: `src/components/Timeline/SpeedLane.tsx`
- Modify: `src/components/Timeline/AnnotationTimeline.tsx`, `src/utils/timelineSnap.ts` (+ test) only if a helper needs generalising

**Interfaces:**
- Consumes: `useSpeedStore`, `SPEED_CHIPS`, `placeSpeedRegion` via `store.place`, `snapTime`/`frameWithin` (existing), `RAMP_SOURCE_SECONDS`.

Behaviour: a "Speed" lane between the clips lane and the annotation bars, rendered only when there is at least one region. Each region is a band labelled with its speed as a percentage (`50%`, `200%` shown as `2x`), with a gradient over the ramp portion at each end. Click selects (and deselects any annotation selection UI the panel shows); drag the body to move, an edge to resize, with playhead and whole-frame snapping (Alt disables the playhead snap); live-update the band while dragging from local state and call `store.place` once on mouse-up, so overlaps resolve then. With a region selected, show chips `25% · 50% · 75% · 2x` (the selected one highlighted) and a Delete button where the annotation details are shown; Delete/Backspace removes the selected region when focus is not in an input.

- [ ] **Step 1: Failing test** for any pure helper you add (e.g. `formatSpeed(0.5) === '50%'`, `formatSpeed(2) === '2x'`, a function that turns a drag into a candidate region with the 4-frame minimum); put it in an existing or new `src/utils/*.test.ts`.
- [ ] **Step 2: Run**; fails.
- [ ] **Step 3: Implement** the lane and the panel controls, following the patterns of `ClipBar` and `TimelineMarker` in `AnnotationTimeline.tsx`.
- [ ] **Step 4: Run** the touched test files, typecheck, lint; pass.
- [ ] **Step 5: Commit** `feat: show and edit speed regions on the timeline`

---

### Task 9: Docs and changelog

**Files:** Modify `CHANGELOG.md` (`[Unreleased]`), `KEYBOARD_SHORTCUTS.md`

- [ ] **Step 1:** Changelog, in the file's user-facing voice. Added: hold `W` (or the Slow button) while playing to record a slow-motion section; it eases in and out; drag it or change its speed (25%, 50%, 75%, 2x) on the timeline's Speed lane; exports play it at that speed, silent during the section; drawings keep their normal draw-on and fade timing inside it. Note that slow motion repeats frames, so 60 fps footage looks smoother.
- [ ] **Step 2:** `KEYBOARD_SHORTCUTS.md`: add `W` to the playback table and a short "Slow motion" section (hold to record, what ends a recording, that the speed dropdown multiplies with it).
- [ ] **Step 3: Commit** `docs: describe speed regions`

The end-of-release smoke check in the running app (hold `W`, replay, export an MP4 across a region with a drawing inside it) is run by the controller, not by a task.
