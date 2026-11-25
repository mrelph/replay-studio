# Timing Made Easy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Timing sets itself: drawing pauses on the exact frame and creates a freeze whose hold is calculated from the drawings, which reveal in drawn order; "Stays" chips set how long drawings remain.

**Architecture:** Two saved fields (`revealDelay` per drawing, `freezeAuto` on the frame's freeze carrier). One pure function sequences a frame's drawings and sizes the hold; the store re-runs it whenever a frame's drawings change. A shared "is it due" gate in `annotationTiming.ts` hides drawings until their turn in both the live loop and the export span builder.

**Tech Stack:** Electron, React 18, TypeScript, Zustand, Fabric.js 5, Vitest (jsdom).

**Spec:** `docs/superpowers/specs/2026-11-25-timing-made-easy-design.md`. Read it before any task. Release 1 background: `docs/superpowers/specs/2026-11-23-broadcast-look-design.md`.

## Global Constraints

- Work on branch `timing-made-easy` (create from `main`). Conventional commits. Do not push. Do not touch `git stash`.
- Old projects (no `revealDelay`, no `freezeAuto`) must load, play and export exactly as before.
- Hidden features stay hidden: tracker/YOLO, audience view, laser pointer. Do not add UI for them.
- Do not change how often the store's `currentTime` updates. Read `videoElement.currentTime` where frame accuracy matters.
- No new dependencies. No ffmpeg or main-process changes.
- Inspector edits and timeline drags stay non-undoable. Add, delete and toolbar chip re-timing are undoable, and the recalculation they cause is part of the same undo step (never a second one).
- A hand-set hold (`freezeAuto` not true) is never recalculated. Freeze 0 must survive further drawings on that frame.
- Exact values: no-draw-on step `0.15` s; reading time `1.0` s; hold rounded to `0.1` s and capped at `MAX_RECORDED_HOLD_SECONDS` (30); chips `Freeze only`, `1s`, `2s`, `4s`, `To end`; default chip `2`; Freeze field max `30`.
- Tests: `npx vitest run <file> --no-file-parallelism` (the repo is on a network share; parallel runs flake). Before each commit also run `npm run typecheck` and `npm run lint` (0 errors).
- Don't add comments or types to code you didn't change.

## Review Focus

1. **Undo after drawing on a fresh frame** removes the drawing *and* its automatic freeze marker in one step; redo brings both back. (Task 3)
2. **Loading a 1.7.0 project** creates no freezes and assigns no delays, even though loading adds annotations. (Task 3)
3. **A drawing whose start is dragged onto a frozen frame mid-sequence, or a clip whose in-point falls inside a hold**, never leaves a drawing permanently hidden: once source time passes `startTime + revealDelay`, it is due regardless of holds. (Task 4)
4. **Play pressed twice quickly, or Space during the preview**, ends the hold and resumes once; it never leaves a stray timer that pauses playback later. (Task 6)
5. **`Freeze only` on a frame whose freeze was set to 0**, and on the last frame of the video, yields a valid annotation (`endTime > startTime`, within duration) that never shows on the following frame. (Task 7)

---

### Task 1: Model fields and the "due" gate

**Files:**
- Modify: `src/export/annotationTiming.ts`, `src/stores/drawingStore.ts` (`Annotation`, `AnnotationSnapshot`, snapshot build/restore), `src/utils/projectSerializer.ts`, `src/App.tsx` (project loader, where `drawIn` is copied)
- Test: `src/export/annotationTiming.test.ts`, `src/utils/projectSerializer.test.ts`, `src/stores/drawingStore.test.ts`

**Interfaces:**
- Produces:
  - `Annotation.revealDelay?: number`, `Annotation.freezeAuto?: boolean` (same on `AnnotationSnapshot` and the serialized annotation).
  - `AnnotationTimingInput.revealDelay?: number`
  - `revealElapsed(startTime: number, t: number, holdElapsed: number, revealDelay?: number): number` — existing value minus `revealDelay ?? 0`, floored at 0.
  - `isRevealDue(startTime: number, t: number, holdElapsed: number, revealDelay?: number): boolean` — true when `revealDelay` is undefined/0/negative/NaN, else `max(0, t - startTime) + holdElapsed >= revealDelay - 1e-6`.

- [ ] **Step 1: Failing tests** in `annotationTiming.test.ts`:

```ts
expect(revealElapsed(3, 3, 0.5, 0.35)).toBeCloseTo(0.15)
expect(revealElapsed(3, 3, 0.2, 0.35)).toBe(0)
expect(revealElapsed(3, 3.4, 0, undefined)).toBeCloseTo(0.4)
expect(isRevealDue(3, 3, 0, undefined)).toBe(true)
expect(isRevealDue(3, 3, 0, 0)).toBe(true)
expect(isRevealDue(3, 3, 0.34, 0.35)).toBe(false)
expect(isRevealDue(3, 3, 0.35, 0.35)).toBe(true)
expect(isRevealDue(3, 3.4, 0, 0.35)).toBe(true)   // no hold: source time alone makes it due
expect(isRevealDue(3, 3, 0, Number.NaN)).toBe(true)
```

  Serializer: round-trip an annotation with `revealDelay: 0.35` and a marker with `freezeAuto: true, freezeDuration: 1.7`; a project JSON without either loads with both `undefined`. Store: undo/redo preserves both fields (mirror the existing `drawIn` undo test).

- [ ] **Step 2: Run** the three test files; expect failures for the new cases.
- [ ] **Step 3: Implement** the fields and functions. Follow exactly how `drawIn` is carried through each file.
- [ ] **Step 4: Run** the three files plus typecheck and lint; all pass.
- [ ] **Step 5: Commit** `feat: add revealDelay and freezeAuto to the annotation model`

---

### Task 2: Sequence a frame's drawings (pure)

**Files:**
- Create: `src/utils/freezeSequence.ts`, `src/utils/freezeSequence.test.ts`

**Interfaces:**
- Consumes: `MAX_RECORDED_HOLD_SECONDS` from `src/utils/freezeMarkers.ts`.
- Produces:

```ts
export const NO_DRAW_STEP_SECONDS = 0.15
export const READ_TIME_SECONDS = 1.0
export interface SequenceItem { id: string; drawIn?: number }
export interface FrameSequence { delays: Map<string, number>; hold: number }
/** `items` in creation order; freeze markers excluded by the caller. Empty input → no delays, hold 0. */
export function sequenceFrame(items: SequenceItem[]): FrameSequence
```

- [ ] **Step 1: Failing tests**

```ts
const s = sequenceFrame([{ id: 'a', drawIn: 0.35 }, { id: 'b', drawIn: 0.4 }, { id: 't' }, { id: 'c', drawIn: 0.35 }])
expect(s.delays.get('a')).toBe(0)
expect(s.delays.get('b')).toBeCloseTo(0.35)
expect(s.delays.get('t')).toBeCloseTo(0.75)
expect(s.delays.get('c')).toBeCloseTo(0.9)
expect(s.hold).toBeCloseTo(2.3)                    // 0.9 + 0.35 + 1.0 = 2.25 → 2.3 (round to 0.1)
expect(sequenceFrame([{ id: 'a', drawIn: 0.35 }]).hold).toBeCloseTo(1.4)   // 1.35 → 1.4
expect(sequenceFrame([{ id: 't', drawIn: 0 }]).hold).toBeCloseTo(1.2)      // 0.15 + 1.0 = 1.15 → 1.2
expect(sequenceFrame([]).hold).toBe(0)
expect(sequenceFrame(Array.from({ length: 200 }, (_, i) => ({ id: String(i), drawIn: 0.4 }))).hold).toBe(30)
```

  Round half up (`Math.round(x * 10 + 1e-9) / 10`). A `drawIn` that is negative or NaN counts as no draw-on (0.15 step).

- [ ] **Step 2: Run** `npx vitest run src/utils/freezeSequence.test.ts --no-file-parallelism`; fails (module missing).
- [ ] **Step 3: Implement** `sequenceFrame`.
- [ ] **Step 4: Run**; passes.
- [ ] **Step 5: Commit** `feat: sequence a frozen frame's drawings and size the hold`

---

### Task 3: One freeze per frame, and automatic recalculation in the store

**Files:**
- Modify: `src/utils/freezeMarkers.ts`, `src/stores/drawingStore.ts`
- Test: `src/utils/freezeMarkers.test.ts` (create if absent), `src/stores/drawingStore.test.ts`

**Interfaces:**
- Consumes: `sequenceFrame` (Task 2), fields (Task 1).
- Produces, in `freezeMarkers.ts`:

```ts
/** The frame's freeze carrier: an annotation on `time`'s frame whose `freezeDuration` is a number (0 included). Prefers toolType 'freeze'. */
export function findFreezeCarrierAt(annotations: Annotation[], time: number, fps: number): Annotation | undefined
/** Sets the frame's freeze through its carrier, creating a marker if none. `opts.history: false` must not save undo state. Returns the carrier id. */
export function setFrameFreeze(time: number, seconds: number, fps: number, opts: { auto: boolean; history?: boolean }): string | null
```

  `findFreezeAt` keeps its current meaning (duration > 0) because playback uses it; make it resolve through the carrier so live playback and export agree on which one counts. `addFreezeMarker` gains an optional third parameter `opts?: { auto?: boolean; history?: boolean }`. `setFreezeAt`/`clearFreezeAt` are reimplemented on top of the carrier lookup.

- Produces, in `drawingStore.ts`:

```ts
addAnnotation: (annotation: Annotation, opts?: { history?: boolean }) => void   // history false → no saveState
/** Re-sequences each frame: assigns revealDelay in array order; resizes the hold if the carrier is automatic;
 *  creates an automatic marker when `createFreeze` and the frame has drawings but no carrier;
 *  removes an automatic marker when the frame has no drawings left. Never saves undo state. */
syncFrames: (times: number[], opts?: { createFreeze?: boolean }) => void
```

  Call sites inside the store: `removeAnnotations` (after removal, for each removed non-freeze annotation's `startTime`), `updateAnnotation` (when `updates` contains `drawIn` or `startTime`: old and new `startTime`). Not from `addAnnotation` itself: project load and undo restore add annotations and must not create freezes (Task 5 calls `syncFrames` from the drawing path). `syncFrames` reads `fps` from `useVideoStore.getState()`, skips entirely while `isRestoring`, and must not recurse through `updateAnnotation`.

- [ ] **Step 1: Failing tests.** `freezeMarkers.test.ts`:

  - Carrier lookup returns a marker with `freezeDuration: 0`; prefers the marker over a drawing that also has `freezeDuration`; returns a legacy drawing carrier when there is no marker; `findFreezeAt` returns `undefined` for a 0 carrier.
  - `setFrameFreeze(t, 0, fps, { auto: false })` on a frame with an automatic marker leaves exactly one carrier with `freezeDuration === 0` and `freezeAuto === false`; a following `setFrameFreeze(t, 2, fps, { auto: false })` updates the same annotation (no second marker).

  `drawingStore.test.ts` (set a canvas stub the way the existing undo test does):

  - Add arrow `a` (`drawIn 0.35`) at t=3, then `syncFrames([3], { createFreeze: true })`: one `freeze` annotation at t=3 with `freezeAuto === true`, `freezeDuration` ≈ 1.4, `a.revealDelay === 0`. Add `b` (`drawIn 0.4`) and sync: `b.revealDelay` ≈ 0.35, hold ≈ 1.8.
  - `removeAnnotations(['a'])`: `b.revealDelay === 0`, hold ≈ 1.4. Remove `b`: the automatic marker is gone.
  - Hand-set: carrier `freezeAuto: false, freezeDuration: 5`; add and sync a drawing: hold stays 5, delay still assigned. Carrier 0/false: stays 0 and no second marker appears.
  - `updateAnnotation('a', { drawIn: 1 })` on an automatic frame grows the hold by 0.65 (to the rounding).
  - `updateAnnotation('b', { startTime: 9 })` re-sequences frame 3 and frame 9; frame 9 gets no freeze (`createFreeze` only from the draw path).
  - Undo (Review Focus 1): from an empty store, add `a`, sync with `createFreeze`; one `undo()` leaves zero annotations; `redo()` restores both, marker still `freezeAuto`.
  - Load (Review Focus 2): adding three annotations without calling `syncFrames` leaves no `freeze` annotation and all `revealDelay` undefined.

- [ ] **Step 2: Run** both files; new cases fail.
- [ ] **Step 3: Implement.** The marker must be created with `history: false` when it comes from `syncFrames`, so the drawing's own `saveState` is the only undo entry.
- [ ] **Step 4: Run** both files plus `src/export` tests, typecheck, lint; all pass.
- [ ] **Step 5: Commit** `feat: one freeze per frame with automatic hold recalculation`

---

### Task 4: Drawn-order visibility in the live loop and in export

**Files:**
- Modify: `src/export/liveReveal.ts`, `src/hooks/useLiveReveal.ts`, `src/export/spanBuilder.ts`, `src/export/clipRenderer.ts` (pass `revealDelay` through, wherever `drawIn` is passed)
- Test: `src/export/liveReveal.test.ts`, `src/export/spanBuilder.test.ts`, `src/export/clipRenderer.test.ts`

**Interfaces:**
- Consumes: `isRevealDue`, `revealElapsed` with delay (Task 1).
- Produces:
  - `LiveRevealAnnotation.revealDelay?: number`
  - `stepLiveReveal(input): Map<string, { fraction: number; due: boolean }>` (return type changes; update `useLiveReveal`, which sets `object.visible = visible && due`).
  - `SpanAnnotationLike` gains `revealDelay` through `AnnotationTimingInput`. `computeFrameSignature` omits an annotation that is not due, at every `revealSteps` value including 1 and for `revealKind === 'none'` tools.

  Rules for both paths:
  - Track hold time for any annotation with `drawIn > 0` **or** `revealDelay > 0` (today only `drawIn > 0`).
  - Live: an annotation with a positive `revealDelay` is armed under the same conditions as today's draw-on arming. Not armed → `{ fraction: 1, due: true }` (so a paused user, and "playback never arrived", show finished shapes). Armed → `due` from `isRevealDue`, latched true once true (a hold's snap-back must not hide it again); `fraction` from the delayed `revealElapsed`, monotonic as today.
  - Export: `due` from `isRevealDue(startTime, srcTime, holdElapsedFor(annotation), revealDelay)`.

- [ ] **Step 1: Failing tests.**

  `spanBuilder.test.ts`: segments `play 2.9→3.0`, `hold at 3.0 for 2.3 s`, `play 3.0→4.0` at 30 fps; annotations `a` (start 3, drawIn 0.35, delay 0), `b` (start 3, drawIn 0.4, delay 0.35), `t` (text, start 3, delay 0.75), all ending at 5.
  - The first hold frame's signature contains only `a`.
  - `b` first appears at the frame whose `holdElapsed >= 0.35`; `t` at `>= 0.75`, with `revealBucket === revealSteps`.
  - With `maxRevealSteps: 1` the same three first-appearance frames hold (order survives the fallback) and every bucket equals 1.
  - With **no hold segment** (Review Focus 3): `b` appears at source time ≥ 3.35 and `t` at ≥ 3.75; with a clip starting at source 3.5, `b` is present on output frame 0.
  - An annotation without `revealDelay` produces the same spans as before this task (keep an existing fixture and assert equality).

  `liveReveal.test.ts`: during an active hold on frame 3 with `now - startedAt = 200 ms`, `b` is `{ due: false }` and `a` is due with `0 < fraction < 1`; at 400 ms `b` is due; after `endedAt` and a snap-back tick, `b` stays due; when `playing` is false and no hold is active, every entry is `{ fraction: 1, due: true }`.

  `clipRenderer.test.ts`: `revealDelay` reaches the span builder (one assertion beside the existing `drawIn` one).

- [ ] **Step 2: Run** the three files; new cases fail.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** all of `src/export` and `src/hooks`, typecheck, lint; all pass.
- [ ] **Step 5: Commit** `feat: reveal drawings in drawn order, live and in export`

---

### Task 5: Pause on draw, exact frame capture, late-freeze fix

**Files:**
- Modify: `src/utils/frames.ts`, `src/stores/videoStore.ts`, `src/components/Canvas/DrawingCanvas.tsx`, `src/components/VideoPlayer/VideoPlayer.tsx`
- Test: `src/utils/frames.test.ts`, `src/stores/videoStore.test.ts`

**Interfaces:**
- Consumes: `syncFrames` (Task 3), `findFreezeCarrierAt`, `setFrameFreeze`.
- Produces:

```ts
// frames.ts
export function snapToFrame(time: number, fps: number): number   // timeForFrame(frameIndexAt(time, fps), fps)
// videoStore.ts
freezeTiming: { time: number; at: number; resumeTime: number } | null
noteFreezeFrame: (time: number) => void        // updates freezeTiming.resumeTime; no-op when not timing
/** Pauses if playing, snaps the video to its current frame start, updates the store's currentTime, returns that time. */
captureDrawFrame: () => number
pendingPreview: number | null                  // frame time just drawn on, awaiting its first Play (used by Task 6)
setPendingPreview: (time: number | null) => void
```

Behaviour:
- `DrawingCanvas.tsx`: at pointer-down that begins a new annotation for pen, line, arrow, arc-arrow, rectangle, circle, text, spotlight, magnifier (not select, not when the pointer lands on an existing object, not hidden tools), call `captureDrawFrame()` and keep the result in a ref. The pen's free-drawing path returns early from the mouse-down handler today, so hook it where fabric starts the stroke. `createAnnotation` takes that captured time as `startTime` instead of the closure's `currentTime`, then calls `syncFrames([startTime], { createFreeze: true })` and `setPendingPreview(startTime)`.
- An empty text box that is deleted on blur goes through `removeAnnotations`, which already re-syncs and removes the automatic marker. It must leave no marker, no toast and no extra undo entry: remove it with history off, or drop the entry that adding it created (the builder picks; assert it in the store test).
- `VideoPlayer.tsx` `handleSeeking`: when `freezeTiming` is set and the seek is within `MAX_PAUSE_DRIFT_SECONDS`, call `noteFreezeFrame(video.currentTime)`. Clear `pendingPreview` when the seek lands on a different frame.
- `VideoPlayer.tsx` `handlePlay`: use `snapToFrame(timing.resumeTime, fps)` for the drift check, the marker time and the toast timecode, not `video.currentTime`. If the resume frame has drawings (non-freeze annotations on that frame index) or a carrier with `freezeAuto`, record nothing and show no toast: the automatic freeze owns that frame. Otherwise `setFrameFreeze(time, hold.seconds, fps, { auto: false })`.

- [ ] **Step 1: Failing tests.**

```ts
// frames.test.ts
expect(frameIndexAt(snapToFrame(3.0569, 30), 30)).toBe(91)
expect(snapToFrame(3.0569, 30)).toBeLessThan(3.0569)
expect(snapToFrame(0.01, 30)).toBe(0)
```

  `videoStore.test.ts` with a fake video element (`paused`, `currentTime`, `pause()`):
  - `captureDrawFrame()` while playing at 3.0569 (fps 30): calls `pause()`, sets `videoElement.currentTime` and the store's `currentTime` to `snapToFrame(3.0569, 30)`, returns it.
  - While paused on an already-snapped time: does not call `pause()` and does not assign `currentTime` (no seek event).
  - `toggleFreeze()` at 3.0569 sets `freezeTiming.time` and `resumeTime` both to 3.0569; `noteFreezeFrame(3.1)` changes only `resumeTime`; `noteFreezeFrame` with no timing leaves state unchanged.

- [ ] **Step 2: Run** both files; new cases fail.
- [ ] **Step 3: Implement** the store and frame helpers, then the canvas and player wiring.
- [ ] **Step 4: Run** `src/utils`, `src/stores`, typecheck, lint; all pass.
- [ ] **Step 5: Run the app and check by hand** (see "Running the app" below): play, draw an arrow mid-play → video stops on that frame, timeline shows the drawing and a freeze at the same timecode; press `H` during playback with no drawing, wait a second, press `H` → the freeze toast's timecode equals the frame shown while paused.
- [ ] **Step 6: Commit** `feat: pause on draw and land freezes on the paused frame`

---

### Task 6: First Play previews the freeze

**Files:**
- Modify: `src/components/VideoPlayer/VideoPlayer.tsx`, `src/stores/videoStore.ts`
- Create: `src/utils/holdPreview.ts`, `src/utils/holdPreview.test.ts`

**Interfaces:**
- Consumes: `pendingPreview` (Task 5), `findFreezeAt` (carrier-aware, Task 3), `beginAutoHold`/`endAutoHold`.
- Produces:

```ts
// holdPreview.ts
/** The freeze to hold on when Play is pressed, or null. Requires a pending preview on the current frame and a carrier with freezeDuration > 0. */
export function previewHoldFor(annotations: Annotation[], pendingPreview: number | null, currentTime: number, fps: number): Annotation | null
```

Behaviour:
- Extract the hold-start block in the `timeupdate` handler (begin auto hold, optional seek, pause, timeout that ends the hold and resumes, out-point/loop handling) into one local function `startHold(ann)` used by both the crossing check and the preview.
- When playback is about to start and `previewHoldFor(...)` returns a freeze: clear `pendingPreview`, mark the freeze as triggered, and `startHold` it from the current frame, so the drawings reveal in order and playback resumes when the hold ends. Prefer intercepting before `video.play()` is called (the store's play/toggle path) so no frame advances; if that is not practical, do it at the top of `handlePlay` and seek back to the frame.
- Play or Space during any hold (preview or crossing): clear the timeout, `endAutoHold()`, resume playback once. Check what the existing user-pause branch in `handlePause` does and make Play behave consistently; add the missing branch rather than a second mechanism.
- A plain `H` freeze with no drawings has no `pendingPreview`, so it resumes immediately as today.
- The live loop needs no change if drawings made while paused arm when the hold begins; confirm it in the app (step 5) and, if they stay finished, fix the `known`/`fresh` bookkeeping in `useLiveReveal.ts` so only annotations created while the loop is running are exempt.

- [ ] **Step 1: Failing tests** in `holdPreview.test.ts`:
  - Returns the carrier when `pendingPreview` and `currentTime` are on the same frame index and the carrier's `freezeDuration` is 1.4.
  - Returns null when `pendingPreview` is null; when the frames differ by one; when the carrier's `freezeDuration` is 0; when there is no carrier.
- [ ] **Step 2: Run**; fails (module missing).
- [ ] **Step 3: Implement** the helper and the player wiring.
- [ ] **Step 4: Run** `src/utils`, `src/stores`, `src/export`, typecheck, lint; all pass.
- [ ] **Step 5: Run the app and check by hand:** play, draw an arrow, a pen stroke and a circle mid-play, press Play → frame holds, the three reveal one after another, then motion resumes on its own. Repeat and press Space half-way through the preview → playback resumes at once and does not pause again a moment later (Review Focus 4). Press Play twice quickly at the start → same. Seek back and replay through the frame → same hold and order.
- [ ] **Step 6: Commit** `feat: preview the freeze on the first Play after drawing`

---

### Task 7: "Stays" chips

**Files:**
- Create: `src/utils/stayPreset.ts`, `src/utils/stayPreset.test.ts`
- Modify: `src/stores/toolStore.ts`, `src/components/Toolbar/DrawingToolbar.tsx`, `src/components/Canvas/DrawingCanvas.tsx` (`createAnnotation`)

**Interfaces:**
- Produces:

```ts
// stayPreset.ts
export type StayPreset = 'freeze' | 1 | 2 | 4 | 'end'
export const STAY_PRESETS: { value: StayPreset; label: string }[]   // 'Freeze only', '1s', '2s', '4s', 'To end'
export const STAY_TOOL_TYPES: ReadonlySet<string>   // pen, path, line, arrow, arc-arrow, rectangle, circle, text, spotlight, magnifier
export interface StayTiming { endTime: number; fadeIn: number; fadeOut: number }
export function stayTiming(preset: StayPreset, startTime: number, videoDuration: number, fps: number, defaults: { fadeIn: number; fadeOut: number }): StayTiming
// toolStore.ts
stayPreset: StayPreset            // default 2
setStayPreset: (preset: StayPreset) => void
```

  `Freeze only` ends at `startTime + 0.5 / fps`: half a frame, so the inclusive end of `annotationStateAt` cannot show it on the next source frame. This refines the spec's "one source frame". If `startTime + 0.5 / fps` exceeds the video duration, keep `endTime` there anyway only if the serializer and timeline accept it; otherwise clamp so that `endTime > startTime` still holds.

- [ ] **Step 1: Failing tests**

```ts
const d = { fadeIn: 0.1, fadeOut: 0.1 }
expect(stayTiming(2, 3, 60, 30, d)).toEqual({ endTime: 5, fadeIn: 0.1, fadeOut: 0.1 })
expect(stayTiming(4, 58, 60, 30, d).endTime).toBe(60)
expect(stayTiming('end', 3, 60, 30, d).endTime).toBe(60)
const f = stayTiming('freeze', 3, 60, 30, d)
expect(f.fadeIn).toBe(0); expect(f.fadeOut).toBe(0)
expect(f.endTime).toBeGreaterThan(3); expect(f.endTime).toBeLessThan(3 + 1 / 30)
expect(annotationStateAt({ startTime: 3, ...f }, 3)).toEqual({ visible: true, opacity: 1 })
expect(annotationStateAt({ startTime: 3, ...f }, 3 + 1 / 30).visible).toBe(false)
const last = stayTiming('freeze', 60, 60, 30, d)                  // Review Focus 5
expect(last.endTime).toBeGreaterThan(60 - 1e-9)
```

  Add one span-builder assertion in `src/export/spanBuilder.test.ts`: a `Freeze only` annotation at 3 with a 2 s hold at 3 is in the signature of every hold frame and of no frame after the hold.

- [ ] **Step 2: Run**; fails.
- [ ] **Step 3: Implement** `stayTiming` and the store field. In `createAnnotation`, for `STAY_TOOL_TYPES` use `stayTiming(stayPreset, startTime, duration, fps, defaults)` for `endTime`/`fadeIn`/`fadeOut`; other tools keep `getToolDefaults(...).duration`.
- [ ] **Step 4: Toolbar.** Add a segmented control labelled "Stays" next to the Outline/Glow/Clean control, same component pattern and styling. Clicking a chip sets `stayPreset`; if styled annotations are selected (use the same selection lookup the style control uses, limited to `STAY_TOOL_TYPES`), call `saveState()` once and `updateAnnotation` each with its `stayTiming` (from its own `startTime` and tool defaults).
- [ ] **Step 5: Run** `src/utils`, `src/export`, `src/stores`, typecheck, lint; all pass.
- [ ] **Step 6: Run the app:** draw with each chip and check the bar length on the timeline; select two drawings, click `4s`, both bars change, one Undo restores both.
- [ ] **Step 7: Commit** `feat: add Stays chips for annotation length`

---

### Task 8: Inspector Freeze field, Auto button, timeline snapping

**Files:**
- Create: `src/utils/timelineSnap.ts`, `src/utils/timelineSnap.test.ts`
- Modify: `src/components/Timeline/AnnotationTimeline.tsx`

**Interfaces:**
- Consumes: `findFreezeCarrierAt`, `setFrameFreeze`, `syncFrames`, `snapToFrame`.
- Produces:

```ts
export const SNAP_PIXELS = 6
/** Snaps to the nearest target within SNAP_PIXELS (unless `free`), then to a whole frame. */
export function snapTime(time: number, targets: number[], pxPerSecond: number, fps: number, free: boolean): number
```

Behaviour:
- Freeze field (`AnnotationDetails`): its value is the frame carrier's `freezeDuration` for the selected annotation's frame (0 when none), `max="30"`. Editing calls `setFrameFreeze(startTime, value, fps, { auto: false })`; 0 keeps a 0 carrier (the anti-goal). Next to it, an "Auto" button, shown when the frame has at least one drawing and the carrier is not automatic: sets `freezeAuto: true` on the carrier (creating one if needed) and calls `syncFrames([startTime])`. When the carrier is automatic, show the text "Auto" beside the field instead of the button.
- Dragging a bar or an edge: pass the candidate time through `snapTime` with targets = the playhead and every carrier's `startTime` with `freezeDuration > 0`; `free` when Alt is held. The existing 0.1 s minimum length stays. The store's `updateAnnotation` already re-syncs frames on `startTime` change (Task 3).

- [ ] **Step 1: Failing tests** in `timelineSnap.test.ts` (fps 30, 100 px/s, so 6 px = 0.06 s):

```ts
expect(snapTime(3.05, [3.0], 100, 30, false)).toBeCloseTo(snapToFrame(3.0, 30))
expect(snapTime(3.05, [3.0], 100, 30, true)).toBeCloseTo(snapToFrame(3.05, 30))
expect(snapTime(3.2, [3.0], 100, 30, false)).toBeCloseTo(snapToFrame(3.2, 30))
expect(snapTime(3.05, [3.0, 3.06], 100, 30, false)).toBeCloseTo(snapToFrame(3.06, 30))   // nearest wins
expect(snapTime(-0.2, [], 100, 30, false)).toBe(0)
```

- [ ] **Step 2: Run**; fails.
- [ ] **Step 3: Implement** `snapTime`, then the inspector and drag wiring.
- [ ] **Step 4: Run** `src/utils`, typecheck, lint; all pass.
- [ ] **Step 5: Run the app:** select a drawing on a frozen frame, type 0 in Freeze, draw another shape on that frame → still no freeze on replay; click Auto → hold returns and replay shows both in order. Type 5 → hold is 5 s and stays 5 after another drawing. Drag a bar's start near the playhead → it snaps; with Alt it does not.
- [ ] **Step 6: Commit** `feat: frame-level freeze control and timeline snapping`

---

### Task 9: Changelog, docs and full check

**Files:**
- Modify: `CHANGELOG.md` (`[Unreleased]`), `KEYBOARD_SHORTCUTS.md` only if a described behaviour changed (drawing while playing now pauses)

- [ ] **Step 1: Changelog.** Under `[Unreleased]`: Added — automatic freezes when you draw, drawn-order reveal, first-Play preview, Stays chips, timeline snapping. Changed — drawing while the video plays pauses on that frame; the Freeze field edits the frame's freeze (max 30 s). Fixed — a recorded freeze landing one or two frames late.
- [ ] **Step 2: Full run.** `npm run typecheck`, `npm run lint`, `npx vitest run --no-file-parallelism` (about 12 minutes; run in the background). All pass.
- [ ] **Step 3: In-app pass** over the spec's Testing section: three shapes mid-play then Play; replay through the hold; each chip; open a project saved by 1.7.0 and confirm no freezes or delays appear; export MP4 and GIF of a clip containing the frozen frame and compare the reveal order and hold length with the live view.
- [ ] **Step 4: Commit** `docs: changelog for timing made easy`

---

## Running the app

Electron cannot launch from this network share on macOS (the share breaks symlinks inside `Electron.app`). Build with `npm run build -- --dir` or `npx vite build`, then drive the built app with Playwright's `_electron` using an Electron 44 binary installed on local disk. The previous release used a driver in the session scratchpad (`drv/lib.mjs`, with `launch`, `openVideo`, `drag`, `vid.seek/time/paused`, `mockSave`); reuse it if it still exists, otherwise recreate it. If `ffmpeg-static` has no binary, run `npm rebuild ffmpeg-static`. If `vite build` fails with ENOTEMPTY, delete `dist/` and retry.
