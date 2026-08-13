"use client"

import { useEffect, useState } from 'react'
import Sidebar from '../../../components/Sidebar'
import { adminNav } from '../../../lib/admin-nav'
import { apiFetch } from '../../../lib/api'
import { useAccentColor } from '../../../lib/appearance/accentColor'

interface BackupExport {
  id: string
  status: 'PENDING' | 'RUNNING' | 'AVAILABLE' | 'FAILED' | 'EXPIRED'
  checksum?: string
  byteSize?: number
  rowCount?: number
  errorMessage?: string
  createdAt: string
  expiresAt?: string
}

interface RestoreRequest {
  id: string
  exportId: string
  status: string
  errorMessage?: string
  createdAt: string
}

export default function BackupPage() {
  const { accentColor } = useAccentColor()
  const [exports, setExports] = useState<BackupExport[]>([])
  const [restores, setRestores] = useState<RestoreRequest[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState(false)

  async function load() {
    const [exportsResponse, restoresResponse] = await Promise.all([
      apiFetch('/api/backup/exports'),
      apiFetch('/api/backup/restores'),
    ])
    if (exportsResponse.ok) setExports(await exportsResponse.json())
    if (restoresResponse.ok) setRestores(await restoresResponse.json())
  }

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(), 5000)
    return () => window.clearInterval(timer)
  }, [])

  function notify(text: string, failed = false) {
    setMessage(text)
    setError(failed)
    window.setTimeout(() => setMessage(''), 5000)
  }

  async function createExport() {
    setBusy(true)
    const response = await apiFetch('/api/backup/exports', { method: 'POST', headers: { 'Idempotency-Key': crypto.randomUUID() } })
    notify(response.ok ? 'Backup export queued.' : 'Unable to queue backup export.', !response.ok)
    await load()
    setBusy(false)
  }

  async function downloadExport(item: BackupExport) {
    const response = await apiFetch(`/api/backup/exports/${item.id}/download`)
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || !payload.download?.url) return notify(payload.message || 'Download is unavailable.', true)
    window.location.assign(payload.download.url)
  }

  async function requestRestore(item: BackupExport) {
    if (!window.confirm('Request restore verification for this export? No live data will change until platform approval.')) return
    const response = await apiFetch('/api/backup/restores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
      body: JSON.stringify({ exportId: item.id }),
    })
    const payload = await response.json().catch(() => ({}))
    notify(response.ok ? 'Restore verification requested.' : payload.message || 'Restore request failed.', !response.ok)
    await load()
  }

  return (
    <div className="page-shell">
      <Sidebar title="Admin Panel" subtitle="Wattanman" navItems={adminNav} accentColor={accentColor} />
      <div className="page-content">
        <div className="h-14 lg:hidden" />
        <div className="page-header">
          <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Backup &amp; Restore</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Create private school exports and submit controlled recovery requests.</p>
        </div>
        <div className="page-body space-y-6">
          {message && <div className={`rounded-lg border px-4 py-3 text-sm font-medium ${error ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{message}</div>}
          <section className="card p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">School exports</h2>
                <p className="text-sm text-slate-500">Background exports are checksummed and stored privately for seven days.</p>
              </div>
              <button onClick={() => void createExport()} disabled={busy} className="bg-brand-600 hover:bg-brand-700 rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? 'Queuing…' : 'Create export'}</button>
            </div>
            <div className="mt-5 space-y-3">
              {exports.map(item => {
                const restore = restores.find(candidate => candidate.exportId === item.id)
                return <div key={item.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-medium text-slate-800 dark:text-slate-100">{new Date(item.createdAt).toLocaleString()} · {item.status}</div>
                      <div className="mt-1 text-xs text-slate-500">{item.rowCount != null ? `${item.rowCount.toLocaleString()} rows · ` : ''}{item.byteSize != null ? `${(item.byteSize / 1024).toFixed(1)} KB · ` : ''}{item.checksum ? `SHA-256 ${item.checksum.slice(0, 16)}…` : item.errorMessage || 'Processing'}</div>
                      {restore && <div className="mt-2 text-xs font-medium text-amber-700">Restore: {restore.status}{restore.errorMessage ? ` · ${restore.errorMessage}` : ''}</div>}
                    </div>
                    {item.status === 'AVAILABLE' && <div className="flex gap-2"><button className="btn-outline" onClick={() => void downloadExport(item)}>Download</button><button className="btn-outline" disabled={!!restore && !['REJECTED', 'FAILED'].includes(restore.status)} onClick={() => void requestRestore(item)}>Request restore</button></div>}
                  </div>
                </div>
              })}
              {exports.length === 0 && <p className="text-sm text-slate-500">No exports created yet.</p>}
            </div>
          </section>
          <section className="card border-2 border-amber-100 p-6 dark:border-amber-900">
            <h2 className="text-lg font-semibold text-amber-800 dark:text-amber-300">Controlled recovery</h2>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-600 dark:text-slate-300">
              <li>The worker validates format, checksum, row limits, allowed models, and tenant ownership without writing live school data.</li>
              <li>A different platform administrator reviews the verification report and records an approval reason.</li>
              <li>Only an approved request can enter the separately audited execution stage.</li>
            </ol>
          </section>
        </div>
      </div>
    </div>
  )
}
