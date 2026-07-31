'use client'

import { useState } from 'react'
import { IconSun, IconMoon } from '../Icons'
import { apiFetch } from '../../lib/api'
import { useTheme } from '../../lib/appearance/theme'
import { useAccentColor, AccentColor, ACCENT_SWATCHES } from '../../lib/appearance/accentColor'

export interface ThemeListing {
  addonKey: string
  name: string
  description: string | null
  price: number | null
  priceNote: string | null
  enabled: boolean
  requested: boolean
  themeConfig: { mode: 'light' | 'dark'; accentColor: AccentColor; primaryColor: string } | null
}

function priceLabel(t: ThemeListing): string {
  if (t.price == null) return 'Free'
  return `$${t.price}${t.priceNote ? ` ${t.priceNote}` : ''}`
}

/** One theme's live preview swatch, built from its own themeConfig — no
 * reliance on a manually-uploaded screenshot staying in sync with reality. */
function ThemeSwatch({ config }: { config: ThemeListing['themeConfig'] }) {
  if (!config) return null
  const accent = ACCENT_SWATCHES.find(a => a.id === config.accentColor)
  return (
    <div className={`w-full h-16 rounded-lg bg-gradient-to-br ${accent?.gradient ?? ''} flex items-end justify-start p-2 ${config.mode === 'light' ? 'ring-1 ring-inset ring-white/30' : ''}`}>
      <span className="w-4 h-4 rounded-full border-2 border-white/80 shadow" style={{ backgroundColor: config.primaryColor }} />
    </div>
  )
}

function ThemeCard({ theme, onChanged }: { theme: ThemeListing; onChanged: (updated: ThemeListing) => void }) {
  const { setTheme } = useTheme()
  const { setAccentColor } = useAccentColor()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [applied, setApplied] = useState(false)

  function applyLocally() {
    if (!theme.themeConfig) return
    setTheme(theme.themeConfig.mode)
    setAccentColor(theme.themeConfig.accentColor)
    setApplied(true)
    setTimeout(() => setApplied(false), 2000)
    // Fire-and-forget — the school's public site color is shared, not personal,
    // so this succeeding or not doesn't block the personal dashboard change above.
    apiFetch('/api/site-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ primaryColor: theme.themeConfig.primaryColor }),
    }).catch(() => { /* best-effort */ })
  }

  async function getFree() {
    setBusy(true)
    setError('')
    try {
      const res = await apiFetch(`/api/school-addons/${theme.addonKey}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`)
      onChanged({ ...theme, enabled: true })
      applyLocally()
    } catch (e: any) {
      setError(e.message || 'Failed to get theme')
    } finally {
      setBusy(false)
    }
  }

  async function request() {
    setBusy(true)
    setError('')
    try {
      const res = await apiFetch(`/api/school-addons/${theme.addonKey}/request`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`)
      onChanged({ ...theme, requested: true })
    } catch (e: any) {
      setError(e.message || 'Failed to request')
    } finally {
      setBusy(false)
    }
  }

  async function cancelRequest() {
    setBusy(true)
    setError('')
    try {
      const res = await apiFetch(`/api/school-addons/${theme.addonKey}/request`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`)
      onChanged({ ...theme, requested: false })
    } catch (e: any) {
      setError(e.message || 'Failed to cancel')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card p-4 space-y-3">
      <ThemeSwatch config={theme.themeConfig} />
      <div>
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-sm text-slate-800 dark:text-slate-100">{theme.name}</span>
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{priceLabel(theme)}</span>
        </div>
        {theme.description && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{theme.description}</p>}
      </div>

      {theme.enabled ? (
        <button onClick={applyLocally} disabled={!theme.themeConfig} className="btn-outline btn-sm w-full">
          {applied ? 'Applied ✓' : 'Apply'}
        </button>
      ) : theme.price == null ? (
        <button onClick={getFree} disabled={busy} className="btn-primary btn-sm w-full disabled:opacity-50">
          {busy ? 'Getting…' : 'Get this theme'}
        </button>
      ) : theme.requested ? (
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-semibold px-2 py-1 rounded-full border bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900">Requested</span>
          <button onClick={cancelRequest} disabled={busy} className="text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50">
            {busy ? '…' : 'Cancel'}
          </button>
        </div>
      ) : (
        <button onClick={request} disabled={busy} className="btn-primary btn-sm w-full disabled:opacity-50">
          {busy ? 'Requesting…' : 'Request this theme'}
        </button>
      )}
      {error && <span className="text-[11px] text-red-600 dark:text-red-400">{error}</span>}
    </div>
  )
}

export default function AppearanceTab({ themes, onThemeChanged }: { themes: ThemeListing[]; onThemeChanged: (updated: ThemeListing) => void }) {
  const { theme, setTheme } = useTheme()
  const { accentColor, setAccentColor } = useAccentColor()

  const options: { id: 'light' | 'dark'; label: string; icon: React.ReactNode }[] = [
    { id: 'light', label: 'Light', icon: <IconSun size={22} /> },
    { id: 'dark', label: 'Dark', icon: <IconMoon size={22} /> },
  ]

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <div>
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Dashboard theme</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            This only changes how your own dashboard looks on this device — other staff at your school pick their own,
            and it's separate from your school's public website branding (under Appearance in the sidebar).
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3 max-w-lg">
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
        <div className="grid grid-cols-5 gap-3 mt-3 max-w-lg">
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

      {themes.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Themes</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            A theme is a ready-made combination of the controls above, plus your school's public website color. Getting or
            requesting one just unlocks it — click Apply on any theme you have to actually switch to it (and Apply again
            anytime you want to switch back).
          </p>
          <div className="grid sm:grid-cols-3 gap-3 mt-3">
            {themes.map(t => <ThemeCard key={t.addonKey} theme={t} onChanged={onThemeChanged} />)}
          </div>
        </div>
      )}
    </div>
  )
}
