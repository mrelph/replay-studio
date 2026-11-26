# New tools: player ring, zone, dashed movement lines, callouts

Release 4 of 4 in the "broadcast quality" track. Target version: 1.9.0
(released together with release 3, speed ramps, after one major full test).
Builds on releases 1 to 3 (designs beside this file).

## Intent

Mark wants the telestrator vocabulary a broadcast uses and Replay Studio lacks:
a ring under a player, a shaded area of ice, a dashed line for a pass or a
route, and a label that points at something. Today the tools are pen, line,
arrow, arc arrow, rectangle, ellipse, text, spotlight, zoom lens and eraser:
no filled shapes, no dashes, nothing that reads as lying on the playing
surface, and no label with a pointer.

## Goals

- Four additions, each usable in one gesture: Ring, Zone, a Solid/Dashed switch
  for the line tools, and Callout.
- They behave like the existing drawings everywhere: automatic freeze and
  drawn-order reveal (release 2), Stays chips, Outline/Glow/Clean, speed
  regions (release 3), undo/redo, save/load, MP4/GIF export, eraser, select,
  move, restyle.
- Two bugs fixed: the text tool ignoring the chosen font, and arrowheads losing
  their anchor on save/load.
- Projects saved by 1.8.0 load and export exactly as before.

## Non-goals

- A tool popup at the cursor (deferred by Mark).
- Real perspective: the ring's tilt is a fixed look, not derived from the camera.
- Editing a callout's text after it is created.
- Player tracking, or shapes that follow a player.
- Moving the existing tools out of `DrawingCanvas.tsx`.
- Freehand zones, curved zone edges, zones with holes.

## Anti-goals

- A new shape that saves and comes back as something else (today an unknown
  Fabric type reloads as a 50×50 rectangle).
- A dashed line that turns solid, or vanishes, while it draws on or after export.
- New code paths that change how the ten existing tools behave.

## What Mark decided

1. This release includes the **ring, zone, movement line and callout**, plus the
   two bug fixes. The cursor popup is deferred.
2. Dashed is a **Solid / Dashed switch in the toolbar** that applies to line,
   arrow, arc arrow and pen, not a separate tool.
3. A zone is drawn by **clicking its corners**.

Everything else below is Claude's call unless marked.

## Approaches

| Approach | Trade-off | Verdict |
|---|---|---|
| **New tools as small modules** plugged into the canvas through one thin dispatch; existing tools untouched | Readable, testable in isolation, nothing working is moved | **Picked** (Mark left the how to Claude) |
| Add the tools to the existing 1,100-line switch | Fast, consistent with today, but harder to change and untestable in isolation | Rejected |
| Split every existing tool into modules first | Cleanest end state; a large refactor of working code before the full test | Out of scope |

## Design

### 1. Tool module shape

