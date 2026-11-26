# Keyboard Shortcuts Reference

Press `?` (or `Shift+/`) in the app to open the shortcuts help modal, and use its
**Edit shortcuts…** button to rebind any key below — shortcuts are not fixed;
`src/stores/shortcutsStore.ts` persists your custom bindings.

The tables below reflect `DEFAULT_SHORTCUTS` in `src/stores/shortcutsStore.ts`
exactly. If you change a default binding in that file, update this doc too.

## Tools

| Shortcut | Tool |
|----------|------|
| `V` | Select tool |
| `P` | Pen (freehand) |
| `Shift+L` | Line tool |
| `A` | Arrow tool |
| `R` | Rectangle tool |
| `C` | Circle tool |
| `T` | Text tool |
| `S` | Spotlight tool |
| `Shift+M` | Magnifier tool |
| `Shift+A` | Arc arrow tool |
| `G` | Player ring tool (Field group) |
| `Z` | Zone tool (see Zones) |
| `Shift+T` | Callout tool (double-click a callout, with Select or Callout, to edit its label) |
| `D` | Toggle line style: Solid / Dashed (line, arrow, arc arrow, pen; also selected drawings) |
| `E` | Eraser tool |

## Video Playback

| Shortcut | Action |
|----------|--------|
| `Space` | Play / Pause |
| `H` | Freeze: stop on this frame and time it; press again (or Play) to resume and record the freeze. Drawing also adds freezes on its own (see Freeze frames). Also the ❄ button beside Play |
| `W` | Slow motion: hold while the video plays; releasing saves that stretch as a 50% speed region (see Slow motion). Also the Slow button beside Freeze, which you press and hold |
| `N` | Narration: hold to record your voice. Paused, the frame freezes for the length of the voice; playing, the voice goes over the video (see Narration). Also the mic button beside Slow, which you press and hold |
| `→` | Next frame |
| `←` | Previous frame |
| `L` | Shuttle forward — tap again for 2x / 4x / 8x |
| `J` | Shuttle reverse — tap again for 2x / 4x / 8x |
| `K` | Stop shuttle / pause (restores your chosen speed) |
| `K` held + `J` / `L` | Previous / next frame |
| `Shift+←` / `Shift+→` | Skip backward / forward 10s |
| `Home` | Go to start |
| `End` | Go to end |
| `M` | Toggle mute |
| `F` | Toggle fullscreen |
| `Ctrl+L` | Toggle loop |

## In/Out Points

| Shortcut | Action |
|----------|--------|
| `I` | Set In point |
| `O` | Set Out point |
| `[` | Jump to In point |
| `]` | Jump to Out point |
| `Alt+←` / `Alt+→` | Nudge In 1 frame earlier / later |
| `Alt+Shift+←` / `Alt+Shift+→` | Nudge Out 1 frame earlier / later |

Frame steps and nudges use the video's real frame rate (read with ffmpeg when
the video opens; 30 fps until then). The timecode reads `mm:ss:frames`.
Nudges act on the **selected clip** if there is one, otherwise on the loose
In/Out points, and park the playhead on the edge so you can see the frame
(for Out, the last frame still inside the clip).

Upgrading from v1.2 or earlier: the old `J`/`L` skip bindings move to
`Shift+←/→` automatically; a skip binding you customised yourself is kept.

## Clips

