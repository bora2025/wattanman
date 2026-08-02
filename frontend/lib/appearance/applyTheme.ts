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
  /** Phase 20 — a platform-admin-uploaded theme package's stylesheet
   * (already self-contained: assets inlined as data URIs, sanitized
   * server-side). Unlike the vars above, this can't be a CSS custom
   * property — it's arbitrary CSS rules, not a single value — so it's
   * managed as its own <style> tag instead (see setCustomCssTag below). */
  customCss?: string
}

const STORAGE_KEY = 'themeVars'
const CUSTOM_CSS_STYLE_ID = 'theme-custom-css'

function setCustomCssTag(css: string) {
  let tag = document.getElementById(CUSTOM_CSS_STYLE_ID) as HTMLStyleElement | null
  if (!css) {
    tag?.remove()
    return
  }
  if (!tag) {
    tag = document.createElement('style')
    tag.id = CUSTOM_CSS_STYLE_ID
    document.head.appendChild(tag)
  }
  tag.textContent = css
}

/** `persist: false` (Phase 21 — live theme Preview) applies the CSS
 * variables/style tag exactly as normal but skips the localStorage write,
 * so it's a session-only, in-memory look — a page reload/navigation reverts
 * to whatever was actually saved. Defaults to `true`, so every pre-existing
 * call site (Apply, the individual color/font/radius pickers) is
 * unaffected. */
export function applyThemeVars(vars: ThemeVars, options?: { persist?: boolean }) {
  if (typeof document === 'undefined') return
  const persist = options?.persist ?? true
  const root = document.documentElement.style
  const { radiusCard, radiusBtn } = radiusPreset(vars.radius)

  if (vars.primaryColor) root.setProperty('--brand-600', vars.primaryColor)
  if (vars.secondaryColor) root.setProperty('--brand-secondary-600', vars.secondaryColor)
  if (vars.font) root.setProperty('--font-theme', `var(--font-${vars.font})`)
  if (vars.radius) {
    root.setProperty('--radius-card', radiusCard)
    root.setProperty('--radius-btn', radiusBtn)
  }
  if (vars.customCss !== undefined) setCustomCssTag(vars.customCss)

  if (!persist) return

  try {
    const existing = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...existing,
      ...(vars.primaryColor ? { primaryColor: vars.primaryColor } : {}),
      ...(vars.secondaryColor ? { secondaryColor: vars.secondaryColor } : {}),
      ...(vars.font ? { font: vars.font } : {}),
      ...(vars.radius ? { radius: vars.radius, radiusCard, radiusBtn } : {}),
      ...(vars.customCss !== undefined ? { customCss: vars.customCss } : {}),
    }))
  } catch {
    // localStorage unavailable (private browsing, etc.) — CSS vars above
    // still applied for this page view, just won't persist across reloads.
  }
}

/** Re-applies whatever customCss was last stored — called on mount by
 * ThemeProvider so it survives a fresh page load/navigation, since (unlike
 * --brand-600 etc.) it can't be re-applied by the blocking anti-flash
 * <script> in layout.tsx — arbitrary CSS text doesn't belong in a
 * paint-blocking inline script the way a handful of CSS variable
 * assignments do. A brief flash of un-customized styling on first paint is
 * an accepted tradeoff here. */
export function applyStoredCustomCss() {
  if (typeof document === 'undefined') return
  const stored = loadStoredThemeVars()
  if (stored?.customCss) setCustomCssTag(stored.customCss)
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

// True defaults (Phase 19's :root values in app/styles.css) — used by
// restoreThemeSnapshot() below so "Revert" after a Preview is always a
// complete, correct reset, even for a school that never customized
// anything before (an empty/partial snapshot must still fully clear
// whatever the preview applied, not just leave gaps).
const DEFAULT_PRIMARY = '#4f46e5'
const DEFAULT_SECONDARY = '#0284c7'
const DEFAULT_FONT: ThemeFont = 'inter'

export type ThemeSnapshot = ThemeVars & { radiusCard?: string; radiusBtn?: string }

/** Captures exactly what's currently stored, before a Preview starts —
 * Preview mode (Phase 21) needs something concrete to restore to on
 * Revert, not just "whatever happens to still be in memory." */
export function snapshotCurrentThemeVars(): ThemeSnapshot {
  return loadStoredThemeVars() || {}
}

/** Re-applies a previously captured snapshot — always sets every property
 * (falling back to the real defaults, not skipping), so Revert is a
 * complete reset regardless of what was or wasn't customized before. Does
 * NOT persist to localStorage — a revert to a state that came FROM
 * localStorage doesn't need to re-write it. */
export function restoreThemeSnapshot(snapshot: ThemeSnapshot) {
  if (typeof document === 'undefined') return
  const root = document.documentElement.style
  const { radiusCard, radiusBtn } = radiusPreset(snapshot.radius)
  root.setProperty('--brand-600', snapshot.primaryColor || DEFAULT_PRIMARY)
  root.setProperty('--brand-secondary-600', snapshot.secondaryColor || DEFAULT_SECONDARY)
  root.setProperty('--font-theme', `var(--font-${snapshot.font || DEFAULT_FONT})`)
  root.setProperty('--radius-card', snapshot.radiusCard || radiusCard)
  root.setProperty('--radius-btn', snapshot.radiusBtn || radiusBtn)
  setCustomCssTag(snapshot.customCss || '')
}
