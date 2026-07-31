"use client"

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '../../../components/Sidebar'
import AuthGuard from '../../../components/AuthGuard'
import { platformNav } from '../../../lib/platform-nav'
import { apiFetch } from '../../../lib/api'

interface SchoolMetricRow {
  schoolId: string
  schoolName: string
  schoolSubdomain: string
  requestCount: number
  errorCount: number
  avgDurationMs: number | null
  p95DurationMs: number | null
  activeUserCount: number
  storageBytes: number
  computed: boolean
}

type SortKey = 'schoolName' | 'requestCount' | 'errorCount' | 'avgDurationMs' | 'p95DurationMs' | 'activeUserCount' | 'storageBytes'

function yesterday(): string {
  const d = new Date(Date.now() - 24 * 60 * 60 * 1000)
  return d.toISOString().split('T')[0]
}

function statusFor(row: SchoolMetricRow): { label: string; className: string } {
  if (row.requestCount === 0) return { label: 'Quiet', className: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700' }
  const errorRate = row.errorCount / row.requestCount
  if (errorRate >= 0.1) return { label: 'Errors', className: 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-900' }
  if (row.avgDurationMs !== null && row.avgDurationMs > 1000) return { label: 'Slow', className: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900' }
  return { label: 'Healthy', className: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900' }
}

function fmtMs(v: number | null): string {
  if (v === null) return '—'
  return v >= 1000 ? `${(v / 1000).toFixed(2)}s` : `${Math.round(v)}ms`
}

function fmtBytes(v: number): string {
  if (v <= 0) return '—'
  if (v >= 1024 * 1024 * 1024) return `${(v / (1024 * 1024 * 1024)).toFixed(2)} GB`
  if (v >= 1024 * 1024) return `${(v / (1024 * 1024)).toFixed(1)} MB`
  return `${(v / 1024).toFixed(1)} KB`
}

function UsageContent() {
  const router = useRouter()
  const [date, setDate] = useState(yesterday())
  const [rows, setRows] = useState<SchoolMetricRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [recomputing, setRecomputing] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('avgDurationMs')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  useEffect(() => { load() }, [date])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await apiFetch(`/api/platform/school-metrics?date=${date}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setRows(data.schools ?? [])
    } catch {
      setError('Failed to load usage metrics')
    } finally {
      setLoading(false)
    }
  }

  async function recompute() {
    setRecomputing(true)
    try {
      const res = await apiFetch(`/api/platform/school-metrics/recompute?date=${date}`, { method: 'POST' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await load()
    } catch {
      setError('Failed to recompute')
    } finally {
      setRecomputing(false)
    }
  }

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir('desc') }
  }

  const sorted = useMemo(() => {
    const copy = [...rows]
    copy.sort((a, b) => {
      const av = a[sortKey]
      const bv = b[sortKey]
      const an = av === null ? -Infinity : av
      const bn = bv === null ? -Infinity : bv
      if (typeof an === 'string' || typeof bn === 'string') {
        return sortDir === 'asc' ? String(an).localeCompare(String(bn)) : String(bn).localeCompare(String(an))
      }
      return sortDir === 'asc' ? (an as number) - (bn as number) : (bn as number) - (an as number)
    })
    return copy
  }, [rows, sortKey, sortDir])

  const columns: { key: SortKey; label: string }[] = [
    { key: 'requestCount', label: 'Requests' },
    { key: 'errorCount', label: 'Errors' },
    { key: 'avgDurationMs', label: 'Avg latency' },
    { key: 'p95DurationMs', label: 'P95 latency' },
    { key: 'activeUserCount', label: 'Active users' },
    { key: 'storageBytes', label: 'Storage' },
  ]

  return (
    <div className="page-shell">
      <Sidebar title="Platform" subtitle="Wattaman" navItems={platformNav} accentColor="slate" />
      <div className="page-content">
        <div className="h-14 lg:hidden" />
        <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">Usage Metrics</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Daily activity and latency per school — spot a school that's genuinely slow, not just busy. Click a row for its trend.</p>
          </div>
          <div className="flex items-center gap-2">
            <input type="date" value={date} onChange={e => setDate(e.target.value)} max={yesterday()} className="text-sm" />
            <button onClick={recompute} disabled={recomputing} className="btn-outline btn-sm disabled:opacity-50">
              {recomputing ? 'Recomputing…' : 'Recompute'}
            </button>
          </div>
        </div>

        <div className="page-body space-y-4">
          {error && <div className="px-4 py-3 rounded-lg text-sm font-medium bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-900">{error}</div>}

          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-8 h-8 border-3 border-slate-300 dark:border-slate-600 border-t-slate-700 rounded-full animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <div className="card p-10 text-center text-slate-400 dark:text-slate-500 text-sm">No schools yet.</div>
          ) : (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase cursor-pointer" onClick={() => toggleSort('schoolName')}>School</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Status</th>
                    {columns.map(c => (
                      <th key={c.key} className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase cursor-pointer whitespace-nowrap" onClick={() => toggleSort(c.key)}>
                        {c.label}{sortKey === c.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {sorted.map(row => {
                    const status = statusFor(row)
                    return (
                      <tr key={row.schoolId} onClick={() => router.push(`/platform/schools/${row.schoolId}/usage`)}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors">
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-800 dark:text-slate-100">{row.schoolName}</div>
                          <div className="text-xs text-slate-400 dark:text-slate-500">{row.schoolSubdomain}</div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${status.className}`}>{status.label}</span>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{row.requestCount}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{row.errorCount}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmtMs(row.avgDurationMs)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmtMs(row.p95DurationMs)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{row.activeUserCount}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{fmtBytes(row.storageBytes)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {!loading && rows.length > 0 && rows.every(r => !r.computed) && (
            <p className="text-xs text-slate-400 dark:text-slate-500">No rollup exists yet for this date — click Recompute to generate it.</p>
          )}
        </div>
      </div>
    </div>
  )
}

export default function UsagePage() {
  return (
    <AuthGuard requiredRole="PLATFORM_ADMIN">
      <UsageContent />
    </AuthGuard>
  )
}
