import { apiFetch } from '../../api'

/** Sends the original ZIP to the backend, where package extraction, path
 * checks, asset allowlisting, and CSS validation form the trust boundary. */
export async function uploadThemePackage(addonId: string, file: File): Promise<any> {
  const body = new FormData()
  body.append('file', file)
  const res = await apiFetch(`/api/platform/theme-packages/${addonId}/zip`, {
    method: 'POST',
    body,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`)
  return data
}
