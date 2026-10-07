import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ShortcutAction =
  // Tools
  | 'tool.select'
  | 'tool.pen'
  | 'tool.line'
  | 'tool.arrow'
  | 'tool.rectangle'
  | 'tool.circle'
  | 'tool.text'
  | 'tool.spotlight'
  | 'tool.magnifier'
  | 'tool.arcArrow'
  | 'tool.erase'
  // Video
  | 'video.playPause'
  | 'video.stepForward'
  | 'video.stepBackward'
  | 'video.skipForward'
  | 'video.skipBackward'
  | 'video.pause'
  | 'video.goToStart'
  | 'video.goToEnd'
  | 'video.toggleMute'
  | 'video.toggleFullscreen'
  | 'video.toggleLoop'
  | 'video.shuttleForward'
  | 'video.shuttleReverse'
  | 'video.freeze'
  // In/Out points
  | 'inout.setIn'
  | 'inout.setOut'
  | 'inout.jumpToIn'
  | 'inout.jumpToOut'
  | 'trim.inBackward'
  | 'trim.inForward'
  | 'trim.outBackward'
  | 'trim.outForward'
  // Clips
  | 'clip.add'
  | 'clip.markMoment'
  // Editing
  | 'edit.undo'
  | 'edit.redo'
  | 'edit.selectAll'
  | 'edit.delete'
  | 'edit.deselect'
  // Colors
  | 'color.1'
  | 'color.2'
  | 'color.3'
  | 'color.4'
  | 'color.5'
  | 'color.6'
  | 'color.7'
  | 'color.8'
  | 'color.9'

export interface ShortcutBinding {
  key: string
  ctrl?: boolean
  shift?: boolean
  alt?: boolean
}

export interface ShortcutDefinition {
  action: ShortcutAction
  label: string
  category: string
  binding: ShortcutBinding
}

