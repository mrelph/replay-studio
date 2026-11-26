import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useThemeStore, THEME_OPTIONS, getEffectiveTheme, isDarkTheme, type ThemeMode } from './themeStore'

const NEW_THEMES = ['broadcast', 'pitch', 'ice', 'court'] as const

describe('themeStore', () => {
  beforeEach(() => {
    localStorage.clear()
    useThemeStore.setState({ theme: 'dark' })
  })

  it('lists the seven themes in picker order', () => {
    expect(THEME_OPTIONS.map((o) => o.id)).toEqual(['dark', 'light', 'system', ...NEW_THEMES])
  })

  it('accepts every theme id in setTheme', () => {
    for (const { id } of THEME_OPTIONS) {
      useThemeStore.getState().setTheme(id)
      expect(useThemeStore.getState().theme).toBe(id)
    }
  })

  it('resolves the four new themes to their own id', () => {
    for (const id of NEW_THEMES) {
      expect(getEffectiveTheme(id)).toBe(id)
      useThemeStore.getState().setTheme(id)
      expect(useThemeStore.getState().resolvedTheme()).toBe(id)
    }
  })

  it('resolves system to dark or light from the OS preference', () => {
    const matchMedia = vi.fn().mockReturnValue({ matches: false })
    vi.stubGlobal('matchMedia', matchMedia)
    expect(getEffectiveTheme('system')).toBe('light')
    matchMedia.mockReturnValue({ matches: true })
    expect(getEffectiveTheme('system')).toBe('dark')
    vi.unstubAllGlobals()
  })

  it('isDarkTheme is false only for light and ice', () => {
    const results = Object.fromEntries(
      (['dark', 'light', ...NEW_THEMES] as const).map((id) => [id, isDarkTheme(id)])
    )
    expect(results).toEqual({ dark: true, light: false, broadcast: true, pitch: true, ice: false, court: true })
  })

  it('falls back to dark for an unknown persisted value', async () => {
    useThemeStore.setState({ theme: 'light' })
    localStorage.setItem('replay-studio-theme', JSON.stringify({ state: { theme: 'neon' }, version: 0 }))
    await useThemeStore.persist.rehydrate()
    expect(useThemeStore.getState().theme).toBe('dark')
  })

  it('restores a known persisted value', async () => {
    localStorage.setItem('replay-studio-theme', JSON.stringify({ state: { theme: 'court' }, version: 0 }))
    await useThemeStore.persist.rehydrate()
    expect(useThemeStore.getState().theme).toBe('court')
  })

  it('setTheme ignores an unknown id', () => {
    useThemeStore.getState().setTheme('neon' as ThemeMode)
    expect(useThemeStore.getState().theme).toBe('dark')
  })
})
