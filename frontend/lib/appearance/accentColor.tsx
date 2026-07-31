'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

export type AccentColor = 'indigo' | 'emerald' | 'sky' | 'teal' | 'violet' | 'rose' | 'amber' | 'blue' | 'fuchsia' | 'cyan'

interface AccentColorContextValue {
  accentColor: AccentColor
  setAccentColor: (color: AccentColor) => void
}

const VALID_COLORS: AccentColor[] = ['indigo', 'emerald', 'sky', 'teal', 'violet', 'rose', 'amber', 'blue', 'fuchsia', 'cyan']

const AccentColorContext = createContext<AccentColorContextValue>({
  accentColor: 'indigo',
  setAccentColor: () => {},
})

export function AccentColorProvider({ children }: { children: ReactNode }) {
  // Default matches the admin dashboard's existing hardcoded default (indigo)
  // — anyone who hasn't customized this sees no change at all.
  const [accentColor, setAccentColorState] = useState<AccentColor>('indigo')

  useEffect(() => {
    const saved = localStorage.getItem('accentColor') as AccentColor | null
    if (saved && VALID_COLORS.includes(saved)) {
      setAccentColorState(saved)
    }
  }, [])

  const setAccentColor = (c: AccentColor) => {
    setAccentColorState(c)
    localStorage.setItem('accentColor', c)
  }

  return (
    <AccentColorContext.Provider value={{ accentColor, setAccentColor }}>
      {children}
    </AccentColorContext.Provider>
  )
}

export function useAccentColor() {
  return useContext(AccentColorContext)
}
