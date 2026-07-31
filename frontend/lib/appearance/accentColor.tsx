'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

export type AccentColor = 'indigo' | 'emerald' | 'sky' | 'teal' | 'violet' | 'rose' | 'amber' | 'blue' | 'fuchsia' | 'cyan'

interface AccentColorContextValue {
  accentColor: AccentColor
  setAccentColor: (color: AccentColor) => void
}

const VALID_COLORS: AccentColor[] = ['indigo', 'emerald', 'sky', 'teal', 'violet', 'rose', 'amber', 'blue', 'fuchsia', 'cyan']

// Mirrors the gradient values in components/Sidebar.tsx's colorMap — the
// single shared source for anywhere that needs to preview/pick one of the 10
// accent colors (the school-facing AppearanceTab picker and the platform
// admin's THEME catalog editor both use this).
export const ACCENT_SWATCHES: { id: AccentColor; label: string; gradient: string }[] = [
  { id: 'indigo', label: 'Indigo', gradient: 'from-[#1e1b4b] to-[#312e81]' },
  { id: 'emerald', label: 'Emerald', gradient: 'from-[#064e3b] to-[#065f46]' },
  { id: 'sky', label: 'Sky', gradient: 'from-[#0c4a6e] to-[#075985]' },
  { id: 'teal', label: 'Teal', gradient: 'from-[#134e4a] to-[#115e59]' },
  { id: 'violet', label: 'Violet', gradient: 'from-[#4c1d95] to-[#5b21b6]' },
  { id: 'rose', label: 'Rose', gradient: 'from-[#881337] to-[#9f1239]' },
  { id: 'amber', label: 'Amber', gradient: 'from-[#78350f] to-[#92400e]' },
  { id: 'blue', label: 'Blue', gradient: 'from-[#1e3a8a] to-[#1e40af]' },
  { id: 'fuchsia', label: 'Fuchsia', gradient: 'from-[#701a75] to-[#86198f]' },
  { id: 'cyan', label: 'Cyan', gradient: 'from-[#164e63] to-[#155e75]' },
]

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