| Shortcut | Action |
|----------|--------|
| `Shift+C` | Add clip from In/Out |
| `X` | Mark moment: clip around the playhead (see the Clips panel's "Mark: −Ns / +Ns" setting) |

`X` clips `[playhead − pre-roll, playhead + post-roll]` (defaults 8s/4s, adjustable
in the Clips panel), clamped to the video's length. It works while playing — it
reads the exact time the key was pressed and doesn't pause or seek. Any
**sticky tags** set in the Clips panel are applied to the new clip automatically
(for both `X` and `Shift+C`).

## Editing

| Shortcut | Action |
|----------|--------|
| `Ctrl+Z` | Undo |
| `Ctrl+Y` or `Ctrl+Shift+Z` | Redo |
| `Ctrl+A` | Select all |
| `Delete` | Delete selected |
| `Escape` | Deselect / Select tool |

On macOS, `Ctrl` shortcuts also respond to `Cmd`.

## Colors

Quick color presets, in the same order as the swatches in the drawing toolbar
(`PRESET_COLORS` in `src/stores/toolStore.ts`). The tenth preset color
(near-black) has no default shortcut.

| Shortcut | Color |
|----------|-------|
| `1` | Red |
| `2` | Orange |
| `3` | Yellow |
| `4` | Green |
| `5` | Teal |
| `6` | Blue |
| `7` | Purple |
| `8` | Pink |
| `9` | White |

## App-level (not rebindable)

These are handled directly in `src/App.tsx` rather than through the shortcuts
store, so they don't appear in the Edit Shortcuts dialog.

| Shortcut | Action |
|----------|--------|
| `?` / `Shift+/` | Toggle keyboard shortcuts help |
| `Escape` | Close the open modal (help, editor, export) |

## Customization

Shortcuts are rebindable: open the shortcuts help modal (`?`) and click
**Edit shortcuts…**, or reach it directly if your build exposes a menu item
for it. Click the pencil next to any shortcut, press the new key combo, and
confirm. Use **Reset to Defaults** to restore the bindings listed above.

## Freeze frames

A freeze holds one frame for a few seconds. Exported clips include every
freeze inside their range: the frame repeats for that long, with silence, so a
10 s clip with a 3 s freeze exports at 13 s. Freezes also play back live in the app.

**Freeze (`H`, or the ❄ button beside Play)** is the alternate to Pause. It stops
on the current frame and starts a timer on the button. When you resume, with
Freeze again or with Play, a freeze of that length is recorded on that frame.
So you hold the frame live while you talk, and that becomes the freeze.
Plain Pause never records anything by itself.

**Drawing adds freezes too.** Drawing while the video plays pauses on that
frame and adds a freeze automatically. Its length is sized from the drawings
plus about a second to read, however long you took to draw. Drawing on a frame
you paused yourself does the same.

- Drawings on one frozen frame draw on one after another, in the order you
  drew them, live and in exported MP4s and GIFs.
- Pressing Play after drawing previews the freeze, then playback resumes. Play
  or Space again skips the rest of the preview.
- `H` with no drawings still records the time you held the frame. If you draw
  after pressing `H`, the freeze becomes automatic and the paused time is
  ignored.
- Freezes set from drawings, or typed in the Freeze field, are kept: `H` on
  such a frame doesn't change them and shows a message instead. On a drawn
  frame with no freeze (a project from an earlier version, or drawings moved
  off their freeze), `H` records one as usual and the drawings draw on in
  order during it.

Using `H`:

- `H` works while playing or already paused. Stepping a few frames while
  timing (up to about ½ s) is fine: the freeze goes on the frame you resume
  from.
- Seeking or scrubbing further away cancels the `H` freeze. One shorter than
  0.3 s (a double-tap) isn't recorded.
- Freezes are capped at 30 s. Pressing `H` on a frame that already has a freeze
  you recorded with `H` replaces its length, including while that freeze is
  playing back.
- To change a freeze's length or delete it, use its marker in the annotation
  details on the timeline.

Up to v1.3, a "hold" (`H` and Shift+H **HOLDS**) and the toolbar snowflake were
three ways of making the same thing. They're all Freeze now. A custom key you
gave to the hold toggle carries over to Freeze.

## Slow motion

Hold **`W`** (or press and hold the Slow button beside Freeze) while the video
plays forward. Playback drops to 50% and the sound mutes. Release to save that
stretch as a slow-motion region.

- A tap under about a third of a second records nothing.
- Pausing, seeking, or switching away from the window ends the recording at
  that point. An automatic freeze during it does not; the recording carries on
  as one region.
- Pressing `W` while paused does nothing.
- The speed eases in and out over about a quarter of a second at each end of a
  region, on replay and in exports.
- The speed dropdown is your own playback speed and multiplies with the
  region's: at 50% in the dropdown, a 50% region plays at 25%. A badge beside
  the dropdown shows the region's speed while the playhead is inside one.
- Regions appear on the Speed lane in the timeline. Drag a band to move it and
  drag an end to resize it; both snap to the playhead and to whole frames (hold
  `Alt` to skip the playhead snap). Click a region to pick 25%, 50%, 75% or 2x,
  or delete it with the Delete button or `Delete` / `Backspace`. Regions never
  overlap: placing one over another trims the other.
- Exported MP4s and GIFs play each region at its speed and are silent during
  it. Drawings keep their normal draw-on and fade timing, and "Stays 2s" still
  means two seconds of the play, which lasts longer on screen when slowed.
  Freezes inside a region hold for their usual length.
- Slow motion repeats frames rather than inventing new ones, so 60 fps footage
  looks smoother than 30 fps.
- Regions are saved in the project file. Undo and Redo cover them, in the same history as drawings.

## Narration

Hold **`N`** (or press and hold the mic button beside Slow) to record your
voice. Release to save it.

- A tap under 0.3 seconds records nothing. A clip stops by itself at 120 seconds.
- Paused: the frame freezes for as long as the voice lasts, or for the frame's
  own freeze if that is longer. A frame holds one voice clip; recording again
  replaces it.
- Playing: the voice goes over the moving video and the game sound drops. Set
  how far with "Game sound under voice" (Low, Off, Full) in the timeline header.
- Clips show on the Voice lane. Click one to select it and hear it. `Delete` or
  `Backspace` (or the Delete button) removes it.
- The microphone permission is asked the first time you record.
- Voice clips are saved in the project file with their audio. Undo and Redo
  cover them, in the same history as drawings.
- MP4 exports (single, clips and reel) contain the voice. GIFs are silent.

## Zones

Press `Z`, then click each corner of the area. It needs at least three corners.

- Finish with a double-click, `Enter`, or a click on the first corner.
- `Backspace` removes the last corner.
- `Escape` cancels the zone.
- While corners are being placed, other shortcut keys are ignored (menu
  shortcuts with `Ctrl` / `Cmd` still work). Starting playback, seeking or
  switching tools also cancels the zone.
