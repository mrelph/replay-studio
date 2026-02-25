import { useEffect } from 'react'
import { useThemeStore } from '../stores/themeStore'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { theme, resolvedTheme } = useThemeStore()

  useEffect(() => {
    const resolved = resolvedTheme()
    document.documentElement.setAttribute('data-theme', resolved)
  }, [theme, resolvedTheme])

  // Listen for system preference changes
  useEffect(() => {
    if (theme !== 'system') return

    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => {
      const resolved = mq.matches ? 'dark' : 'light'
      document.documentElement.setAttribute('data-theme', resolved)
    }

    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  return <>{children}</>
}
