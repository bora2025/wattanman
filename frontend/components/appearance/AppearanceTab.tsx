'use client'

import { useState } from 'react'
import { IconSun, IconMoon } from '../Icons'
import { apiFetch } from '../../lib/api'
import { useTheme } from '../../lib/appearance/theme'
import { applyThemeVars, loadStoredThemeVars, ThemeVars } from '../../lib/appearance/applyTheme'
import { THEME_FONTS, ThemeFont } from '../../lib/appearance/themeFonts'
import { THEME_RADIUS_PRESETS, ThemeRadius } from '../../lib/appearance/themeRadius'

export interface ThemeListing {
  addonKey: string
  name: string
  description: string | null
  price: number | null
  priceNote: string | null
  enabled: boolean
  requested: boolean
  themeConfig: { mode: 'light' | 'dark'; primaryColor: string; secondaryColor: string; font: ThemeFont; radius: ThemeRadius } | null
}

const DEFAULT_VARS: Required<ThemeVars> = { primaryColor: '#4f46e5', secondaryColor: '#0284c7', font: 'inter', radius: 'soft' }

function priceLabel(t: ThemeListing): string {
  if (t.price == null) return 'Free'
  return `$${t.price}${t.priceNote ? ` ${t.priceNote}` : ''}`
}

/** One theme's live preview swatch, built from its own themeConfig — no
 * reliance on a manually-uploaded screenshot staying in sync with reality. */
function ThemeSwatch({ config }: { config: ThemeListing['themeConfig'] }) {
  if (!config) return null
  return (
    <div
      className={`w-full h-16 rounded-lg flex items-end justify-start p-2 ${config.mode === 'light' ? 'ring-1 ring-inset ring-white/30' : ''}`}
      style={{ background: `linear-gradient(135deg, ${config.primaryColor}, ${config.secondaryColor})`, fontFamily: `var(--font-${config.font}, inherit)` }}
    >
      <span className="w-4 h-4 rounded-full border-2 border-white/80 shadow" style={{ backgroundColor: config.secondaryColor }} />
    </div>
  )
}

function ThemeCard({ theme, onChanged }: { theme: ThemeListing; onChanged: (updated: ThemeListing) => void }) {
  const { setTheme } = useTheme()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [applied, setApplied] = useState(false)

  function applyLocally() {
    if (!theme.themeConfig) return
    const c = theme.themeConfig
    setTheme(c.mode)
    applyThemeVars({ primaryColor: c.primaryColor, secondaryColor: c.secondaryColor, font: c.font, radius: c.radius })
    setApplied(true)
    setTimeout(() => setApplied(false), 2000)
    // Fire-and-forget — the school's public site is shared, not personal, so
    // this succeeding or not doesn't block the personal dashboard change above.
    apiFetch('/api/site-settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ primaryColor: c.primaryColor, secondaryColor: c.secondaryColor, font: c.font, radius: c.radius }),
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
  const [vars, setVars] = useState<Required<ThemeVars>>(() => ({ ...DEFAULT_VARS, ...loadStoredThemeVars() }))

  const options: { id: 'light' | 'dark'; label: string; icon: React.ReactNode }[] = [
    { id: 'light', label: 'Light', icon: <IconSun size={22} /> },
    { id: 'dark', label: 'Dark', icon: <IconMoon size={22} /> },
  ]

  function updateVar(patch: Partial<ThemeVars>) {
    const next = { ...vars, ...patch }
    setVars(next)
    applyThemeVars(patch)
  }

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
                  ? 'border-brand-400 dark:border-brand-500 ring-2 ring-brand-100 dark:ring-brand-900/40'
                  : 'hover:border-brand-200 dark:hover:border-slate-600'
              }`}
            >
              <span className="text-slate-700 dark:text-slate-200">{o.icon}</span>
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{o.label}</span>
              {theme === o.id && <span className="text-[11px] font-semibold text-brand-600 dark:text-brand-400">Active</span>}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Colors, font &amp; shape</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Recolors your sidebar and the dashboard's buttons, badges and inputs on this device — pick a theme below for a
          ready-made combination, or set these individually.
        </p>
        <div className="grid sm:grid-cols-2 gap-3 mt-3 max-w-lg">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Primary color</label>
            <div className="flex items-center gap-2">
              <input type="color" value={vars.primaryColor} onChange={e => updateVar({ primaryColor: e.target.value })} className="w-9 h-9 rounded cursor-pointer border border-slate-200 dark:border-slate-700" />
              <input type="text" value={vars.primaryColor} onChange={e => updateVar({ primaryColor: e.target.value })} className="w-24 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Secondary color</label>
            <div className="flex items-center gap-2">
              <input type="color" value={vars.secondaryColor} onChange={e => updateVar({ secondaryColor: e.target.value })} className="w-9 h-9 rounded cursor-pointer border border-slate-200 dark:border-slate-700" />
              <input type="text" value={vars.secondaryColor} onChange={e => updateVar({ secondaryColor: e.target.value })} className="w-24 text-sm" />
            </div>
          </div>
        </div>
        <div className="mt-3 max-w-lg">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Font</label>
          <div className="flex gap-2 flex-wrap">
            {THEME_FONTS.map(f => (
              <button key={f.id} onClick={() => updateVar({ font: f.id })} style={{ fontFamily: f.previewStyle.replace('font-family: ', '').replace(/;$/, '') }}
                className={`text-sm px-3 py-1.5 rounded-lg border font-medium ${vars.font === f.id ? 'bg-slate-700 text-white border-slate-700' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-3 max-w-lg">
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Corner roundness</label>
          <div className="flex gap-2">
            {THEME_RADIUS_PRESETS.map(r => (
              <button key={r.id} onClick={() => updateVar({ radius: r.id })}
                className={`text-sm px-3 py-1.5 border font-medium ${vars.radius === r.id ? 'bg-slate-700 text-white border-slate-700' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}
                style={{ borderRadius: r.radiusBtn }}>
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {themes.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Themes</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            A theme is a ready-made combination of the controls above, plus your school's public website. Getting or
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