A new-tool module lives in `src/components/Canvas/tools/` and exports an object
with optional handlers, each given a small context (canvas, pointer position in
canvas coordinates, current colour / stroke width / style / dashed flag, and a
`commit(object, toolType)` that wraps today's `createAnnotation`):

```ts
interface CanvasTool {
  onDown?(ctx, e): void; onMove?(ctx, e): void; onUp?(ctx, e): void
  onDoubleClick?(ctx, e): void; onKey?(ctx, e: KeyboardEvent): boolean   // true = handled
  cancel?(ctx): void                                                       // tool switched away mid-gesture
}
```

`DrawingCanvas.tsx` looks the current tool up in a `NEW_TOOLS` map at the top of
its mouse handlers and, when found, delegates and returns; otherwise the
existing switch runs unchanged. Frame capture on pointer-down
(`captureDrawFrame`) and everything `createAnnotation` does (Stays timing,
automatic freeze, pending preview) apply to the new tools exactly as to the old
ones. The unused `ToolRegistry` plugin singleton is left alone.

Gesture state lives in a ref that survives React re-subscribing the mouse
handlers: today that effect re-runs whenever colour, stroke width, style or text
format changes, and nothing cancels a half-made shape. For the new tools, a
colour or width change mid-gesture applies to the shape in progress; switching
tool calls `cancel`, which removes any preview objects.

Geometry and object construction for each tool are pure functions (points in,
Fabric object options or a built object out) so they can be unit-tested without
a canvas.

### 2. Ring (`toolType: 'ring'`, key `G`)

- Press sets the centre; dragging sets the horizontal radius `rx` (distance from
  the centre, minimum 12 px); the vertical radius is `rx / RING_FLATTEN` with
  `RING_FLATTEN = 2.5`. Release commits. A click without a drag creates a ring
  of `rx = 40`.
- Built as a **surface shape** (section 2a): a fill ellipse at
  `RING_FILL_ALPHA = 0.18` of the current colour, and an outline ellipse in the
  current colour and width, both centred on the press point.
- Draw-on (`revealKind` 'ring'): the outline draws around its edge; the fill is
  hidden until the reveal passes 0.85 and then fades up to full by 1.0, like the
  arrowhead rule.
- Defaults: `drawIn 0.4`, fades 0. Styled (Outline/Glow/Clean) and timed by the
  Stays chip.

### 2a. Surface shapes (ring and zone)

A translucent fill and a contrast style do not mix on one Fabric object: the
shadow is cast by the fill as well as the stroke and shows through it, so
Outline would darken a zone's interior by about a fifth and Glow would wash it
out. So a ring and a zone are each a `fabric.Group` of two children, in this
order: the **fill** (no stroke, no shadow) and the **outline** (transparent
fill, the stroke, and the style's shadow).

- One helper builds a surface shape from a fill object and an outline object,
  and one function returns its parts from a group; restyle, reveal and the
  timeline's colour picker use them.
- `restyleObject` applies the shadow to the outline child only.
- `reveal.ts`'s `arrowParts` treats every 2-child group as shaft + head today.
  Reveal must branch on `toolType` first so a ring or zone is never treated as
  an arrow; add a test that an arrow, a ring and a zone each take their own path.
- **Recolouring.** The timeline's colour picker sets `fill = colour` on any
  non-transparent fill, which would turn a ring or zone into an opaque blob.
  Change that one path so a translucent fill keeps its alpha when recoloured
  (new colour, same alpha). This is an allowed change to existing code; solid
  fills behave as before.

### 3. Zone (`toolType: 'zone'`, key `Z`)

- Each click adds a corner. A rubber-band edge follows the pointer from the last
  corner, and the area so far is shown filled. Double-click, Enter, or clicking
  the first corner again (within 10 px) finishes; Escape, or switching tools,
  cancels. Backspace removes the last corner. Fewer than 3 corners on finish
  cancels. A double-click's second click must not add a duplicate corner.
- Frame capture happens on the first corner; the video stays paused while the
  zone is being built.
- The finished shape is a surface shape (section 2a) made of two closed
  `fabric.Path`s (`M … L … Z`): the fill at `ZONE_FILL_ALPHA = 0.25` of the
  current colour, and the outline in the current colour and width. Paths, not
  `fabric.Polygon`, because the project serializer and the export clone already
  handle paths.
- No draw-on (`revealKind` 'none'). Defaults: `fadeIn 0.2`, `fadeOut 0.15`,
  `drawIn 0`. Styled and timed by the Stays chip.
- **Keys while a zone is in progress.** Three separate `window` keydown
  listeners exist today (the shortcuts hook, the timeline's Delete/Escape
  handler, and one in `App.tsx`), and Escape normally switches to the Select
  tool. While a zone has at least one corner, a capture-phase listener handles
  Enter, Escape and Backspace itself and stops them reaching the others, and
  swallows every other shortcut key (Space, arrows, digits, tool keys) so the
  zone cannot be half-abandoned by accident. If playback starts or the playhead
  moves by any other means (transport buttons, a timeline click), the zone is
  cancelled. Typing in an input field is never intercepted.

### 4. Solid / Dashed

- `toolStore.lineDash: 'solid' | 'dashed'`, default solid, with a segmented
  control beside the style control, and shortcut `D` to flip it.
- Applies to new line, arrow, arc-arrow and pen drawings. With such drawings
  selected, the control switches them as one undo step (the style control's
  pattern). Other tools ignore it.
- Stored per annotation as `dashed?: boolean` (Annotation, snapshot,
  serializer), like `drawIn`. Absent means solid, so old projects are unchanged.
  The flag lives on the annotation, not the Fabric object, so the live loop
  (`useLiveReveal.ts`) and the export (`clipRenderer.ts`) must pass it to
  `applyReveal` from the annotation.
- Dashed stroke objects set `strokeUniform: true`, so resizing a dashed line by
  its handles does not stretch the dashes.
- The pattern is derived, not stored: `strokeDashArray = [3w, 2w]` for stroke
  width `w`, round line caps off (butt caps) so gaps stay open, applied to the
  stroke object (the shaft inside an arrow group; the head stays solid). It is
  re-applied whenever the object is built, loaded, restyled or its stroke width
  changes.
- **Draw-on with dashes.** Today the reveal replaces the object's dash array
  with `[L, L]`. For a dashed annotation the reveal instead builds a dash array
  that shows the pattern up to the revealed length and nothing after it
  (`[3w, 2w, 3w, 2w, …, remainder, L]`), so the dashes appear along the path as
  it draws. At fraction 1 the plain pattern is restored. `stripReveal` already
  restores whatever dash array the object had (the reveal saves and restores
  it), so only the mid-reveal array is new code. Live and export share this
  through `applyReveal`, which gains the annotation's `dashed` flag.

### 5. Callout (`toolType: 'callout'`, key `Shift+T`)

- Press on the target, drag to the label position, release: a text box opens at
  the release point with the caret in it, using the current text format (size,
  bold, italic, font, plate). A press without a drag (under 8 px) places the
  label 80 px up and to the right of the target.
- When the text is committed (click away or Escape), the callout becomes one
  group of exactly three children: a dot at the target (radius `max(3, 1.5w)`,
  filled in the current colour), a leader line from the dot to the nearest edge
  of the label's **plate** box in the current colour and width, and the label.
  Empty text discards everything, silently, like an empty text box.
- The click that commits the text must not also start a new callout. (Fabric
  ends text editing during that click's deselect, before our mouse-down handler
  runs; the text tool has this habit today and is left as it is.)
- The label always has the text plate (`textPlate: true`, whatever the text
  format's plate setting), since a label over video with a leader needs a
  ground. The plate is drawn outside the text's own box (`textPlate.ts` pads by
  0.3 × font size), and a Fabric group caches at its children's bounds, so the
  plate's outer edge would be clipped: build the callout group with
  `objectCaching: false`, and set it again wherever a callout is rebuilt (load,
  undo restore, export clone), since that flag is not saved.
- Draw-on (`revealKind` 'callout'): the dot appears at once, the leader draws
  from the dot to the label over the first 0.85 of the reveal, then the label
  fades in. Defaults: `drawIn 0.3`, `fadeOut 0.15`.
- The Solid/Dashed switch does not apply. Styled and timed by the Stays chip.
- The text cannot be edited after commit (double-click selects the group).
  Recolouring through the style control keeps working.

### 6. Everything that lists tool types

The three new types are added to: `ToolType`, the toolbar (a "Field" group
after the shapes: Ring, Zone, Callout), `ShortcutAction` and its defaults
(`G`, `Z`, `Shift+T`, and `tool.toggleDash` on `D`), `TOOL_ACTION_MAP`, the
cursor map, `DRAW_FRAME_TOOLS`, `TOOL_DEFAULTS`, `STYLED_TOOL_TYPES` and
`GLOW_BLUR`, `STAY_TOOL_TYPES`, `revealKind`, and `strokeLength` where needed.
A test enumerates every toolbar tool type and asserts each has an entry in
`TOOL_DEFAULTS`, a `revealKind`, and a shortcut, so the next tool cannot be
half-registered.

### 7. Saving and loading

- Serializer: persist `originX` / `originY` (fixes arrowheads losing their
  anchor, and keeps the ring centred), `strokeLineCap`, and the per-annotation
  `dashed` flag. `strokeDashArray` itself is not saved; it is derived on load.
- An unknown Fabric type must no longer come back as a 50×50 rectangle: skip the
  annotation and report how many were skipped in one toast.
- Written version becomes `'1.4'`. A `'1.3'` (1.8.0 + speed ramps) or older
  file loads unchanged: no `dashed`, objects without saved origins keep Fabric's
  defaults as they do today.
- Round-trip tests for a ring, a zone, a dashed arrow and a callout: type,
  geometry, fill alpha, plate and `dashed` survive.

### 8. Bug fixes

- **Text font:** `DrawingCanvas.tsx` sets `fontFamily: 'Arial'` after spreading
  the text format, overriding the chosen font. Remove the override; add a test
  on the function that builds the text options.
- **Arrowhead anchor:** covered by section 7. Add a round-trip test asserting an
  arrow's head position and rotation are the same after save and load.

## Constraints

- Hidden features stay hidden (project CLAUDE.md). No new dependencies. No IPC
  changes.
- The ten existing tools' behaviour and code paths do not change, apart from the
  two bug fixes and the dashed flag on the four line tools.
- Testing budget (Mark, 2026-11-25): focused test files, typecheck and lint per
  task; no full-suite run and no app run per task. At the end of this release
  comes the **major full test** covering releases 3 and 4 together: the full
  suite once, and a full in-app and export pass.
- On this machine tests run with `npx vitest run <files> --no-file-parallelism`.

## Testing

- Pure geometry: ring radii and minimums; zone path from corners, finish and
  cancel rules, the duplicate-corner guard; callout dot, leader end point on the
  label box edge for labels in each quadrant.
- Dashed: pattern from stroke width; reveal dash array at fractions 0, 0.5 and
  1 (total shown length ≈ fraction × L, pattern preserved); `stripReveal`
  restores the pattern; arrow head stays solid.
- Reveal kinds: ring fill appears after 0.85; zone has no reveal; callout order
  dot → leader → label.
- Registration test (section 6).
- Serializer round-trips (section 7) and the two bug-fix tests.
- Major full test at the end (see Constraints), including: draw each new tool
  mid-play, the freeze preview with a mix of old and new tools in drawn order,
  each inside a slow region, save/load, MP4 and GIF export compared with the
  live view.

## Left to the builder

- File and function names; the exact `CanvasTool` context fields.
- Icons, the toolbar group's layout, and the cursor for each tool.
- How the in-progress zone preview is drawn.
- Exact dash proportions if `[3w, 2w]` looks wrong at small widths (tune by
  reasoning; it will be checked by eye in the full test).