// Default shortcut mappings
export const DEFAULT_SHORTCUTS: ShortcutDefinition[] = [
  // Tools
  { action: 'tool.select', label: 'Select tool', category: 'Tools', binding: { key: 'v' } },
  { action: 'tool.pen', label: 'Pen (freehand)', category: 'Tools', binding: { key: 'p' } },
  { action: 'tool.line', label: 'Line tool', category: 'Tools', binding: { key: 'l', shift: true } },
  { action: 'tool.arrow', label: 'Arrow tool', category: 'Tools', binding: { key: 'a' } },
  { action: 'tool.rectangle', label: 'Rectangle tool', category: 'Tools', binding: { key: 'r' } },
  { action: 'tool.circle', label: 'Circle tool', category: 'Tools', binding: { key: 'c' } },
  { action: 'tool.text', label: 'Text tool', category: 'Tools', binding: { key: 't' } },
  { action: 'tool.spotlight', label: 'Spotlight tool', category: 'Tools', binding: { key: 's' } },
  { action: 'tool.magnifier', label: 'Magnifier tool', category: 'Tools', binding: { key: 'm', shift: true } },
  { action: 'tool.arcArrow', label: 'Arc arrow tool', category: 'Tools', binding: { key: 'a', shift: true } },
  { action: 'tool.erase', label: 'Eraser tool', category: 'Tools', binding: { key: 'e' } },
  // Video
  { action: 'video.playPause', label: 'Play / Pause', category: 'Video Playback', binding: { key: ' ' } },
  { action: 'video.freeze', label: 'Freeze: stop on this frame and time it; resume to record the freeze', category: 'Video Playback', binding: { key: 'h' } },
  { action: 'video.stepForward', label: 'Next frame', category: 'Video Playback', binding: { key: 'arrowright' } },
  { action: 'video.stepBackward', label: 'Previous frame', category: 'Video Playback', binding: { key: 'arrowleft' } },
  { action: 'video.shuttleReverse', label: 'Shuttle reverse (tap again: faster; hold K: prev frame)', category: 'Video Playback', binding: { key: 'j' } },
  { action: 'video.pause', label: 'Stop shuttle / pause', category: 'Video Playback', binding: { key: 'k' } },
  { action: 'video.shuttleForward', label: 'Shuttle forward (tap again: faster; hold K: next frame)', category: 'Video Playback', binding: { key: 'l' } },
  { action: 'video.skipForward', label: 'Skip forward 10s', category: 'Video Playback', binding: { key: 'arrowright', shift: true } },
  { action: 'video.skipBackward', label: 'Skip backward 10s', category: 'Video Playback', binding: { key: 'arrowleft', shift: true } },
  { action: 'video.goToStart', label: 'Go to start', category: 'Video Playback', binding: { key: 'home' } },
  { action: 'video.goToEnd', label: 'Go to end', category: 'Video Playback', binding: { key: 'end' } },
  { action: 'video.toggleMute', label: 'Toggle mute', category: 'Video Playback', binding: { key: 'm' } },
  { action: 'video.toggleFullscreen', label: 'Toggle fullscreen', category: 'Video Playback', binding: { key: 'f' } },
  { action: 'video.toggleLoop', label: 'Toggle loop', category: 'Video Playback', binding: { key: 'l', ctrl: true } },
  // In/Out points
  { action: 'inout.setIn', label: 'Set In point', category: 'In/Out Points', binding: { key: 'i' } },
  { action: 'inout.setOut', label: 'Set Out point', category: 'In/Out Points', binding: { key: 'o' } },
  { action: 'inout.jumpToIn', label: 'Jump to In point', category: 'In/Out Points', binding: { key: '[' } },
  { action: 'inout.jumpToOut', label: 'Jump to Out point', category: 'In/Out Points', binding: { key: ']' } },
  { action: 'trim.inBackward', label: 'Nudge In 1 frame earlier (selected clip, else In point)', category: 'In/Out Points', binding: { key: 'arrowleft', alt: true } },
  { action: 'trim.inForward', label: 'Nudge In 1 frame later (selected clip, else In point)', category: 'In/Out Points', binding: { key: 'arrowright', alt: true } },
  { action: 'trim.outBackward', label: 'Nudge Out 1 frame earlier (selected clip, else Out point)', category: 'In/Out Points', binding: { key: 'arrowleft', alt: true, shift: true } },
  { action: 'trim.outForward', label: 'Nudge Out 1 frame later (selected clip, else Out point)', category: 'In/Out Points', binding: { key: 'arrowright', alt: true, shift: true } },
  { action: 'clip.add', label: 'Add clip from In/Out', category: 'Clips', binding: { key: 'c', shift: true } },
  { action: 'clip.markMoment', label: 'Mark moment (clip around playhead)', category: 'Clips', binding: { key: 'x' } },
  // Editing
  { action: 'edit.undo', label: 'Undo', category: 'Editing', binding: { key: 'z', ctrl: true } },
  { action: 'edit.redo', label: 'Redo', category: 'Editing', binding: { key: 'y', ctrl: true } },
  { action: 'edit.selectAll', label: 'Select all', category: 'Editing', binding: { key: 'a', ctrl: true } },
  { action: 'edit.delete', label: 'Delete selected', category: 'Editing', binding: { key: 'delete' } },
  { action: 'edit.deselect', label: 'Deselect / Select tool', category: 'Editing', binding: { key: 'escape' } },
  // Colors (order matches PRESET_COLORS in toolStore.ts, slots 1-9; the 10th
  // preset color, near-black, has no default shortcut)
  { action: 'color.1', label: 'Red', category: 'Colors', binding: { key: '1' } },
  { action: 'color.2', label: 'Orange', category: 'Colors', binding: { key: '2' } },
  { action: 'color.3', label: 'Yellow', category: 'Colors', binding: { key: '3' } },
  { action: 'color.4', label: 'Green', category: 'Colors', binding: { key: '4' } },
  { action: 'color.5', label: 'Teal', category: 'Colors', binding: { key: '5' } },
  { action: 'color.6', label: 'Blue', category: 'Colors', binding: { key: '6' } },
  { action: 'color.7', label: 'Purple', category: 'Colors', binding: { key: '7' } },
  { action: 'color.8', label: 'Pink', category: 'Colors', binding: { key: '8' } },
  { action: 'color.9', label: 'White', category: 'Colors', binding: { key: '9' } },
]

interface ShortcutsState {
  shortcuts: ShortcutDefinition[]
  getShortcut: (action: ShortcutAction) => ShortcutDefinition | undefined
  getActionForKey: (key: string, ctrl: boolean, shift: boolean, alt: boolean) => ShortcutAction | undefined
  updateShortcut: (action: ShortcutAction, binding: ShortcutBinding) => void
  resetToDefaults: () => void
}

