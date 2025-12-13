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
  | 'tool.tracker'
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
  // In/Out points
  | 'inout.setIn'
  | 'inout.setOut'
  | 'inout.jumpToIn'
  | 'inout.jumpToOut'
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
const DEFAULT_SHORTCUTS: ShortcutDefinition[] = [
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
  { action: 'tool.tracker', label: 'Player tracker', category: 'Tools', binding: { key: 'k', shift: true } },
  // Video
  { action: 'video.playPause', label: 'Play / Pause', category: 'Video Playback', binding: { key: ' ' } },
  { action: 'video.stepForward', label: 'Next frame', category: 'Video Playback', binding: { key: 'arrowright' } },
  { action: 'video.stepBackward', label: 'Previous frame', category: 'Video Playback', binding: { key: 'arrowleft' } },
  { action: 'video.skipForward', label: 'Skip forward 10s', category: 'Video Playback', binding: { key: 'l' } },
  { action: 'video.skipBackward', label: 'Skip backward 10s', category: 'Video Playback', binding: { key: 'j' } },
  { action: 'video.pause', label: 'Pause', category: 'Video Playback', binding: { key: 'k' } },
  { action: 'video.goToStart', label: 'Go to start', category: 'Video Playback', binding: { key: 'home' } },
  { action: 'video.goToEnd', label: 'Go to end', category: 'Video Playback', binding: { key: 'end' } },
  { action: 'video.toggleMute', label: 'Toggle mute', category: 'Video Playback', binding: { key: 'm' } },
  { action: 'video.toggleFullscreen', label: 'Toggle fullscreen', category: 'Video Playback', binding: { key: 'f' } },
  { action: 'video.toggleLoop', label: 'Toggle loop', category: 'Video Playback', binding: { key: 'l', shift: true } },
  // In/Out points
  { action: 'inout.setIn', label: 'Set In point', category: 'In/Out Points', binding: { key: 'i' } },
  { action: 'inout.setOut', label: 'Set Out point', category: 'In/Out Points', binding: { key: 'o' } },
  { action: 'inout.jumpToIn', label: 'Jump to In point', category: 'In/Out Points', binding: { key: '[' } },
  { action: 'inout.jumpToOut', label: 'Jump to Out point', category: 'In/Out Points', binding: { key: ']' } },
  // Editing
  { action: 'edit.undo', label: 'Undo', category: 'Editing', binding: { key: 'z', ctrl: true } },
  { action: 'edit.redo', label: 'Redo', category: 'Editing', binding: { key: 'y', ctrl: true } },
  { action: 'edit.selectAll', label: 'Select all', category: 'Editing', binding: { key: 'a', ctrl: true } },
  { action: 'edit.delete', label: 'Delete selected', category: 'Editing', binding: { key: 'delete' } },
  { action: 'edit.deselect', label: 'Deselect / Select tool', category: 'Editing', binding: { key: 'escape' } },
  // Colors
  { action: 'color.1', label: 'Red', category: 'Colors', binding: { key: '1' } },
  { action: 'color.2', label: 'Green', category: 'Colors', binding: { key: '2' } },
  { action: 'color.3', label: 'Blue', category: 'Colors', binding: { key: '3' } },
  { action: 'color.4', label: 'Yellow', category: 'Colors', binding: { key: '4' } },
  { action: 'color.5', label: 'Magenta', category: 'Colors', binding: { key: '5' } },
  { action: 'color.6', label: 'Cyan', category: 'Colors', binding: { key: '6' } },
  { action: 'color.7', label: 'White', category: 'Colors', binding: { key: '7' } },
  { action: 'color.8', label: 'Black', category: 'Colors', binding: { key: '8' } },
  { action: 'color.9', label: 'Orange', category: 'Colors', binding: { key: '9' } },
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
    }
  )
)
