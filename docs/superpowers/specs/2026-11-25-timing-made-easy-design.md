# Timing made easy: automatic freezes, drawn-order reveal, "Stays" chips

Release 2 of 4 in the "broadcast quality" track. Target version: 1.8.0.
Builds on release 1 (`2026-11-23-broadcast-look-design.md`, shipped as 1.6.0).

## Intent

Mark wants timing to set itself: draw on the play, press Play, and the clip
comes out right without opening the inspector. Today that takes work:

- A freeze only exists if the user presses `H`, and its hold is as long as the
  user personally stayed paused. A slow drawing means a long freeze in the export.
- Drawing while the video plays does not stop it, and the drawing is stamped
  with the store's `currentTime`, which lags the real playhead by up to a
  quarter second.
- Every drawing made in one freeze appears at the same instant.
- How long a drawing stays is a number field with per-tool defaults.
- A recorded freeze lands 1 to 2 frames after the frame the video stopped on.

## Goals

- Drawing while playing pauses on the exact frame and creates a freeze there.
- The hold length is calculated from the drawings, not from how long the user took.
- Drawings made on one frozen frame reveal one after another, in drawn order.
- One-click "Stays" chips decide how long drawings remain after play resumes.
- Freezes land on the frame the video actually stopped on.
- Live view and export agree. Old projects open and export exactly as before.

## Non-goals

- Speed ramps and new tools (releases 3 and 4).
- A sequencing editor (dragging drawings into an order). Order is drawn order.
- Draw-off animation. Fade-out stays.
- Re-surfacing hidden features (tracker, audience view).

## Anti-goals

- A freeze the user cannot get rid of. Setting Freeze to 0 must always remove it
  and it must stay removed.
- A hand-set hold being silently recalculated.
- Pausing the video when the user is only selecting, moving or editing an
  existing drawing.

## What Mark decided

1. Hold length is **automatic**: as long as the drawings need, plus reading time.
2. Starting a drawing while the video plays **pauses on that frame** and creates
   a freeze. No toggle.
3. **"Stays" chips in the toolbar**, beside the Outline/Glow/Clean control:
   `Freeze only`, `1s`, `2s`, `4s`, `To end`. They set the length for new
   drawings and change selected drawings too.

4. The **first Play after drawing previews the freeze**: hold, reveal in order,
   then resume.

Everything else below is Claude's call unless marked.

## Approaches

| Approach | Trade-off | Verdict |
|---|---|---|
| **Store a per-drawing reveal delay, and flag the freeze as automatic** | Two small saved fields; live and export read the same numbers; recalculated when drawings on the frame change | **Picked** (Mark left the how to Claude) |
| Derive the order on the fly from the annotation array | Nothing saved, but live and export each re-derive it, and layer reordering or undo could change the sequence | Rejected |
| A sequencing track on the timeline | Flexible, but a new editor surface, against the intent | Out of scope |

## Design

### 1. Data model

Two optional fields on `Annotation`, `AnnotationSnapshot` and the project
serializer:

- `revealDelay?: number` (seconds). Presentation-time delay before this
  drawing's reveal starts. Undefined means 0.
- `freezeAuto?: boolean`. On whichever annotation carries the `freezeDuration`
  for a frame (normally the invisible freeze marker). True means the hold is
  calculated; undefined or false means hand-set or recorded.

Old projects have neither, so they behave as today.

**One freeze per frame.** Today several annotations on one frame can each carry
a `freezeDuration`; export takes the largest and live playback takes the first
it finds. From this release, all code that reads or writes a frame's freeze
goes through one helper that resolves "the frame's freeze carrier": the first
annotation on that frame index that has a `freezeDuration` field set, **including
0**, preferring a freeze marker. `findFreezeAt` today ignores 0; the new lookup
must not, or a remembered "Freeze 0" would be invisible and a second marker
would be added beside it. Legacy projects where a drawing carries the hold keep
working: that drawing is the carrier. New freezes are always markers.

The inspector's Freeze field and Auto button, shown on any selected drawing or
marker, read and write **the frame's freeze** through that helper, not the
selected annotation's own field. Raise the field's maximum from 10 to 30 to
match the hold cap.

### 2. Shared clock

`revealElapsed` in `src/export/annotationTiming.ts` gains the delay: the
existing elapsed value minus `revealDelay`, floored at 0.

The delay is a **visibility rule, separate from reveal progress**. A drawing
whose delay has not yet elapsed is not visible at all (not shown at fraction 0
with its shadow or arrowhead), in live playback and in export. This applies to
tools with no draw-on as well (text, spotlight, magnifier): they pop in on
their turn. While the user is paused (not in an automatic hold) everything is
shown finished, as in release 1.

