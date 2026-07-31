'use client'

import { IconSun, IconMoon } from '../Icons'
import { useTheme } from '../../lib/appearance/theme'
import { useAccentColor, AccentColor } from '../../lib/appearance/accentColor'

// Mirrors the gradient values in components/Sidebar.tsx's colorMap — kept as
// a small local copy rather than exported shared state, matching this
// codebase's existing per-file-duplication convention for small UI-only
// constants (colorMap itself stays module-private in Sidebar.tsx).
const ACCENT_SWATCHES: { id: AccentColor; label: string; gradient: string }[] = [
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

export default function AppearanceTab() {
  const { theme, setTheme } = useTheme()
  const { accentColor, setAccentColor } = useAccentColor()

  const options: { id: 'light' | 'dark'; label: string; icon: React.ReactNode }[] = [
    { id: 'light', label: 'Light', icon: <IconSun size={22} /> },
    { id: 'dark', label: 'Dark', icon: <IconMoon size={22} /> },
  ]

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <div>
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Dashboard theme</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            This only changes how your own dashboard looks on this device — other staff at your school pick their own,
            and it's separate from your school's public website branding (under Appearance in the sidebar).
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          {options.map(o => (
            <button
              key={o.id}
              onClick={() => setTheme(o.id)}
              className={`card p-5 flex flex-col items-center gap-2 transition-all ${
                theme === o.id
                  ? 'border-indigo-400 dark:border-indigo-500 ring-2 ring-indigo-100 dark:ring-indigo-900/40'
                  : 'hover:border-indigo-200 dark:hover:border-slate-600'
              }`}
            >
              <span className="text-slate-700 dark:text-slate-200">{o.icon}</span>
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{o.label}</span>
              {theme === o.id && <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">Active</span>}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Sidebar accent color</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Recolors your sidebar only — the rest of the dashboard stays the same either way.
        </p>
        <div className="grid grid-cols-5 gap-3 mt-3">
          {ACCENT_SWATCHES.map(s => (
            <button
              key={s.id}
              onClick={() => setAccentColor(s.id)}
              title={s.label}
              aria-label={s.label}
              className={`aspect-square rounded-xl bg-gradient-to-br ${s.gradient} flex items-center justify-center transition-all ${
                accentColor === s.id ? 'ring-2 ring-offset-2 ring-slate-400 dark:ring-offset-slate-900' : 'hover:opacity-80'
              }`}
            >
              {accentColor === s.id && (
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
