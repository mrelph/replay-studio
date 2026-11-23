# Broadcast look: draw-on animation and contrast styles

Release 1 of 4 in the "broadcast quality" track. Target version: 1.6.0.

## Intent

Mark wants Replay Studio to feel like the telestrator on a sports broadcast.
Four gaps matter to him: how the shapes look, timing, tools, and speed. They
ship as four staged releases in that order:

1. **Broadcast look** (this document)
2. Timing made easy (auto-freeze on draw, duration chips, draggable ends)
3. Speed ramps (slow-motion regions in playback and export)
4. New tools (player ring, zone, passing lanes, callouts, cursor popup)

Today a drawing appears fully formed on its start frame. On a broadcast the
line draws itself along the stroke, and it stays readable on white ice and
dark boards alike. This release makes annotations do both, in the live view
and in every export.

## Goals

- Strokes draw on along their path when playback reaches them.
- Shapes stay readable on any background, with a one-click choice of look.
- Arrowheads scale with stroke width.
- The export matches the live view frame for frame, as it does today.
- Old projects open and export exactly as before.

## Non-goals

- Timing UI, speed ramps and new tools (releases 2 to 4).
- A general keyframe or animation engine.
- Player tracking, perspective or rink-plane graphics.
- Draw-off (erasing along the path) at the end of an annotation. Fade-out stays.

## Anti-goals

- A drawing that is invisible, or half drawn, while the user is paused on it
  and editing. Authoring must always show the finished shape.
- Live view and export disagreeing.
- Exports that fail the 500-overlay cap on ordinary clips because of this feature.

## Approaches

| Approach | Trade-off | Verdict |
|---|---|---|
| **Staged releases, look first** | Each release is usable alone; look work is cheap because export already renders PNGs per visible state | **Picked by Mark** |
| Speed ramps first | Biggest video-control gain first, but the riskiest export change lands before anything visible improves | Deferred to release 3 |
| Full keyframe animation engine | Would also enable tracking later; months before anything ships, and tracking is parked | Ruled out |

For the draw-on itself, within this release:

