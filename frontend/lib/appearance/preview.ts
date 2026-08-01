import { applyThemeVars, restoreThemeSnapshot, snapshotCurrentThemeVars, ThemeSnapshot, ThemeVars } from './applyTheme'

// Live theme Preview (Phase 21) — session-only, in-memory look at a theme
// before committing to it. Separate from applyTheme.ts's core mechanism
// (which this builds on) because this needs its own persisted-but-
// temporary state (the active preview + its pre-preview snapshot) and a
// way for the banner component — already mounted globally, elsewhere on
// the page — to notice a preview just started, which a plain localStorage
// write doesn't do within the same tab (the browser's own `storage` event
// only fires in *other* tabs). A small custom DOM event closes that gap.

export interface ActivePreview {
  themeName: string
  vars: ThemeVars
  snapshot: ThemeSnapshot
}

const PREVIEW_KEY = 'themePreview'
const PREVIEW_EVENT = 'theme-preview-changed'

function notify() {
  window.dispatchEvent(new Event(PREVIEW_EVENT))
}

export function onPreviewChanged(handler: () => void): () => void {
  window.addEventListener(PREVIEW_EVENT, handler)
  return () => window.removeEventListener(PREVIEW_EVENT, handler)
}

export function loadActivePreview(): ActivePreview | null {
  if (typeof localStorage === 'undefined') return null
  try {
    const raw = localStorage.getItem(PREVIEW_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/** Snapshots whatever's currently applied, switches to `vars` live without
 * persisting it, and remembers both — so Keep/Revert always have the right
 * before/after to act on, even across a page navigation while previewing. */
export function startPreview(themeName: string, vars: ThemeVars) {
  const snapshot = snapshotCurrentThemeVars()
  applyThemeVars(vars, { persist: false })
  try {
    localStorage.setItem(PREVIEW_KEY, JSON.stringify({ themeName, vars, snapshot }))
  } catch {
    // localStorage unavailable — the preview still applies for this page
    // view, it just can't survive a navigation or be Kept/Reverted cleanly.
  }
  notify()
}

/** Commits the previewed theme for real (persists it) and ends preview mode. */
export function keepPreview() {
  const active = loadActivePreview()
  if (active) applyThemeVars(active.vars)
  clearPreview()
}

/** Restores exactly what was there before the preview started and ends
 * preview mode. */
export function revertPreview() {
  const active = loadActivePreview()
  if (active) restoreThemeSnapshot(active.snapshot)
  clearPreview()
}

function clearPreview() {
  try {
    localStorage.removeItem(PREVIEW_KEY)
  } catch {
    // ignore
  }
  notify()
}

/** Re-applies the active preview's CSS (without re-persisting) — called on
 * mount by the preview banner so navigating to a new page while previewing
 * keeps showing it, since the CSS variables/style tag themselves don't
 * survive a full page load the way localStorage does. */
export function reapplyActivePreview() {
  const active = loadActivePreview()
  if (active) applyThemeVars(active.vars, { persist: false })
}
