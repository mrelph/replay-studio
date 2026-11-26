import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const THEME_OPTIONS = [
  { id: 'dark', label: 'Dark' },
  { id: 'light', label: 'Light' },
  { id: 'system', label: 'System' },
  { id: 'broadcast', label: 'Broadcast Night' },
  { id: 'pitch', label: 'Floodlit Pitch' },
  { id: 'ice', label: 'Arena Ice' },
  { id: 'court', label: 'Courtside' },
] as const

export type ThemeMode = (typeof THEME_OPTIONS)[number]['id']
export type EffectiveTheme = Exclude<ThemeMode, 'system'>

const THEME_IDS: readonly string[] = THEME_OPTIONS.map((option) => option.id)

export function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === 'string' && THEME_IDS.includes(value)
}

export function isDarkTheme(theme: EffectiveTheme): boolean {
  return theme !== 'light' && theme !== 'ice'
}

interface ThemeStore {
  theme: ThemeMode
  setTheme: (theme: ThemeMode) => void
  resolvedTheme: () => EffectiveTheme
}

function getSystemTheme(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function getEffectiveTheme(theme: ThemeMode): EffectiveTheme {
  return theme === 'system' ? getSystemTheme() : theme
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      setTheme: (theme) => set({ theme: isThemeMode(theme) ? theme : 'dark' }),
      resolvedTheme: () => getEffectiveTheme(get().theme),
    }),
    {
      name: 'replay-studio-theme',
      merge: (persisted, current) => {
        const theme = (persisted as { theme?: unknown } | undefined)?.theme
        return { ...current, theme: isThemeMode(theme) ? theme : 'dark' }
      },
    }
  )
)