What that takes, given today's code:

- Hold time is only accumulated for drawings with `drawIn > 0`
  (`liveReveal.ts`, `spanBuilder.ts`). It must be tracked for any drawing with
  `revealDelay > 0`, whatever its tool.
- Whether a drawing shows comes from `annotationStateAt`, not the reveal
  fraction. Add one shared "is it due yet" gate, used by both the live hook and
  the span builder, on top of `annotationStateAt`.
- The export's lowest budget tier (`revealSteps <= 1`) skips the draw-on
  animation. The delay gate must still apply there: drawings pop in one by one
  even when the stroke animation has been dropped.

### 3. Sequence and automatic hold (pure)

One pure function, in a new module beside `freezeMarkers.ts`, takes the
annotations whose start frame equals a given frame (frame-index match, the same
helper release 1 uses) in creation order and returns each one's `revealDelay`
and the hold length:

- Delays run back to back: the first drawing has delay 0; each next delay is
  the previous delay plus the previous drawing's step.
- A drawing's step is its `drawIn` when that is greater than 0, otherwise 0.15 s.
- Hold = last delay + last step + 1.0 s reading time, rounded to 0.1 s, capped
  at the existing 30 s limit.
- Freeze markers themselves are not part of the sequence.

Creation order is the order in the `annotations` array. If the builder finds
that anything reorders that array (layers, undo, load), add a stored creation
index instead; say so in the plan.

The store calls this function and writes the results whenever, on a frame that
has an **automatic** freeze: a drawing is added, deleted, has its `drawIn`
changed, or has its `startTime` moved on or off the frame.

Undo: adding and deleting drawings save undo state today, and the
recalculation is part of that same step. Inspector edits and timeline drags do
not save undo state today (`updateAnnotation` never does); making them undoable
is out of scope, and the recalculation simply rides along with them.

If the frame's freeze is hand-set (`freezeAuto` not true), delays are still
assigned (drawn-order reveal still applies) but `freezeDuration` is left alone.
If the hand-set hold is shorter than the sequence, the later drawings finish
their reveal after play resumes; that is the user's choice.

### 4. Creating freezes

**Draw while playing.** On pointer-down that begins a new annotation with any
drawing tool (pen, line, arrow, arc-arrow, rectangle, circle, text, spotlight,
magnifier), if the video is playing: pause it, read `videoElement.currentTime`,
snap it to the start of its frame (`timeForFrame`), and seek there if needed.
The drawing's `startTime` is that snapped time. Selecting, moving or editing an
existing object does not pause.

Today `createAnnotation` stamps the store's `currentTime` when the drawing is
*committed*: shapes on mouse-up, the pen on `path:created` (the mouse-down
handler returns early for the pen), text on mouse-down. So the snapped time
must be captured at pointer-down for every tool, the pen's free-drawing path
included, and carried through to creation.

Text is created on click and deleted if left empty. That adds an automatic
freeze and then removes it again; this must happen silently, with no toast and
no leftover undo step or marker.

**Draw while paused.** A drawing made on a paused frame (user pause or `H`)
uses the snapped real video time too, not the store's lagging value.

**Every drawn-on frame gets an automatic freeze.** When a drawing is added to a
frame that has no freeze, an automatic freeze is created there
(`setFreezeAt` with `freezeAuto: true`) and sized by the function above. If the
frame already has a freeze, that freeze is kept as it is.

**Removing it.** Setting Freeze to 0 in the inspector removes the hold, as
today. To honour the anti-goal, the frame must remember that: keep the marker
with `freezeDuration: 0` and `freezeAuto: false` (or an equivalent the builder
prefers), so further drawings on that frame do not bring the freeze back.
Any hand edit of the Freeze field sets `freezeAuto` false. The inspector gets a
small "Auto" button next to the Freeze field that turns `freezeAuto` back on
and recalculates.

**Deleting the last drawing** on a frame with an automatic freeze removes the
freeze marker too.

**Plain `H` with no drawings** keeps today's behaviour: the hold is the time
the user stayed paused, and it is not automatic. If the user presses `H`, draws,
and resumes, the freeze becomes automatic and the recorded pause time is
ignored. A hold recorded on resume must never overwrite an automatic or
hand-set freeze that the drawing step already put on that frame.

**Late-freeze fix.** `handlePlay` in `VideoPlayer.tsx` places the marker at
`video.currentTime` read inside the `play` event, after playback has restarted,
and unsnapped. Use the time captured at the pause (`freezeTiming.time`),
snapped to its frame. Frame-stepping during the pause still moves the freeze to
the frame the user resumed from, as designed; capture that frame before `play()`
is called, not after.