| Approach | Trade-off | Verdict |
|---|---|---|
| **Stroke-dash reveal** (`strokeDashArray` = path length, animate `strokeDashOffset`) | Works on every stroked Fabric object, cloned objects carry it into export, no geometry changes | **Picked** (Claude's call) |
| Truncate the path geometry per frame | Exact, but pen paths, lines, ellipses and groups each need their own code, and undo snapshots get harder | Rejected |
| Clip-path wipe | Simple, but wipes left to right, not along the stroke; looks wrong on curves | Rejected |

## Design

### 1. Reveal timing (pure, shared)

Add `drawIn?: number` (seconds) to `Annotation`, `AnnotationSnapshot`, the
project serializer, and `AnnotationTimingInput`.

Extend `src/export/annotationTiming.ts` with a pure function that returns a
reveal fraction from 0 to 1. Like `annotationStateAt`, the live canvas and the
export renderer both call it, so they cannot drift apart.

The reveal runs on **presentation time**, not source time. Presentation time
keeps advancing while the video is held on a freeze frame. This matters because
the common case is "freeze, draw, resume": the annotation's `startTime` is the
frozen frame. If the reveal used source time it would be stuck at 0 for the
whole hold. So:

- The hold is usually **not** on the drawing itself. `createAnnotation` never
  sets `freezeDuration`; a recorded hold lands on a separate invisible freeze
  marker (`addFreezeMarker` / `setFreezeAt` in `freezeMarkers.ts`) unless an
  annotation on that frame already has one. The reveal must look up **any hold
  on the annotation's start frame**, not the annotation's own field.
- Live matches holds by frame index (`findFreezeAt`); export keys them by exact
  `startTime` (`outputTimeline.ts`). The reveal uses **frame-index matching in
  both**, through one shared helper, so a drawing that starts a sub-frame after
  the marker reveals the same way live and in export.
- Elapsed reveal time = time spent in a hold at this annotation's start frame
  + source time elapsed since `startTime`.
- Several drawings made in one freeze share a start frame and reveal
  **together**. Revealing them in drawn order needs a stored per-annotation
  offset and belongs to release 2 (timing). (Claude's call.)
- Reveal fraction = clamp(elapsed / `drawIn`, 0, 1), eased (ease-out).
- `drawIn` undefined or 0 means fully revealed at all times. That is what
  every existing annotation has, so old projects are unchanged.

When `drawIn > 0` the annotation's fade-in is ignored (opacity is 1 during the
reveal). The fade-in floor of 0.5 exists so a fresh drawing is never mistaken
for "not drawn"; the paused rule below covers that case instead.

### 2. Live canvas

- **Paused by the user: always fully revealed.** Scrubbing while paused shows
  finished shapes. This is the anti-goal guard.
- **Just drawn, then Play: no replay.** A drawing made while paused stays
  finished when the user presses Play from that frame (they just watched
  themselves draw it, and the hold is suppressed on that first resume anyway).
  It animates whenever playback later runs into its start frame, and always in
  export. So the live rule is: the reveal starts when playback *arrives at* the
  start frame while playing, or when an automatic hold begins there. Export has
  no such state and always animates. (Claude's call.)
- **A per-frame clock is needed.** The store's `currentTime` only updates on
  the video `timeupdate` event (`VideoPlayer.tsx`), a few times a second, which
  would show a 0.35 s reveal in one or two steps. While any annotation is
  mid-reveal, the canvas runs its own `requestAnimationFrame` loop that reads
  `videoElement.currentTime` directly (the canvas already has the element). Do
  not raise the store's update rate; other subscribers depend on it.
  (Claude's call.)
- **Holds need a "holding since" state.** During an automatic hold the store
  says paused: the freeze calls `video.pause()` and the hold is a `setTimeout`
  in a ref local to `VideoPlayer` with no start timestamp. Add a small piece of
  state (hold start timestamp, or null) to `videoStore` so the canvas can tell
  an automatic hold from a user pause and compute the hold's elapsed time.

### 3. Applying the reveal to objects

One helper, `applyReveal(object, fraction)`, used by both the live canvas and
`renderSpanRgba`:

| Tool | Behaviour |
|---|---|
| pen, line | Dash reveal along the stroke, in the direction it was drawn |
| arrow, arc-arrow (groups) | Dash reveal on the shaft; the arrowhead appears once the fraction passes 0.85 and scales up to full size by 1.0 |
| rectangle, circle | Dash reveal around the perimeter |
| text | No draw-on; keeps its fade |
| spotlight, magnifier, tracker, freeze markers | No draw-on |

The helper must restore the object's original dash state at fraction 1, and
must never leave reveal state in what gets serialized or snapshotted for undo.

Defaults for new annotations, added to `TOOL_DEFAULTS` in
`src/utils/annotationDefaults.ts`:

| Tool | `drawIn` |
|---|---|
| pen | 0.4 |
| line, arrow, arc-arrow | 0.35 |
| rectangle, circle | 0.4 |
| everything else | 0 |

### 4. Export

`buildDrawingSpans` (`src/export/spanBuilder.ts`) builds per-frame signatures
of `{id, opacityBucket}`. Add a reveal bucket to the signature, and pass each
output frame's presentation-time elapsed value (the output timeline's hold
segments already carry what is needed).

Quantize the reveal to at most **12 steps** per annotation. A 0.4 s reveal at
30 fps is 12 frames, so this loses nothing at normal settings and bounds the
cost: each animated annotation adds at most 12 PNGs against the 500 cap
(`MAX_OVERLAYS_PER_JOB`). If a job would still exceed the cap, the renderer
falls back to fewer reveal steps for that job before failing.

No ffmpeg or main-process changes are expected.

### 5. Contrast styles

Today every stroke shape has a soft glow in its own colour (`fabric.Shadow`,
blur 10 to 15). On white ice a yellow glow around a yellow line adds nothing.

Add `annotationStyle` to `toolStore`, with three choices shown as a small
segmented control in the drawing toolbar:

| Style | Shadow | Use |
|---|---|---|
| **Outline** (new default) | Near-black, tight (blur about 3, high alpha, no offset) so it reads as a dark edge | Readable on ice and boards |
| Glow | Current behaviour: own colour, blur 10 to 15 | Dark footage, a "neon" look |
| Clean | None | Minimal |

Styles apply to the stroke tools (pen, line, arrow, arc-arrow, rectangle,
circle) and text. Spotlight, magnifier and tracker keep their own fixed glows
(blur 20 to 25) and ignore the style. (Claude's call.)

The style is baked into each object's shadow when it is drawn, so it
serializes with the Fabric JSON and needs no schema change. Changing the
toolbar style while annotations are selected restyles them. Existing
annotations keep the glow they were saved with.

The repeated inline `new fabric.Shadow({...})` blocks in `DrawingCanvas.tsx`
(about 15 of them) are replaced by one `shadowForStyle(style, color)` helper.
That is the only refactor in scope.

### 6. Arrowheads

Head length and width are fixed at 25 and 12 px regardless of stroke width.
Make them proportional (length about 4x stroke width, width about 2x, with the
current sizes as the floor) for both arrow and arc-arrow.

### 7. Editing the draw-on

- The annotation inspector in `AnnotationTimeline.tsx` gets a "Draw-on" number
  field beside Fade in / Fade out (0 turns it off).
- No global toggle. A user who dislikes it sets the field to 0; if that proves
  annoying, a preference is a later follow-up.

## Testing

- Unit tests for the reveal function: before start, mid-reveal, complete,
  during a hold, `drawIn` 0/undefined, easing bounds.
- Hold lookup: a drawing on the same frame as a separate freeze marker, and one
  a sub-frame after it, reveal identically in live and export paths.
- Span builder tests: reveal buckets appear in signatures, are capped at 12
  steps, and static annotations still dedupe to one PNG.
- Serializer round-trip for `drawIn`; a project without it loads with no reveal.
- `applyReveal` leaves an object identical after fraction 1.
- Manual: draw each tool, play through, freeze-draw-resume, export MP4 and GIF,
  compare with the live view.

## Left to the builder

- The exact easing curve and the outline shadow's blur/alpha values (tune by eye).
- How path length is measured for each Fabric type.
- Whether the reveal helper lives in `src/export/` or `src/utils/`.
- Toolbar control layout.
