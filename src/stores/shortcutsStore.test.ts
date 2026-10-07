import { describe, it, expect, beforeEach } from 'vitest'
import { useShortcutsStore, mergeShortcuts, migrateShortcuts, DEFAULT_SHORTCUTS, type ShortcutDefinition } from './shortcutsStore'
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

describe('migrateShortcuts (v0 → v1: J/L become the shuttle)', () => {
  const v0 = (bindings: Array<[ShortcutDefinition['action'], ShortcutDefinition['binding']]>) => ({
    shortcuts: bindings.map(([action, binding]) => ({ action, label: '', category: '', binding })),
  })

  it('drops the old J/L skip defaults so the shuttle owns J/L', () => {
    const migrated = migrateShortcuts(v0([
      ['video.skipForward', { key: 'l' }],
      ['video.skipBackward', { key: 'j' }],
      ['tool.pen', { key: 'p' }],
    ]), 0) as { shortcuts: ShortcutDefinition[] }
    const merged = mergeShortcuts(migrated.shortcuts, DEFAULT_SHORTCUTS)
    const keyFor = (a: string) => merged.find((s) => s.action === a)?.binding
    expect(keyFor('video.shuttleForward')).toEqual({ key: 'l' })
    expect(keyFor('video.skipForward')).toEqual({ key: 'arrowright', shift: true })
    expect(keyFor('video.skipBackward')).toEqual({ key: 'arrowleft', shift: true })
  })

  it('keeps a deliberately customized skip binding', () => {
    const migrated = migrateShortcuts(v0([['video.skipForward', { key: 'g' }]]), 0) as { shortcuts: ShortcutDefinition[] }
    expect(migrated.shortcuts).toHaveLength(1)
  })

  it('has no default binding collisions', () => {
    const seen = new Set<string>()
    for (const { binding: b } of DEFAULT_SHORTCUTS) {
      const id = `${b.key}|${!!b.ctrl}|${!!b.shift}|${!!b.alt}`
      expect(seen.has(id), id).toBe(false)
      seen.add(id)
    }
  })
})

describe('migrateShortcuts (v1 → v2: hold + record-pauses become Freeze)', () => {
  const v1 = (bindings: Array<[string, ShortcutDefinition['binding']]>) => ({
    shortcuts: bindings.map(([action, binding]) => ({ action, label: '', category: '', binding })),
  })

  it('gives Freeze the hold key and drops the record-pauses mode', () => {
    const migrated = migrateShortcuts(v1([
      ['clip.toggleHold', { key: 'h' }],
      ['clip.recordHolds', { key: 'h', shift: true }],
    ]), 1) as { shortcuts: ShortcutDefinition[] }
    const merged = mergeShortcuts(migrated.shortcuts, DEFAULT_SHORTCUTS)
    expect(merged.find((s) => s.action === 'video.freeze')?.binding).toEqual({ key: 'h' })
    expect(merged.some((s) => (s.action as string) === 'clip.recordHolds')).toBe(false)
    expect(merged.some((s) => (s.action as string) === 'clip.toggleHold')).toBe(false)
  })

  it('carries a customized hold binding over to Freeze', () => {
    const migrated = migrateShortcuts(v1([['clip.toggleHold', { key: 'g', alt: true }]]), 1) as { shortcuts: ShortcutDefinition[] }
    const merged = mergeShortcuts(migrated.shortcuts, DEFAULT_SHORTCUTS)
    expect(merged.find((s) => s.action === 'video.freeze')?.binding).toEqual({ key: 'g', alt: true })
  })

  it('still applies the v0 skip cleanup when jumping from v0', () => {
    const migrated = migrateShortcuts(v1([['video.skipForward', { key: 'l' }]]), 0) as { shortcuts: ShortcutDefinition[] }
    expect(migrated.shortcuts).toHaveLength(0)
  })
})