// Convert binding to display string
export function bindingToString(binding: ShortcutBinding): string {
  const parts: string[] = []
  if (binding.ctrl) parts.push('Ctrl')
  if (binding.shift) parts.push('Shift')
  if (binding.alt) parts.push('Alt')

  // Format the key for display
  let displayKey = binding.key
  if (displayKey === ' ') displayKey = 'Space'
  else if (displayKey === 'arrowleft') displayKey = '←'
  else if (displayKey === 'arrowright') displayKey = '→'
  else if (displayKey === 'arrowup') displayKey = '↑'
  else if (displayKey === 'arrowdown') displayKey = '↓'
  else if (displayKey === 'escape') displayKey = 'Esc'
  else displayKey = displayKey.toUpperCase()

  parts.push(displayKey)
  return parts.join('+')
}

// Parse key event to binding
export function eventToBinding(e: KeyboardEvent): ShortcutBinding {
  return {
    key: e.key.toLowerCase(),
    ctrl: e.ctrlKey || e.metaKey,
    shift: e.shiftKey,
    alt: e.altKey,
  }
}

// Look up the current key combo for an action, formatted for display
// (e.g. in a tooltip), so tooltip text can't drift from the real binding.
export function useShortcutKeyLabel(action: ShortcutAction): string {
  return useShortcutsStore(
    (state) => {
      const binding = state.shortcuts.find(s => s.action === action)?.binding
      return binding ? bindingToString(binding) : ''
    }
  )
}

export function mergeShortcuts(
  saved: ShortcutDefinition[] | undefined,
  defaults: ShortcutDefinition[],
): ShortcutDefinition[] {
  if (!Array.isArray(saved)) return defaults
  const savedByAction = new Map(saved.map((s) => [s.action, s.binding]))
  return defaults.map((d) => {
    const binding = savedByAction.get(d.action)
    return binding ? { ...d, binding } : d
  })
}

// v0 bound skip ±10s to J/L; v1 gives J/L to the shuttle. Drop those old
// default bindings so they fall back to the new defaults instead of
// shadowing the shuttle. Deliberate custom bindings are kept.
const V0_SKIP_DEFAULTS: Partial<Record<ShortcutAction, string>> = {
  'video.skipForward': 'l',
  'video.skipBackward': 'j',
}

// v1 had a fixed-length hold toggle (H) and a record-pauses mode (Shift+H);
// v2 merges both into Freeze, which keeps the hold toggle's binding. The
// record mode's binding is dropped by `merge` like any removed action.
const V1_RENAMED: Record<string, ShortcutAction> = {
  'clip.toggleHold': 'video.freeze',
}

export function migrateShortcuts(persisted: unknown, version: number): unknown {
  const state = persisted as Partial<ShortcutsState> | undefined
  if (version >= 2 || !Array.isArray(state?.shortcuts)) return persisted
  let shortcuts = state.shortcuts
  if (version < 1) {
    shortcuts = shortcuts.filter((s) => {
      const b = s.binding
      return !(V0_SKIP_DEFAULTS[s.action] === b.key && !b.ctrl && !b.shift && !b.alt)
    })
  }
  shortcuts = shortcuts.map((s) => {
    const renamed = V1_RENAMED[s.action as string]
    return renamed ? { ...s, action: renamed } : s
  })
  return { ...state, shortcuts }
}

export const useShortcutsStore = create<ShortcutsState>()(
  persist(
    (set, get) => ({
      shortcuts: DEFAULT_SHORTCUTS,

      getShortcut: (action) => {
        return get().shortcuts.find(s => s.action === action)
      },

      getActionForKey: (key, ctrl, shift, alt) => {
        const shortcuts = get().shortcuts
        const match = shortcuts.find(s => {
          const b = s.binding
          return (
            b.key === key &&
            (b.ctrl || false) === ctrl &&
            (b.shift || false) === shift &&
            (b.alt || false) === alt
          )
        })
        return match?.action
      },

      updateShortcut: (action, binding) => {
        set(state => ({
          shortcuts: state.shortcuts.map(s =>
            s.action === action ? { ...s, binding } : s
          )
        }))
      },

      resetToDefaults: () => {
        set({ shortcuts: DEFAULT_SHORTCUTS })
      },
    }),
    {
      name: 'replay-studio-shortcuts',
      version: 2,
      migrate: (persisted, version) => migrateShortcuts(persisted, version),
      // Reconcile saved bindings with the current defaults: keep the user's
      // bindings for known actions, drop removed actions, add new ones.
      merge: (persisted, current) => ({
        ...current,
        shortcuts: mergeShortcuts(
          (persisted as Partial<ShortcutsState> | undefined)?.shortcuts,
          DEFAULT_SHORTCUTS,
        ),
      }),
    }
  )
)
