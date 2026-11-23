# Broadcast Look Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Annotations draw themselves on along the stroke during playback and export, stay readable on any background through a contrast style, and get arrowheads that scale with stroke width.

**Architecture:** A pure reveal clock (`annotationTiming.ts`) is shared by the live canvas and the export renderer. One helper (`reveal.ts`) turns a 0 to 1 fraction into Fabric stroke-dash state. Export adds a quantized reveal bucket to the existing per-frame span signature, so no ffmpeg or main-process change is needed. The live canvas runs its own `requestAnimationFrame` loop that reads the video element directly.

**Tech Stack:** TypeScript, React 18, Fabric.js 5 (import from `@/lib/fabric`), Zustand, Vitest + jsdom.

**Spec:** `docs/superpowers/specs/2026-11-23-broadcast-look-design.md`. Read it before starting any task.

## Global Constraints

- Work on branch `broadcast-look`, never on `main`. Conventional commit messages. Do not push.
- Annotations with `drawIn` undefined or 0 must behave exactly as they do today, live and in export.
- A paused user must always see finished shapes.
- Reveal state (dash arrays, arrowhead scale) must never reach the project file or an undo snapshot.
- Reveal is quantized to at most 12 steps per annotation in export; a job must stay within 500 distinct overlays.
- No changes to `electron/` and no new dependencies.
- Do not raise the update rate of `videoStore.currentTime`.
- Do not touch hidden features (tracker, YOLO, audience view, laser) beyond what a shared helper requires.
- Each task ends with `npm run typecheck`, `npm run lint` (0 errors) and `npm run test` passing.
- Model routing: Tasks 4 and 6 go to an Opus subagent; the rest go to Sonnet subagents.

## Review Focus

1. **Annotation starts before the clip does.** A clip that begins mid-reveal or after it must show the correct fraction (usually finished), not restart the draw-on. Pinned in Task 4.
2. **Resized or scaled shapes.** A shape the user stretched with the select tool must still reveal along its whole stroke; dash lengths are in the object's local units. Pinned in Task 3.
3. **Save or undo during playback.** Saving a project or taking an undo snapshot while a shape is mid-reveal must not persist a half-drawn dash state. Pinned in Task 3.
4. **Export frame rate differs from source.** A 15 fps GIF of 60 fps footage must still match holds to drawings and finish the reveal. Pinned in Task 4.
5. **Bad Draw-on input.** Empty, negative or huge values typed into the inspector must clamp to 0 to 2 seconds. Pinned in Task 9.

---

### Task 1: Reveal clock (pure)

**Files:**
- Modify: `src/export/annotationTiming.ts`
- Test: `src/export/annotationTiming.test.ts`

**Interfaces:**
- Produces:
  - `AnnotationTimingInput` gains `drawIn?: number`.
  - `revealElapsed(startTime: number, t: number, holdElapsed: number): number` returns `Math.max(0, t - startTime) + holdElapsed`.
  - `revealFraction(elapsed: number, drawIn: number | undefined): number` returns 1 when `drawIn` is undefined, 0, negative or NaN; otherwise ease-out cubic `1 - (1 - x)^3` of `x = clamp(elapsed / drawIn, 0, 1)`.
  - `annotationStateAt` ignores `fadeIn` (opacity 1 in the fade-in window) when `drawIn > 0`. Fade-out is unchanged.

- [ ] **Step 1: Write failing tests**

```ts
describe('revealFraction', () => {
  it('is 1 with no drawIn', () => {
    expect(revealFraction(0, undefined)).toBe(1)
    expect(revealFraction(0, 0)).toBe(1)
    expect(revealFraction(0, -1)).toBe(1)
    expect(revealFraction(0, NaN)).toBe(1)
  })
  it('runs 0 → 1 with ease-out', () => {
    expect(revealFraction(0, 0.4)).toBe(0)
    expect(revealFraction(0.2, 0.4)).toBeCloseTo(0.875)
    expect(revealFraction(0.4, 0.4)).toBe(1)
    expect(revealFraction(9, 0.4)).toBe(1)
  })
})
describe('revealElapsed', () => {
  it('adds hold time to source time', () => {
    expect(revealElapsed(5, 5, 0.3)).toBeCloseTo(0.3)
    expect(revealElapsed(5, 5.1, 0.3)).toBeCloseTo(0.4)
    expect(revealElapsed(5, 4, 0)).toBe(0)
  })
})
it('drops the fade-in floor when drawIn is set', () => {
  expect(annotationStateAt({ startTime: 5, endTime: 10, fadeIn: 0.2, drawIn: 0.4 }, 5).opacity).toBe(1)
  expect(annotationStateAt({ startTime: 5, endTime: 10, fadeIn: 0.2 }, 5).opacity).toBe(0.5)
})
```

