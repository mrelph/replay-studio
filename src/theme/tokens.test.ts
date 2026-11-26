import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'

const css = readFileSync(path.resolve(__dirname, 'tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

/** Custom properties declared by the rule whose selector list includes `[data-theme="<id>"]` on its own. */
function themeTokens(id: string): Set<string> {
  const rule = css.split('}').find((chunk) => {
    const selectors = chunk.split('{')[0].split(',').map((s) => s.trim())
    return selectors.includes(`[data-theme="${id}"]`)
  })
  if (!rule) throw new Error(`no [data-theme="${id}"] block`)
  return new Set([...rule.matchAll(/(--(?:color|chrome)-[\w-]+)\s*:/g)].map((m) => m[1]))
}

describe('tokens.css', () => {
  const darkTokens = themeTokens('dark')

  it('the dark block defines the chrome tokens', () => {
    for (const token of ['--chrome-bg', '--chrome-bg-raised', '--chrome-border', '--chrome-border-strong', '--chrome-text', '--chrome-text-secondary', '--chrome-text-tertiary']) {
      expect(darkTokens.has(token)).toBe(true)
    }
  })

  it.each(['light', 'broadcast', 'pitch', 'ice', 'court'])('the %s block defines every dark token', (id) => {
    const tokens = themeTokens(id)
    expect([...darkTokens].filter((token) => !tokens.has(token))).toEqual([])
  })

  it('chrome and chrome-reset regions set their own text colour', () => {
    for (const selector of ['.chrome', '.chrome-reset']) {
      const rule = css.split('}').find((chunk) => chunk.split('{')[0].trim() === selector)
      expect(rule, selector).toBeDefined()
      expect(rule).toMatch(/(^|[;{\s])color:\s*var\(--color-text-primary\)/)
    }
  })
})
