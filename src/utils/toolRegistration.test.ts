import { describe, it, expect } from 'vitest'
import { ANNOTATION_TOOL_TYPE, IMPLEMENTED_DRAW_TOOLS } from './toolRegistration'
import { TOOL_DEFAULTS } from './annotationDefaults'
import { STAY_TOOL_TYPES } from './stayPreset'
import { revealKind } from '@/export/reveal'
import { TOOL_ACTION_MAP } from '@/hooks/useKeyboardShortcuts'
import { DEFAULT_SHORTCUTS } from '@/stores/shortcutsStore'

const REVEAL_KINDS = ['stroke', 'arrow', 'ring', 'callout', 'none']

describe.each(IMPLEMENTED_DRAW_TOOLS)('%s is fully registered', (tool) => {
  const annotationTypes = [tool, ...(ANNOTATION_TOOL_TYPE[tool] ? [ANNOTATION_TOOL_TYPE[tool] as string] : [])]

  it.each(annotationTypes)('%s has defaults, a reveal kind and the Stays chip', (type) => {
    expect(TOOL_DEFAULTS[type]).toBeDefined()
    expect(REVEAL_KINDS).toContain(revealKind(type))
    expect(STAY_TOOL_TYPES.has(type)).toBe(true)
  })

  it('has a default shortcut', () => {
    const actions = Object.entries(TOOL_ACTION_MAP).filter(([, t]) => t === tool).map(([action]) => action)
    expect(actions).toHaveLength(1)
    expect(DEFAULT_SHORTCUTS.some((s) => s.action === actions[0])).toBe(true)
  })
})