- [ ] **Step 2:** Run `npx vitest run src/export/annotationTiming.test.ts`. Expected: FAIL, `revealFraction` not exported.
- [ ] **Step 3:** Implement the three changes above and extend the file's header comment to describe presentation time.
- [ ] **Step 4:** Run the same command. Expected: PASS, and all pre-existing tests in the file still pass.
- [ ] **Step 5:** Commit: `feat: add reveal clock for draw-on annotations`

---

### Task 2: `drawIn` on the annotation model

**Files:**
- Modify: `src/stores/drawingStore.ts` (the `Annotation` interface at line 4, `AnnotationSnapshot` at line 26, the snapshot builder near line 98, and wherever a snapshot is restored)
- Modify: `src/utils/projectSerializer.ts` (the serialized annotation type near line 13, the writer near line 155, and the loader)
- Modify: `src/utils/annotationDefaults.ts`
- Modify: `src/components/Canvas/DrawingCanvas.tsx:385-403` (`createAnnotation`)
- Test: `src/utils/projectSerializer.test.ts`, new `src/utils/annotationDefaults.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `Annotation.drawIn?: number`; `ToolDefaults.drawIn: number`; `getToolDefaults(toolType).drawIn`.

`drawIn` defaults in `TOOL_DEFAULTS`: `pen` 0.4, `path` 0.4, `line` 0.35, `arrow` 0.35, `arc-arrow` 0.35, `rectangle` 0.4, `circle` 0.4, every other entry 0. The fallback for unknown tools is 0. For tools with `drawIn > 0`, leave `fadeIn` as it is (Task 1 makes it inert).

- [ ] **Step 1: Write failing tests**

```ts
// annotationDefaults.test.ts
it.each([['pen', 0.4], ['path', 0.4], ['line', 0.35], ['arrow', 0.35], ['arc-arrow', 0.35], ['rectangle', 0.4], ['circle', 0.4]])(
  '%s draws on in %ss', (tool, s) => expect(getToolDefaults(tool).drawIn).toBe(s))
it.each(['text', 'spotlight', 'magnifier', 'tracker', 'select', 'freeze', 'unknown-tool'])(
  '%s has no draw-on', (tool) => expect(getToolDefaults(tool).drawIn).toBe(0))
```

In `projectSerializer.test.ts`, following the file's existing round-trip pattern: an annotation with `drawIn: 0.35` round-trips with `drawIn === 0.35`; a saved project whose annotation has no `drawIn` key loads with `drawIn === undefined`.

- [ ] **Step 2:** Run `npx vitest run src/utils`. Expected: FAIL.
- [ ] **Step 3:** Add the field through the store, snapshot, serializer and defaults; `createAnnotation` passes `drawIn: defaults.drawIn`.
- [ ] **Step 4:** Run `npx vitest run src/utils src/stores`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: store drawIn on annotations`

---

### Task 3: Reveal helper for Fabric objects

**Files:**
- Create: `src/export/reveal.ts`
- Test: `src/export/reveal.test.ts`
- Modify: `src/stores/drawingStore.ts` and `src/utils/projectSerializer.ts` (call `stripReveal` before any `toObject` / `toJSON` of an annotation object or the canvas)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `type RevealKind = 'stroke' | 'arrow' | 'none'`
  - `revealKind(toolType: string): RevealKind`: `pen`, `path`, `line`, `rectangle`, `circle` → `'stroke'`; `arrow`, `arc-arrow` → `'arrow'`; everything else → `'none'`.
  - `strokeLength(object: fabric.Object): number`: stroke length in the object's own local units (unscaled). Path: sum of `fabric.util.getPathSegmentsInfo(path.path)` lengths. Line: hypot of its endpoints. Rect: `2 * (width + height)`. Ellipse: Ramanujan's approximation from `rx`, `ry`.
  - `applyReveal(object: fabric.Object, toolType: string, fraction: number): void`
  - `stripReveal(object: fabric.Object): void`: restores the original state; safe on an object that was never revealed.

Behaviour of `applyReveal`:
- `'none'`: no-op.
- `'stroke'`: on first call, remember the object's original `strokeDashArray` and `strokeDashOffset` in a module-level `WeakMap`. For `fraction < 1` set `strokeDashArray = [L, L]` and `strokeDashOffset = L * (1 - fraction)` where `L = strokeLength(object)`. For `fraction >= 1` restore the originals and forget the entry.
- `'arrow'`: the object is a `fabric.Group` whose item 0 is the shaft (Line or Path) and item 1 is the arrowhead Triangle. Apply the stroke reveal to the shaft using shaft fraction `min(1, fraction / 0.85)`. The head is `visible = false` below 0.85, and from 0.85 to 1 its `scaleX`/`scaleY` run from 0 to their remembered originals. At `fraction >= 1` everything is restored. If the object is not a two-item group, treat it as `'none'`.
- Always set `object.dirty = true` (and on group children) so Fabric's object cache repaints.

- [ ] **Step 1: Write failing tests** (construct real Fabric objects via `@/lib/fabric`, as `clipRenderer.test.ts` does)

