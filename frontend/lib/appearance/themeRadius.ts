// Curated corner-roundness presets (Phase 19) — maps to the existing
// --radius-card/--radius-btn CSS variables (app/styles.css), which every
// themeable card/button already reads from.

export type ThemeRadius = 'sharp' | 'soft' | 'round'

export const THEME_RADIUS_PRESETS: { id: ThemeRadius; label: string; radiusCard: string; radiusBtn: string }[] = [
  { id: 'sharp', label: 'Sharp', radiusCard: '8px', radiusBtn: '6px' },
  { id: 'soft', label: 'Soft (Default)', radiusCard: '16px', radiusBtn: '12px' },
  { id: 'round', label: 'Round', radiusCard: '24px', radiusBtn: '20px' },
]

export const VALID_THEME_RADII: ThemeRadius[] = THEME_RADIUS_PRESETS.map((r) => r.id)

export function radiusPreset(id: string | undefined): { radiusCard: string; radiusBtn: string } {
  return THEME_RADIUS_PRESETS.find((r) => r.id === id) || THEME_RADIUS_PRESETS[1]
}
