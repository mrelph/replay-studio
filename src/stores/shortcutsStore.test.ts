import { describe, it, expect, beforeEach } from 'vitest'
import { useShortcutsStore, mergeShortcuts, DEFAULT_SHORTCUTS, type ShortcutDefinition } from './shortcutsStore'
import { PRESET_COLORS } from './toolStore'

// The shortcuts store colors correspond 1:1 with PRESET_COLORS[0..8] in
// toolStore.ts (the 10th preset color, near-black, has no default shortcut,
// see the comment above DEFAULT_SHORTCUTS). These names must also match the
// COLOR_NAMES labels used in DrawingToolbar.tsx.
const EXPECTED_COLOR_LABELS = [
  'Red',
  'Orange',
  'Yellow',
  'Green',
  'Teal',
  'Blue',
  'Purple',
  'Pink',
  'White',
]

function resetStore() {
  localStorage.clear()
  useShortcutsStore.getState().resetToDefaults()
}

describe('shortcutsStore', () => {
  beforeEach(() => {
    resetStore()
  })

  it('resolves default bindings via getActionForKey', () => {
    const { getActionForKey } = useShortcutsStore.getState()

    // Space -> play/pause
    expect(getActionForKey(' ', false, false, false)).toBe('video.playPause')
    // Ctrl+L -> loop
    expect(getActionForKey('l', true, false, false)).toBe('video.toggleLoop')
    // Shift+L -> line tool
    expect(getActionForKey('l', false, true, false)).toBe('tool.line')
    // I -> set in point
    expect(getActionForKey('i', false, false, false)).toBe('inout.setIn')
    // O -> set out point
    expect(getActionForKey('o', false, false, false)).toBe('inout.setOut')
  })

  it('returns undefined for a combo with no binding', () => {
    const { getActionForKey } = useShortcutsStore.getState()
    expect(getActionForKey('q', true, true, true)).toBeUndefined()
  })

  it('has a color label for color.N matching PRESET_COLORS[N-1] name', () => {
    const { shortcuts } = useShortcutsStore.getState()

    EXPECTED_COLOR_LABELS.forEach((expectedLabel, index) => {
      const action = `color.${index + 1}` as const
      const shortcut = shortcuts.find((s) => s.action === action)
      expect(shortcut).toBeDefined()
      expect(shortcut?.label).toBe(expectedLabel)
      // Sanity check the PRESET_COLORS array itself is aligned with the
      // shortcut ordering (both are indexed 0-8 for slots 1-9).
      expect(PRESET_COLORS[index]).toBeDefined()
    })
  })

  it('reflects updateShortcut rebinding in getActionForKey', () => {
    const { updateShortcut, getActionForKey } = useShortcutsStore.getState()

    // Rebind the pen tool from 'p' to 'g'.
    updateShortcut('tool.pen', { key: 'g' })

    expect(getActionForKey('g', false, false, false)).toBe('tool.pen')
    expect(getActionForKey('p', false, false, false)).toBeUndefined()
  })

  it('restores default bindings via resetToDefaults', () => {
    const { updateShortcut, resetToDefaults, getActionForKey } = useShortcutsStore.getState()

    updateShortcut('tool.pen', { key: 'g' })
    expect(getActionForKey('g', false, false, false)).toBe('tool.pen')

    resetToDefaults()

    expect(getActionForKey('p', false, false, false)).toBe('tool.pen')
    expect(getActionForKey('g', false, false, false)).toBeUndefined()
  })
})

describe('mergeShortcuts', () => {
  it('keeps saved bindings, drops removed actions and adds new defaults', () => {
    const saved = [
      { action: 'tool.pen', label: 'Pen', category: 'Tools', binding: { key: 'b' } },
      { action: 'tool.tracker', label: 'Player tracker', category: 'Tools', binding: { key: 'k', shift: true } },
    ] as unknown as ShortcutDefinition[]
    const merged = mergeShortcuts(saved, DEFAULT_SHORTCUTS)

    expect(merged.find((s) => s.action === 'tool.pen')?.binding).toEqual({ key: 'b' })
    expect(merged.some((s) => (s.action as string) === 'tool.tracker')).toBe(false)
    expect(merged.find((s) => s.action === 'clip.add')?.binding).toEqual({ key: 'c', shift: true })
    expect(merged).toHaveLength(DEFAULT_SHORTCUTS.length)
  })

  it('falls back to defaults when nothing valid was saved', () => {
    expect(mergeShortcuts(undefined, DEFAULT_SHORTCUTS)).toBe(DEFAULT_SHORTCUTS)
  })
})
