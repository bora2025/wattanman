"use client"

import { useRef, useState } from 'react'
import Sidebar from '../../../components/Sidebar'
import { adminNav } from '../../../lib/admin-nav'
import { apiFetch } from '../../../lib/api'

interface BackupSummary {
  version: number
  exportedAt: string
  models: string[]
  totalRows: number
  perModel: { name: string; rows: number }[]
}

export default function BackupPage() {
  const fileRef = useRef<HTMLInputElement | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [summary, setSummary] = useState<BackupSummary | null>(null)
  const [pendingPayload, setPendingPayload] = useState<any | null>(null)
  const [restoring, setRestoring] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [message, setMessage] = useState('')
  const [msgType, setMsgType] = useState<'success' | 'error'>('success')

  function showMessage(text: string, type: 'success' | 'error' = 'success') {
    setMessage(text)
    setMsgType(type)
    setTimeout(() => setMessage(''), 5000)
  }

  async function handleDownload() {
    setDownloading(true)
    try {
      const res = await apiFetch('/api/backup/export')
      if (!res.ok) {
        showMessage('Failed to export: ' + res.status, 'error')
        return
      }
      const blob = await res.blob()
      // Try to use the filename the server suggested.
      const dispo = res.headers.get('Content-Disposition') || ''
      const m = dispo.match(/filename="([^"]+)"/)
      const filename = m?.[1] || `wattaman-backup-${new Date().toISOString().slice(0, 10)}.json`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
      showMessage('Backup downloaded.')
    } catch (e) {
      showMessage('Error exporting backup', 'error')
    }
    setDownloading(false)
  }

  async function handleFileSelect(f: File | null) {
    setSummary(null)
    setPendingPayload(null)
    setShowConfirm(false)
    setConfirmText('')
    if (!f) return
    if (f.size > 200 * 1024 * 1024) {
      showMessage('Backup file is larger than 200 MB — refusing to load', 'error')
      return
    }
    try {
      const text = await f.text()
      const payload = JSON.parse(text)
      if (!payload || typeof payload !== 'object' || !payload.data || typeof payload.data !== 'object') {
        showMessage('Not a valid backup file (missing "data" object)', 'error')
        return
      }
      const perModel = Object.keys(payload.data).map(name => ({
        name,
        rows: Array.isArray(payload.data[name]) ? payload.data[name].length : 0,
      }))
      const totalRows = perModel.reduce((s, m) => s + m.rows, 0)
      setSummary({
        version: payload.version || 0,
        exportedAt: payload.exportedAt || '—',
        models: payload.models || perModel.map(m => m.name),
        totalRows,
        perModel: perModel.sort((a, b) => b.rows - a.rows),
      })
      setPendingPayload(payload)
    } catch (e) {
      showMessage('Failed to parse backup file: ' + (e as Error).message, 'error')
    }
  }

  async function handleRestore() {
    if (!pendingPayload) return
    setRestoring(true)
    try {
      const res = await apiFetch('/api/backup/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pendingPayload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        showMessage('Restore failed: ' + (data.message || res.status), 'error')
      } else {
        showMessage(`Restore complete — ${data.inserted ?? '?'} rows across ${data.models ?? '?'} models. You may need to log in again.`, 'success')
        setSummary(null)
        setPendingPayload(null)
        setShowConfirm(false)
        setConfirmText('')
        if (fileRef.current) fileRef.current.value = ''
      }
    } catch (e) {
      showMessage('Restore failed: ' + (e as Error).message, 'error')
    }
    setRestoring(false)
  }

  return (
    <div className="page-shell">
      <Sidebar title="Admin Panel" subtitle="Wattanman" navItems={adminNav} accentColor="indigo" />
      <div className="page-content">
        <div className="h-14 lg:hidden" />
        <div className="page-header">
          <h1 className="text-2xl font-bold text-slate-800">Backup & Restore</h1>
          <p className="text-sm text-slate-500 mt-1">
            Export every record in the database to a JSON file, or restore a previous backup
            (e.g. when starting a new project / migrating servers).
          </p>
        </div>

        <div className="page-body space-y-6">
          {message && (
            <div className={`px-4 py-3 rounded-lg text-sm font-medium ${
              msgType === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}>{message}</div>
          )}

          {/* Export */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-1">Download backup</h2>
            <p className="text-sm text-slate-500 mb-4">
              Generates a single JSON file containing every row of every table — users,
              classes, attendance, fees, exams, scores, timetables, card templates, etc.
              Keep this file safe; it contains all sensitive data.
            </p>
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {downloading ? 'Exporting…' : '⬇️ Download backup (.json)'}
            </button>
          </div>

          {/* Restore */}
          <div className="card p-6 border-2 border-red-100">
            <h2 className="text-lg font-semibold text-red-700 mb-1">Restore from backup</h2>
            <p className="text-sm text-slate-600 mb-4">
              <strong className="text-red-700">Destructive.</strong> Loading a backup file
              will <strong>WIPE</strong> all existing data and replace it with the contents
              of the file. Use this on a fresh deployment or when explicitly recovering.
              Active sessions (yours included) will be invalidated.
            </p>

            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              onChange={e => handleFileSelect(e.target.files?.[0] || null)}
              className="text-sm file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-red-50 file:text-red-700 hover:file:bg-red-100 file:cursor-pointer"
            />

            {summary && (
              <div className="mt-4 space-y-3">
                <div className="grid sm:grid-cols-3 gap-3 text-sm">
                  <div className="bg-slate-50 rounded-lg p-3">
                    <div className="text-slate-500 text-xs uppercase tracking-wide">Exported at</div>
                    <div className="text-slate-800 font-medium mt-0.5">
                      {summary.exportedAt !== '—' ? new Date(summary.exportedAt).toLocaleString() : '—'}
                    </div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <div className="text-slate-500 text-xs uppercase tracking-wide">Models</div>
                    <div className="text-slate-800 font-medium mt-0.5">{summary.models.length}</div>
                  </div>
                  <div className="bg-slate-50 rounded-lg p-3">
                    <div className="text-slate-500 text-xs uppercase tracking-wide">Total rows</div>
                    <div className="text-slate-800 font-medium mt-0.5">{summary.totalRows.toLocaleString()}</div>
                  </div>
                </div>

                <details className="bg-slate-50 rounded-lg p-3 text-sm">
                  <summary className="cursor-pointer font-medium text-slate-700">
                    Per-model row counts ({summary.perModel.filter(m => m.rows > 0).length} non-empty)
                  </summary>
                  <ul className="mt-2 grid sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1 text-xs">
                    {summary.perModel.map(m => (
                      <li key={m.name} className="flex justify-between">
                        <span className="text-slate-600">{m.name}</span>
                        <span className={m.rows > 0 ? 'text-slate-800 font-medium' : 'text-slate-400'}>
                          {m.rows.toLocaleString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>

                {!showConfirm ? (
                  <button
                    onClick={() => setShowConfirm(true)}
                    className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
                  >
                    🗑 Wipe & restore
                  </button>
                ) : (
                  <div className="space-y-2 border-t pt-4">
                    <p className="text-sm text-slate-700">
                      Type <code className="bg-red-50 text-red-700 px-1.5 py-0.5 rounded font-mono text-xs">RESTORE</code> to confirm:
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={confirmText}
                        onChange={e => setConfirmText(e.target.value)}
                        className="flex-1"
                        placeholder="RESTORE"
                      />
                      <button
                        onClick={() => { setShowConfirm(false); setConfirmText('') }}
                        className="btn-outline"
                        disabled={restoring}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleRestore}
                        disabled={confirmText !== 'RESTORE' || restoring}
                        className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium"
                      >
                        {restoring ? 'Restoring…' : 'Confirm restore'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Help */}
          <div className="card p-6 bg-slate-50/50">
            <h3 className="text-sm font-semibold text-slate-700 mb-2">How this works</h3>
            <ul className="text-xs text-slate-600 space-y-1.5 list-disc pl-5">
              <li>Export produces a single JSON file. It is the entire database — keep it private.</li>
              <li>Restore uses a Postgres transaction: if anything fails, your data is left untouched.</li>
              <li>FK checks are temporarily disabled during restore so tables can be repopulated in any order.</li>
              <li>After restore, all refresh tokens are wiped (existing logins must re-authenticate).</li>
              <li>Schema changes between versions can break restore; export &amp; restore are intended for the same schema generation.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
