// Curated theme font list (Phase 19) — next/font/google is a build-time API,
// so this is necessarily a fixed set decided at build time, not an arbitrary
// Google Font lookup. Keep in sync with the fonts imported in app/layout.tsx.
// `id` is what gets stored in a theme's config and resolves to `--font-{id}`
// (matching the CSS variable name each font is registered under in
// layout.tsx), consumed by the `--font-theme` indirection in
// tailwind.config.js's fontFamily.sans.

export type ThemeFont = 'inter' | 'poppins' | 'nunito' | 'manrope' | 'roboto'

export const THEME_FONTS: { id: ThemeFont; label: string; previewStyle: string }[] = [
  { id: 'inter', label: 'Inter (Default)', previewStyle: 'font-family: var(--font-inter), sans-serif' },
  { id: 'poppins', label: 'Poppins', previewStyle: 'font-family: var(--font-poppins), sans-serif' },
  { id: 'nunito', label: 'Nunito', previewStyle: 'font-family: var(--font-nunito), sans-serif' },
  { id: 'manrope', label: 'Manrope', previewStyle: 'font-family: var(--font-manrope), sans-serif' },
  { id: 'roboto', label: 'Roboto', previewStyle: 'font-family: var(--font-roboto), sans-serif' },
]

export const VALID_THEME_FONTS: ThemeFont[] = THEME_FONTS.map((f) => f.id)
