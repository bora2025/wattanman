'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { applyStoredCustomCss } from './applyTheme'

type Theme = 'light' | 'dark'

interface ThemeContextValue {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  setTheme: () => {},
  toggleTheme: () => {},
})

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Default is 'light', not the OS's prefers-color-scheme — nobody should see
  // an unrequested dark UI; they opt in via the toggle. The inline script in
  // layout.tsx's <head> applies a saved preference before first paint so
  // there's no flash; this just keeps React's state in sync with that.
  const [theme, setThemeState] = useState<Theme>('light')

  useEffect(() => {
    const saved = localStorage.getItem('theme') as Theme | null
    if (saved === 'light' || saved === 'dark') {
      setThemeState(saved)
    }
    // A platform-admin theme package's CSS (Phase 20) — see applyTheme.ts
    // for why this can't live in layout.tsx's blocking anti-flash script
    // the way --brand-600 etc. do.
    applyStoredCustomCss()
  }, [])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  const setTheme = (t: Theme) => {
    setThemeState(t)
    localStorage.setItem('theme', t)
  }

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark')

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}
