import { apiFetch } from '../../api'

/** Sends the already-self-contained CSS produced by parseThemePackageZip()
 * to the dedicated theme-packages endpoint, which validates/sanitizes it
 * and merges it into the theme's themeConfig.customCss. */
export async function uploadThemePackage(addonId: string, css: string): Promise<any> {
  const res = await apiFetch(`/api/platform/theme-packages/${addonId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ css }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`)
  return data
}
