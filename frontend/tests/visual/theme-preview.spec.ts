import { expect, test } from '@playwright/test'
import { buildThemePreviewDocument, ThemePreviewMode, ThemePreviewSurface } from '../../lib/themePreviewDocument'

const manifest = { name: 'Aurora Khmer', tokens: { primaryColor: '#14b8a6' } }
const css = `.wattaman-theme .card, .wattaman-theme .stat-card { border-radius: 20px; box-shadow: 0 12px 30px rgba(15, 23, 42, .12); }
.wattaman-theme .btn-primary { background: #14b8a6; color: #042f2e; }
.wattaman-theme.dark .card, .wattaman-theme.dark .stat-card { background: #102a43; }`

for (const surface of ['dashboard', 'public'] as ThemePreviewSurface[]) {
  for (const mode of ['light', 'dark'] as ThemePreviewMode[]) {
    test(`${surface} ${mode} theme preview`, async ({ page }) => {
      await page.setContent(buildThemePreviewDocument(manifest, css, mode, surface), { waitUntil: 'load' })
      await expect(page).toHaveScreenshot(`${surface}-${mode}.png`, { fullPage: true })
    })
  }
}
