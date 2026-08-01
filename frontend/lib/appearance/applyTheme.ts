import { radiusPreset, ThemeRadius } from './themeRadius'
import { ThemeFont } from './themeFonts'

// Shared mechanism (Phase 19) for applying a theme's visual knobs to the
// current device — used by both the Appearance tab's theme cards and its
// individual color/font/radius pickers, so there's exactly one place that
// knows how to turn theme values into CSS variables + persisted state.
// Mirrors the personal/per-device model already established by
// lib/appearance/theme.tsx and accentColor.tsx: this changes what THIS
// device sees immediately, not a school-wide default (see AppearanceTab's
// own copy for that distinction). The public site's equivalent is
// server-side, from SiteSettings — see app/page.tsx.

export interface ThemeVars {
  primaryColor?: string
  secondaryColor?: string
  font?: ThemeFont
  radius?: ThemeRadius
}

const STORAGE_KEY = 'themeVars'

export function applyThemeVars(vars: ThemeVars) {
  if (typeof document === 'undefined') return
  const root = document.documentElement.style
  const { radiusCard, radiusBtn } = radiusPreset(vars.radius)

  if (vars.primaryColor) root.setProperty('--brand-600', vars.primaryColor)
  if (vars.secondaryColor) root.setProperty('--brand-secondary-600', vars.secondaryColor)
  if (vars.font) root.setProperty('--font-theme', `var(--font-${vars.font})`)
  if (vars.radius) {
    root.setProperty('--radius-card', radiusCard)
    root.setProperty('--radius-btn', radiusBtn)
  }

  try {
    const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...existing,
      ...(vars.primaryColor ? { primaryColor: vars.primaryColor } : {}),
      ...(vars.secondaryColor ? { secondaryColor: vars.secondaryColor } : {}),
      ...(vars.font ? { font: vars.font } : {}),
      ...(vars.radius ? { radiusCard, radiusBtn } : {}),
    }))
  } catch {
    // localStorage unavailable (private browsing, etc.) — CSS vars above
    // still applied for this page view, just won't persist across reloads.
  }
}

export function loadStoredThemeVars(): (ThemeVars & { radiusCard?: string; radiusBtn?: string }) | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}
