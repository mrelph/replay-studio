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
| `Shift+P` | Laser pointer |
| `E` | Eraser tool |

## Video Playback

| Shortcut | Action |
|----------|--------|
| `Space` | Play / Pause |
| `→` | Next frame |
| `←` | Previous frame |
| `L` | Skip forward 10s |
| `J` | Skip backward 10s |
| `K` | Pause |
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
| `Shift+C` | Add clip from In/Out (see Clips panel) |

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
