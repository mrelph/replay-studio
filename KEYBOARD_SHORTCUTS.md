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
| `E` | Eraser tool |

## Video Playback

| Shortcut | Action |
|----------|--------|
| `Space` | Play / Pause |
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
| `H` | Add a hold (freeze) on the paused frame; press again to remove it |
| `Shift+H` | Record pauses as holds (on / off) — also the **HOLDS** button by the loop toggle |

`X` clips `[playhead − pre-roll, playhead + post-roll]` (defaults 8s/4s, adjustable
in the Clips panel), clamped to the video's length. It works while playing — it
reads the exact time the key was pressed and doesn't pause or seek. Any
**sticky tags** set in the Clips panel are applied to the new clip automatically
(for both `X` and `Shift+C`).

## Editing

| Shortcut | Action |
|----------|--------|
| `Ctrl+Z` | Undo |
| `Ctrl+Y` | Redo |
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

## Holds (freeze frames)

A hold freezes one frame for a few seconds. Exported clips include every hold
inside their range: the frame repeats for that long, with silence, so a
10 s clip with a 3 s hold exports at 13 s. Holds also play back live in the app.

- **`H`** (while paused) adds a hold on the frame you're looking at, using the
  length set in the snowflake (freeze) button on the drawing toolbar (default
  3 s). Press `H` again on the same frame to remove it.
- **Record pauses (`Shift+H`)**: while recording is on, each time you pause and
  then resume, a hold is added at that frame **for as long as you paused**. So you
  can talk through a play in real time, and the clip picks up your pauses.
  - Stepping a few frames while paused (up to about ½ s) is fine: the hold goes
    on the frame you resume from.
  - A pause is **not** recorded if you rewind or scrub away before resuming, if
    it lasts under 0.3 s (a double-tap), or if it's the app's own stop (the Out
    point, a hold playing back, or the J reverse shuttle).
  - Long pauses are capped at 30 s. You can edit any hold's length in the
    annotation details on the timeline.
  - Pausing again on a frame that already has a hold replaces that hold's length.