**First Play previews the freeze (Mark's decision).** This replaces release 1's
"just drawn, then Play: no replay" rule. When the user presses Play on a frame
they have just drawn on, the frame holds for the calculated time, the drawings
reveal in order, and then play resumes: what the export will show. It applies
whether the pause came from drawing mid-play, from Space, or from `H`.

Today nothing does this. The hold is skipped on resume only via `handlePlay`
and `triggeredFreezesRef`, and only when `freezeTiming` (the `H` timer) is set;
the live-reveal hook treats drawings made while paused as already seen
(`useLiveReveal.ts`), so they would not animate. The builder needs a way to
start an automatic hold from the current frame on Play, and to arm those
drawings for reveal. Pressing Play or Space during the preview ends the hold
and resumes at once, as a hold can be cut short today. A plain `H` freeze with
no drawings still resumes immediately, since its hold is being recorded.

### 5. "Stays" chips

Add `stayPreset` to `toolStore`: `'freeze' | 1 | 2 | 4 | 'end'`, default `2`.
A segmented control labelled "Stays" sits beside the style control in
`DrawingToolbar.tsx`.

What each chip sets on a drawing:

| Chip | `endTime` | Fades |
|---|---|---|
| Freeze only | `startTime` + one source frame | fade-in and fade-out forced to 0 |
| 1s / 2s / 4s | `startTime` + N seconds of source time, clamped to the video | the tool's defaults |
| To end | video duration | the tool's defaults |

Source time does not advance during a hold, so `2s` means the drawing stays for
the whole freeze and then two seconds of motion. `Freeze only` means it is on
screen for the freeze and cuts away as play resumes. The builder must check
that a one-frame annotation is drawn for the whole hold in both the live view
and export, and that it does not flash on the frame when there is no hold
(if the freeze was set to 0, a `Freeze only` drawing shows for one frame; that
is accepted).

The chip applies to new drawings from the tools listed in section 4. With
drawings selected, clicking a chip re-times them and saves one undo step, the
same pattern as the style control. The chip replaces the per-tool `duration`
default for these tools; `fadeIn`, `fadeOut` and `drawIn` defaults stay.
Hidden tools (tracker) and freeze markers ignore it.

The toolbar does not try to show a selected drawing's current length; the chip
always shows the default for new drawings. The inspector's Start/End fields
remain for exact values.

### 6. Timeline snapping

Bars can already be moved and resized. Add snapping while dragging a bar or an
edge: to the playhead and to freeze frames, within about 6 px, and always to
whole source frames. Holding Alt disables the playhead/freeze snap. After a
drag that moves a drawing's start on or off a frozen frame, the recalculation
in section 3 runs.

### 7. Export

`spanBuilder` and `clipRenderer` pass `revealDelay` through to the shared
clock; a not-yet-due drawing is absent from the frame's signature. Hold lengths
are ordinary `freezeDuration` values by the time export sees them, so
`outputTimeline.ts` needs no change. The 500-overlay budget fallback from
release 1 still applies; sequenced reveals do not overlap in time, so the
number of distinct overlays grows roughly with the sum of the steps, as before.

No ffmpeg or main-process changes are expected.

## Constraints

- Hidden features stay hidden (project CLAUDE.md).
- The store's `currentTime` update rate must not change; read the video element
  directly where frame accuracy matters.
- No new dependencies.
- On this machine, run tests with `npx vitest run --no-file-parallelism`; the
  repo sits on a network share and parallel runs flake.

## Testing

- Sequence function: delays back to back, 0.15 s step for no-draw-on tools,
  hold = sequence + 1.0 s, cap, single drawing, empty frame.
- `revealElapsed` with a delay; a not-yet-due drawing is invisible live and
  absent from export spans.
- Store: adding and deleting drawings on an automatic frame recalculates;
  a hand-set hold is untouched; Freeze 0 survives further drawings; deleting the
  last drawing removes an automatic marker; each is one undo step.
- Freeze placement: marker lands on the paused frame, snapped; frame-stepping
  during the pause moves it to the resume frame.
- Chips: each preset's `endTime` and fades; re-timing a selection; `Freeze only`
  visible for the whole hold in spans.
- Serializer round-trip for `revealDelay` and `freezeAuto`; a project without
  them loads and exports as before.
- First Play after drawing holds and reveals in order; a second Play during the
  preview resumes at once; plain `H` with no drawings resumes immediately.
- In the app: play, draw three shapes mid-play, press Play; replay through the
  hold; export MP4 and GIF and compare with the live view; each chip.

## Left to the builder

- Exact module and function names, and where the recalculation hooks into the
  store.
- Whether Freeze 0 is remembered as a zero-length marker or another way.
- The snap distance and the chip control's layout.
- Whether a stored creation index is needed (section 3).