```ts
it('half-reveals a line', () => {
  const line = new fabric.Line([0, 0, 100, 0], { stroke: '#f00', strokeWidth: 4 })
  applyReveal(line, 'line', 0.5)
  expect(line.strokeDashArray).toEqual([100, 100])
  expect(line.strokeDashOffset).toBeCloseTo(50)
})
it('restores the original state at 1', () => {
  const line = new fabric.Line([0, 0, 100, 0], { stroke: '#f00' })
  const before = JSON.stringify(line.toObject())
  applyReveal(line, 'line', 0.3); applyReveal(line, 'line', 1)
  expect(JSON.stringify(line.toObject())).toBe(before)
})
it('stripReveal undoes a mid-reveal state (Review Focus 3)', () => {
  const rect = new fabric.Rect({ width: 50, height: 30, stroke: '#f00', fill: 'transparent' })
  const before = JSON.stringify(rect.toObject())
  applyReveal(rect, 'rectangle', 0.4); stripReveal(rect)
  expect(JSON.stringify(rect.toObject())).toBe(before)
})
it('uses local length on a scaled shape (Review Focus 2)', () => {
  const line = new fabric.Line([0, 0, 100, 0], { stroke: '#f00', scaleX: 3 })
  applyReveal(line, 'line', 0.5)
  expect(line.strokeDashArray).toEqual([100, 100])
})
it('holds the arrowhead back until 0.85', () => {
  const shaft = new fabric.Line([0, 0, 100, 0], { stroke: '#f00' })
  const head = new fabric.Triangle({ width: 24, height: 25 })
  const arrow = new fabric.Group([shaft, head])
  applyReveal(arrow, 'arrow', 0.5); expect(head.visible).toBe(false)
  applyReveal(arrow, 'arrow', 0.925); expect(head.visible).toBe(true); expect(head.scaleX).toBeCloseTo(0.5)
  applyReveal(arrow, 'arrow', 1); expect(head.scaleX).toBe(1); expect(shaft.strokeDashArray ?? null).toBeNull()
})
it('ignores text and spotlight', () => {
  const text = new fabric.IText('hi'); const before = JSON.stringify(text.toObject())
  applyReveal(text, 'text', 0.2)
  expect(JSON.stringify(text.toObject())).toBe(before)
})
it('strokeLength of rect and ellipse', () => {
  expect(strokeLength(new fabric.Rect({ width: 50, height: 30 }))).toBe(160)
  expect(strokeLength(new fabric.Ellipse({ rx: 10, ry: 10 }))).toBeCloseTo(2 * Math.PI * 10, 1)
})
```

Add to `projectSerializer.test.ts`: serialize a project whose line annotation has had `applyReveal(obj, 'line', 0.4)` applied; the saved object data has no `strokeDashArray` of `[L, L]` (equals the un-revealed serialization).

- [ ] **Step 2:** Run `npx vitest run src/export/reveal.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3:** Implement `reveal.ts`. Then call `stripReveal` on every annotation object at the top of the undo-snapshot builder in `drawingStore.ts` and the project writer in `projectSerializer.ts`.
- [ ] **Step 4:** Run `npx vitest run src/export src/utils src/stores`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: add stroke-dash reveal helper`

---

### Task 4: Draw-on in export (Opus)

**Files:**
- Modify: `src/export/outputTimeline.ts`
- Modify: `src/export/spanBuilder.ts`
- Modify: `src/export/clipRenderer.ts:65-95` (`renderSpanRgba`) and `:155-165` (span building)
- Test: `src/export/outputTimeline.test.ts`, `src/export/spanBuilder.test.ts`, `src/export/clipRenderer.test.ts`

