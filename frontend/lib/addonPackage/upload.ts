import { apiFetch } from '../api'

/** Sends the already-extracted screenshot/README to the dedicated
 * addon-packages endpoint, which validates size and merges them into the
 * listing's screenshotUrl/detailDescription columns. */
export async function uploadAddonPackage(addonId: string, data: { screenshotUrl?: string; detailDescription?: string }): Promise<any> {
  const res = await apiFetch(`/api/platform/addon-packages/${addonId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.message || `HTTP ${res.status}`)
  return json
}