**Interfaces:**
- Consumes: `revealElapsed`, `revealFraction` (Task 1); `applyReveal` (Task 3); `frameIndexAt(time, fps)` from `@/utils/frames`.
- Produces:
  - `outputTimeline.ts`: `interface FramePresentation { srcTime: number; segmentIndex: number; holdElapsed: number }` and `framePresentations(segments: OutputSegment[], fps: number): FramePresentation[]`. One entry per output frame, same order and length as `frameSourceTimes`. `holdElapsed` is seconds into the current hold segment (`f / fps` for the hold's f-th frame) and 0 on play frames. `frameSourceTimes` keeps its signature and results.
  - `spanBuilder.ts`:
    - `SpanAnnotationLike` gains `toolType?: string` (and `drawIn` through `AnnotationTimingInput`).
    - `AnnotationVisualState` gains `revealBucket: number` and `revealSteps: number`. A finished or non-animated annotation has `revealBucket === revealSteps`.
    - `signatureKey` appends `:${revealBucket}/${revealSteps}`.
    - `interface SpanOptions { sourceFps?: number; maxRevealSteps?: number }`; defaults `sourceFps = fps`, `maxRevealSteps = 12`.
    - `buildDrawingSpans(segments, annotations, fps, opts?: SpanOptions): DrawingSpan[]`
    - `export const MAX_DISTINCT_OVERLAYS = 500` (comment: must match `MAX_OVERLAYS_PER_JOB` in `electron/clipExport.ts`).
    - `buildDrawingSpansWithinBudget(segments, annotations, fps, opts?: SpanOptions): DrawingSpan[]`: tries `maxRevealSteps` 12, then 6, 3, 1, returning the first result with at most `MAX_DISTINCT_OVERLAYS` distinct `signatureKey`s; returns the 1-step result if none fit.

Reveal rule per output frame, for a visible annotation with `drawIn > 0`:
- `startFrame = frameIndexAt(annotation.startTime, sourceFps)`.
- `holdElapsed` = sum of `duration` of every hold segment before `frame.segmentIndex` whose `frameIndexAt(srcTime, sourceFps) === startFrame`, plus `frame.holdElapsed` if the frame's own segment is such a hold.
- `fraction = revealFraction(revealElapsed(startTime, frame.srcTime, holdElapsed), drawIn)`.
- `revealBucket = fraction >= 1 ? steps : Math.floor(fraction * steps)`.

Because the rule depends only on source time and holds inside the clip, a clip that starts after an annotation's `startTime` gets a large elapsed value and shows it finished.

`renderClip` passes `toolType` in `spanAnnotations`, calls `buildDrawingSpansWithinBudget(segments, spanAnnotations, fps, { sourceFps: probe.fps })`, and `renderSpanRgba` calls `applyReveal(clone, toolType, revealBucket / revealSteps)` for every visible clone before `renderAll()`. Magnifier clones are skipped (their kind is `'none'` anyway).

- [ ] **Step 1: Write failing tests**

```ts
// outputTimeline.test.ts
it('framePresentations tracks hold progress', () => {
  const segs: OutputSegment[] = [{ kind: 'play', srcStart: 0, srcEnd: 1 }, { kind: 'hold', srcTime: 1, duration: 0.5 }, { kind: 'play', srcStart: 1, srcEnd: 2 }]
  const p = framePresentations(segs, 10)
  expect(p.map((x) => x.srcTime)).toEqual(frameSourceTimes(segs, 10))
  expect(p[10]).toEqual({ srcTime: 1, segmentIndex: 1, holdElapsed: 0 })
  expect(p[14].holdElapsed).toBeCloseTo(0.4)
  expect(p[15]).toEqual({ srcTime: 1, segmentIndex: 2, holdElapsed: 0 })
})

// spanBuilder.test.ts
const play = (a: number, b: number): OutputSegment => ({ kind: 'play', srcStart: a, srcEnd: b })
it('static annotations still dedupe to one span', () => {
  const spans = buildDrawingSpans([play(0, 2)], [{ id: 'a', startTime: 0, endTime: 2, toolType: 'line' }], 30)
  expect(spans).toHaveLength(1)
  expect(spans[0].signature[0]).toMatchObject({ revealBucket: 12, revealSteps: 12 })
})
it('a draw-on produces rising buckets then one finished span', () => {
  const spans = buildDrawingSpans([play(0, 2)], [{ id: 'a', startTime: 0, endTime: 2, drawIn: 0.4, toolType: 'line' }], 30)
  const buckets = spans.map((s) => s.signature[0].revealBucket)
  expect(buckets[0]).toBe(0)
  expect(buckets).toEqual([...buckets].sort((x, y) => x - y))
  expect(buckets.at(-1)).toBe(12)
  expect(spans.length).toBeLessThanOrEqual(13)
})
it('reveals during a hold on the start frame', () => {
  const segs: OutputSegment[] = [{ kind: 'hold', srcTime: 1, duration: 1 }, play(1, 2)]
  const spans = buildDrawingSpans(segs, [{ id: 'a', startTime: 1, endTime: 2, drawIn: 0.4, toolType: 'pen' }], 30)
  const holdSpans = spans.filter((s) => s.frameStart < 30)
  expect(holdSpans.length).toBeGreaterThan(1)
  expect(holdSpans.at(-1)!.signature[0].revealBucket).toBe(12)
})
it('matches a hold a sub-frame before the drawing by frame index', () => {
  const segs: OutputSegment[] = [play(0.9, 1.0), { kind: 'hold', srcTime: 1.0, duration: 1 }, play(1.0, 2)]
  const spans = buildDrawingSpans(segs, [{ id: 'a', startTime: 1.004, endTime: 2, drawIn: 0.4, toolType: 'pen' }], 30, { sourceFps: 30 })
  const first = spans.find((s) => s.signature.length > 0)!
  expect(first.signature[0].revealBucket).toBe(12) // the whole hold counts as elapsed
})
it('a clip starting after the annotation shows it finished (Review Focus 1)', () => {
  const spans = buildDrawingSpans([play(5, 6)], [{ id: 'a', startTime: 4, endTime: 8, drawIn: 0.4, toolType: 'line' }], 30)
  expect(spans).toHaveLength(1)
  expect(spans[0].signature[0].revealBucket).toBe(12)
})
it('15 fps output of 60 fps source still finishes the reveal (Review Focus 4)', () => {
  const segs: OutputSegment[] = [{ kind: 'hold', srcTime: 1, duration: 0.5 }, play(1, 2)]
  const spans = buildDrawingSpans(segs, [{ id: 'a', startTime: 1.001, endTime: 2, drawIn: 0.4, toolType: 'line' }], 15, { sourceFps: 60 })
  expect(spans.some((s) => s.signature[0]?.revealBucket === 12)).toBe(true)
})
it('respects maxRevealSteps', () => {
  const spans = buildDrawingSpans([play(0, 2)], [{ id: 'a', startTime: 0, endTime: 2, drawIn: 0.4, toolType: 'line' }], 60, { maxRevealSteps: 3 })
  expect(new Set(spans.map((s) => signatureKey(s.signature))).size).toBeLessThanOrEqual(4)
})
it('falls back to fewer steps to stay within the overlay budget', () => {
  const anns = Array.from({ length: 60 }, (_, i) => ({ id: `a${i}`, startTime: i, endTime: i + 0.9, drawIn: 0.4, toolType: 'line' }))
  const spans = buildDrawingSpansWithinBudget([play(0, 60)], anns, 30)
  expect(new Set(spans.map((s) => signatureKey(s.signature))).size).toBeLessThanOrEqual(MAX_DISTINCT_OVERLAYS)
})
```

In `clipRenderer.test.ts`, following its existing mocking of `window.electronAPI`: exporting one line annotation with `drawIn: 0.4` calls `clipEncodeAddOverlay` more than twice, and exporting the same annotation with no `drawIn` makes the same number of calls as before this task.

- [ ] **Step 2:** Run `npx vitest run src/export`. Expected: FAIL.
- [ ] **Step 3:** Implement `framePresentations`, the signature changes, the budget wrapper and the renderer wiring. Update existing tests in these files that assert exact signature objects or keys to include the new fields.
- [ ] **Step 4:** Run `npx vitest run src/export`. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: burn draw-on animation into exports`

---

### Task 5: Automatic-hold state in the video store

**Files:**
- Modify: `src/stores/videoStore.ts`
- Modify: `src/components/VideoPlayer/VideoPlayer.tsx:40-47` (`resetFreezes`), `:95-116` (freeze fire and its timeout)
- Test: `src/stores/videoStore.test.ts`

**Interfaces:**
- Produces, on `useVideoStore`:
  - `autoHold: { time: number; startedAt: number; endedAt: number | null } | null`
  - `beginAutoHold(time: number): void` sets `{ time, startedAt: performance.now(), endedAt: null }`.
  - `endAutoHold(): void` sets `endedAt = performance.now()` if a hold is active; otherwise no-op.
  - `clearAutoHold(): void` sets `null`.
  - `setVideoElement` also clears it.

Wiring in `VideoPlayer.tsx`: call `beginAutoHold(ann.startTime)` where a freeze fires (beside `isFreezePauseRef.current = true`); call `endAutoHold()` at the top of the freeze timeout callback, before playback resumes; call `clearAutoHold()` in `resetFreezes` (user seek or user pause). The freeze logic's own snap-to-frame seek already bypasses `resetFreezes` via `isFreezeSeekRef` and must keep doing so.

- [ ] **Step 1: Write failing tests**

```ts
it('tracks an automatic hold', () => {
  const s = useVideoStore.getState()
  expect(s.autoHold).toBeNull()
  s.beginAutoHold(3.2)
  expect(useVideoStore.getState().autoHold).toMatchObject({ time: 3.2, endedAt: null })
  useVideoStore.getState().endAutoHold()
  expect(useVideoStore.getState().autoHold!.endedAt).not.toBeNull()
  useVideoStore.getState().clearAutoHold()
  expect(useVideoStore.getState().autoHold).toBeNull()
})
it('endAutoHold with no hold is a no-op', () => {
  useVideoStore.getState().clearAutoHold()
  useVideoStore.getState().endAutoHold()
  expect(useVideoStore.getState().autoHold).toBeNull()
})
```

- [ ] **Step 2:** Run `npx vitest run src/stores/videoStore.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the state, actions and the three call sites.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: expose automatic freeze holds in the video store`

---

### Task 6: Live draw-on (Opus)

**Files:**
- Create: `src/export/liveReveal.ts` (pure state step)
- Create: `src/hooks/useLiveReveal.ts` (the animation loop)
- Modify: `src/components/Canvas/DrawingCanvas.tsx:336-350` (the visibility effect) and the component body to call the hook
- Test: `src/export/liveReveal.test.ts`

**Interfaces:**
- Consumes: `annotationStateAt`, `revealElapsed`, `revealFraction` (Task 1); `applyReveal`, `stripReveal` (Task 3); `autoHold` (Task 5); `frameIndexAt` from `@/utils/frames`.
- Produces:

```ts
export interface LiveRevealAnnotation { id: string; startTime: number; endTime: number; drawIn?: number }
export interface LiveRevealInput {
  annotations: LiveRevealAnnotation[]
  prevTime: number            // video.currentTime at the previous tick
  time: number                // video.currentTime now
  playing: boolean            // !video.paused
  autoHold: { time: number; startedAt: number; endedAt: number | null } | null
  now: number                 // performance.now()
  fps: number                 // source fps from videoStore
  armed: Set<string>          // mutated in place; owned by the caller
}
/** Returns the reveal fraction for every annotation id (1 = finished). */
export function stepLiveReveal(input: LiveRevealInput): Map<string, number>
export function useLiveReveal(canvasRef: RefObject<fabric.Canvas | null>, videoElement: HTMLVideoElement | null): void
```

Rules for `stepLiveReveal`:
1. A hold is *active* when `autoHold` is set and `endedAt === null`.
2. If not `playing` and no hold is active: clear `armed`, return 1 for everything (user pause shows finished shapes).
3. Annotations with no `drawIn > 0` always get 1.
4. Arm an annotation when `playing`, `prevTime < startTime <= time` and `time - prevTime < 1` (forward playback arriving at it; a jump of a second or more is a seek). Also arm it when a hold is active on its start frame (`frameIndexAt(autoHold.time, fps) === frameIndexAt(startTime, fps)`) and `time >= startTime - 1 / fps`.
5. Disarm when `time < startTime - 1 / fps` or `time > endTime`.
6. Unarmed → 1. Armed → `revealFraction(revealElapsed(startTime, time, holdElapsed), drawIn)`, where `holdElapsed` is `((autoHold.endedAt ?? now) - autoHold.startedAt) / 1000` if `autoHold` is on the annotation's start frame, else 0.

Rule 4 gives the "just drawn, then Play: no replay" behaviour for free: resuming from the start frame has `prevTime === startTime`, so nothing arms.

`useLiveReveal`: while the video is playing or a hold is active, run a `requestAnimationFrame` loop. Each tick reads `videoElement.currentTime`, reads annotations and `autoHold` from the stores with `getState()` (no React subscriptions inside the loop), and for each annotation sets `object.visible` and `object.opacity` from `annotationStateAt(annotation, time)` and calls `applyReveal(object, toolType, fraction)`, then `canvas.requestRenderAll()`. When the loop stops (user pause, unmount, video change) it calls `stripReveal` on every annotation object and renders once. The existing visibility effect in `DrawingCanvas.tsx` stays for paused scrubbing but must also `stripReveal` each object, so a pause mid-reveal leaves finished shapes.

- [ ] **Step 1: Write failing tests**

```ts
const base = { fps: 30, autoHold: null, now: 0 }
const ann = [{ id: 'a', startTime: 5, endTime: 8, drawIn: 0.4 }]
it('user pause shows finished shapes and disarms', () => {
  const armed = new Set(['a'])
  expect(stepLiveReveal({ ...base, annotations: ann, prevTime: 5.1, time: 5.1, playing: false, armed }).get('a')).toBe(1)
  expect(armed.size).toBe(0)
})
it('arms when playback arrives and animates', () => {
  const armed = new Set<string>()
  expect(stepLiveReveal({ ...base, annotations: ann, prevTime: 4.99, time: 5.0, playing: true, armed }).get('a')).toBe(0)
  expect(armed.has('a')).toBe(true)
  expect(stepLiveReveal({ ...base, annotations: ann, prevTime: 5.0, time: 5.2, playing: true, armed }).get('a')).toBeCloseTo(0.875)
  expect(stepLiveReveal({ ...base, annotations: ann, prevTime: 5.2, time: 5.5, playing: true, armed }).get('a')).toBe(1)
})
it('does not replay a drawing when Play is pressed on its own frame', () => {
  const armed = new Set<string>()
  expect(stepLiveReveal({ ...base, annotations: ann, prevTime: 5, time: 5.016, playing: true, armed }).get('a')).toBe(1)
})
it('a seek into the annotation does not arm it', () => {
  const armed = new Set<string>()
  expect(stepLiveReveal({ ...base, annotations: ann, prevTime: 1, time: 5.1, playing: true, armed }).get('a')).toBe(1)
})
it('keeps animating through an automatic hold', () => {
  const armed = new Set(['a'])
  const hold = { time: 5, startedAt: 1000, endedAt: null }
  expect(stepLiveReveal({ ...base, annotations: ann, prevTime: 5, time: 5, playing: false, autoHold: hold, now: 1200, armed }).get('a')).toBeCloseTo(0.875)
  expect(stepLiveReveal({ ...base, annotations: ann, prevTime: 5, time: 5, playing: false, autoHold: hold, now: 1500, armed }).get('a')).toBe(1)
})
it('counts a finished hold after playback resumes', () => {
  const armed = new Set(['a'])
  const hold = { time: 5, startedAt: 1000, endedAt: 1200 }
  expect(stepLiveReveal({ ...base, annotations: ann, prevTime: 5, time: 5.1, playing: true, autoHold: hold, now: 9999, armed }).get('a')).toBeCloseTo(revealFraction(0.3, 0.4))
})
it('disarms after the annotation ends or playback moves before it', () => {
  const armed = new Set(['a'])
  stepLiveReveal({ ...base, annotations: ann, prevTime: 7.9, time: 8.1, playing: true, armed })
  expect(armed.has('a')).toBe(false)
})
it('annotations without drawIn are always finished', () => {
  const armed = new Set<string>()
  expect(stepLiveReveal({ ...base, annotations: [{ id: 'b', startTime: 5, endTime: 8 }], prevTime: 4.99, time: 5, playing: true, armed }).get('b')).toBe(1)
})
```

- [ ] **Step 2:** Run `npx vitest run src/export/liveReveal.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `liveReveal.ts`, then the hook, then wire it into `DrawingCanvas.tsx`.
- [ ] **Step 4:** Run `npx vitest run src/export/liveReveal.test.ts` and `npm run typecheck`. Expected: PASS.
- [ ] **Step 5: Manual check.** `npm run dev`, load a video. (a) Draw an arrow while paused, press Play: it stays finished. (b) Seek back two seconds, press Play: it draws on smoothly, head last. (c) Pause mid-draw: the shape is finished. (d) Use Freeze (H) on a frame, draw a line, resume, seek back and play through: the line draws on during the hold. (e) Undo and redo after watching a reveal: shapes are intact. Report what was and was not checked.
- [ ] **Step 6:** Commit: `feat: animate draw-on in the live canvas`

---

### Task 7: Contrast styles

**Files:**
- Create: `src/utils/annotationStyle.ts`
- Test: `src/utils/annotationStyle.test.ts`
- Modify: `src/stores/toolStore.ts`
- Modify: `src/components/Toolbar/DrawingToolbar.tsx` (segmented control beside the stroke-width buttons near line 132)
- Modify: `src/components/Canvas/DrawingCanvas.tsx` (every inline `new fabric.Shadow` on the stroke tools and text, lines 470-590, 717, 758-800, 900-990)

**Interfaces:**
- Produces:
  - `type AnnotationStyle = 'outline' | 'glow' | 'clean'`
  - `shadowForStyle(style: AnnotationStyle, color: string, glowBlur?: number): fabric.Shadow | undefined`
    - `'outline'` → `new fabric.Shadow({ color: 'rgba(0,0,0,0.85)', blur: 3, offsetX: 0, offsetY: 0 })`
    - `'glow'` → `new fabric.Shadow({ color, blur: glowBlur ?? 10, offsetX: 0, offsetY: 0 })`
    - `'clean'` → `undefined`
  - `STYLED_TOOL_TYPES: ReadonlySet<string>` = pen, path, line, arrow, arc-arrow, rectangle, circle, text.
  - `restyleObject(object: fabric.Object, toolType: string, style: AnnotationStyle): void`: no-op unless `toolType` is in `STYLED_TOOL_TYPES`; otherwise sets the shadow on the object, or on each child for a group, using that object's own `stroke` (or `fill` for text and arrowheads) as the glow colour, and marks it dirty.
  - `toolStore`: `annotationStyle: AnnotationStyle` (default `'outline'`) and `setAnnotationStyle(style)`.

Each replaced call site passes its current blur as `glowBlur` so the Glow style looks exactly as today (10 for shafts, 15 for arrowheads). Spotlight, magnifier, tracker and eraser shadows are left alone. The toolbar control has three buttons labelled Outline, Glow, Clean, with `title` tooltips, styled like the existing stroke-width buttons. Choosing a style calls `setAnnotationStyle` and, if the canvas has selected annotation objects, `restyleObject` on each, then saves an undo snapshot the same way other property edits in this file do.

- [ ] **Step 1: Write failing tests**

```ts
it('outline is a tight dark edge', () => {
  const s = shadowForStyle('outline', '#FFCC00')!
  expect(s.color).toBe('rgba(0,0,0,0.85)'); expect(s.blur).toBe(3); expect(s.offsetX).toBe(0)
})
it('glow keeps the shape colour and blur', () => {
  expect(shadowForStyle('glow', '#FFCC00')!.blur).toBe(10)
  expect(shadowForStyle('glow', '#FFCC00', 15)).toMatchObject({ color: '#FFCC00', blur: 15 })
})
it('clean has no shadow', () => expect(shadowForStyle('clean', '#fff')).toBeUndefined())
it('restyles a line and both parts of an arrow', () => {
  const line = new fabric.Line([0, 0, 10, 0], { stroke: '#f00' })
  restyleObject(line, 'line', 'outline')
  expect((line.shadow as fabric.Shadow).blur).toBe(3)
  const arrow = new fabric.Group([new fabric.Line([0, 0, 10, 0], { stroke: '#f00' }), new fabric.Triangle({ fill: '#f00' })])
  restyleObject(arrow, 'arrow', 'clean')
  expect(arrow.getObjects().every((o) => !o.shadow)).toBe(true)
})
it('leaves spotlight alone', () => {
  const e = new fabric.Ellipse({ rx: 5, ry: 5, shadow: new fabric.Shadow({ blur: 25 }) })
  restyleObject(e, 'spotlight', 'clean')
  expect((e.shadow as fabric.Shadow).blur).toBe(25)
})
it('toolStore defaults to outline', () => expect(useToolStore.getState().annotationStyle).toBe('outline'))
```

- [ ] **Step 2:** Run `npx vitest run src/utils/annotationStyle.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement the helper and store field, replace the inline shadows, add the toolbar control and the restyle-selection behaviour.
- [ ] **Step 4:** Run `npx vitest run src/utils src/stores`, `npm run typecheck`, `npm run lint`. Expected: PASS, no new lint warnings.
- [ ] **Step 5: Manual check.** In `npm run dev`: draw a yellow line in each style over a bright frame; select an existing arrow and switch styles; confirm spotlight and magnifier are unchanged; export a short MP4 and confirm the outline is burned in.
- [ ] **Step 6:** Commit: `feat: add outline, glow and clean annotation styles`

---

### Task 8: Proportional arrowheads

**Files:**
- Modify: `src/utils/annotationStyle.ts` (add the sizing function)
- Test: `src/utils/annotationStyle.test.ts`
- Modify: `src/components/Canvas/DrawingCanvas.tsx:901-902` and `:965-966`

**Interfaces:**
- Produces: `arrowHeadSize(strokeWidth: number): { length: number; width: number }` returning `length = Math.max(25, strokeWidth * 4)` and `width = Math.max(12, strokeWidth * 2)`. `width` is the half-width, matching today's `headWidth` (the Triangle is built with `width: headWidth * 2`).

- [ ] **Step 1: Write failing test**

```ts
it.each([[2, 25, 12], [4, 25, 12], [8, 32, 16], [16, 64, 32]])('stroke %i → head %i x %i', (w, length, width) =>
  expect(arrowHeadSize(w)).toEqual({ length, width }))
```

- [ ] **Step 2:** Run `npx vitest run src/utils/annotationStyle.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement and use it at both call sites (arrow and arc-arrow), passing the same stroke width the shaft uses.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit: `feat: scale arrowheads with stroke width`

---

### Task 9: Draw-on field in the inspector, and docs

**Files:**
- Create: `src/utils/drawInInput.ts`
- Test: `src/utils/drawInInput.test.ts`
- Modify: `src/components/Timeline/AnnotationTimeline.tsx:569-592` (add a field after Fade Out)
- Modify: `CHANGELOG.md` (under `[Unreleased]`, a new `### Added` list), `KEYBOARD_SHORTCUTS.md` only if it documents the toolbar

**Interfaces:**
- Consumes: `Annotation.drawIn` (Task 2); `revealKind` (Task 3).
- Produces: `parseDrawIn(raw: string): number` returning 0 for empty, non-numeric or negative input, otherwise the value clamped to at most 2 and rounded to 2 decimals.

The field is labelled "Draw-on:", uses the same markup and classes as the Fade In field (`type="number"`, `step="0.05"`, `min="0"`, `max="2"`), shows `(annotation.drawIn ?? 0).toFixed(2)`, and calls `onUpdate({ drawIn: parseDrawIn(e.target.value) })`. Render it only when `revealKind(annotation.toolType) !== 'none'`.

CHANGELOG entry, exact text:

```markdown
### Added
- Drawings now draw themselves on along the stroke during playback and in
  exported MP4s and GIFs. Set the time per annotation with the new Draw-on
  field (0 turns it off).
- Outline, Glow and Clean annotation styles in the toolbar. Outline, the new
  default, keeps drawings readable on bright ice.

### Changed
- Arrowheads scale with stroke width.
```

- [ ] **Step 1: Write failing test**

```ts
it.each([['', 0], ['abc', 0], ['-1', 0], ['0.35', 0.35], ['0.333', 0.33], ['9', 2], ['2', 2]])(
  'parseDrawIn(%j) → %d (Review Focus 5)', (raw, out) => expect(parseDrawIn(raw)).toBe(out))
```

- [ ] **Step 2:** Run `npx vitest run src/utils/drawInInput.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `parseDrawIn`, add the field, write the CHANGELOG entry.
- [ ] **Step 4:** Run `npm run typecheck && npm run lint && npm run test`. Expected: all pass, lint 0 errors.
- [ ] **Step 5: Manual check.** Select a line: the field shows 0.35; set it to 0 and play through, it pops in; select text: no field.
- [ ] **Step 6:** Commit: `feat: add Draw-on field to the annotation inspector`

---

## After the last task

Whole-branch review, then a manual export comparison: one clip with a pen stroke, an arrow, a circle and a freeze-draw-resume line, exported as MP4 and as GIF, checked against the live view. Versioning and the release tag are a separate step for Mark to trigger (see `RELEASING.md`).
