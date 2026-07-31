"use client"

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Tooltip, Legend, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts'
import Sidebar from '../../../../../components/Sidebar'
import AuthGuard from '../../../../../components/AuthGuard'
import { platformNav } from '../../../../../lib/platform-nav'
import { apiFetch } from '../../../../../lib/api'

interface DailyRow {
  date: string
  requestCount: number
  errorCount: number
  avgDurationMs: number | null
  p95DurationMs: number | null
  activeUserCount: number
  storageBytes: number
}

const RANGES = [30, 60, 90] as const

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{label}</div>
      <div className="text-xl font-bold text-slate-800 mt-1">{value}</div>
    </div>
  )
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

function UsageTrendContent() {
  const { id } = useParams<{ id: string }>()
  const [schoolName, setSchoolName] = useState('')
  const [rows, setRows] = useState<DailyRow[]>([])
  const [days, setDays] = useState<typeof RANGES[number]>(30)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => { load() }, [id, days])

  async function load() {
    setLoading(true)
    setError('')
    try {
      const [schoolRes, trendRes] = await Promise.all([
        apiFetch(`/api/platform/schools/${id}`),
        apiFetch(`/api/platform/school-metrics/${id}?days=${days}`),
      ])
      if (schoolRes.ok) setSchoolName((await schoolRes.json()).name)
      if (!trendRes.ok) throw new Error(`HTTP ${trendRes.status}`)
      setRows(await trendRes.json())
    } catch {
      setError('Failed to load usage trend')
    } finally {
      setLoading(false)
    }
  }

  const summary = useMemo(() => {
    if (rows.length === 0) return null
    const totalRequests = rows.reduce((s, r) => s + r.requestCount, 0)
    const totalErrors = rows.reduce((s, r) => s + r.errorCount, 0)
    const withLatency = rows.filter(r => r.avgDurationMs !== null)
    const avgLatency = withLatency.length
      ? withLatency.reduce((s, r) => s + (r.avgDurationMs ?? 0), 0) / withLatency.length
      : null
    const peakActive = Math.max(0, ...rows.map(r => r.activeUserCount))
    // storageBytes is a current snapshot, not a daily delta — use the most
    // recent row (rows is ascending by date), not a sum across the range.
    const currentStorage = rows[rows.length - 1].storageBytes
    return { totalRequests, totalErrors, avgLatency, peakActive, currentStorage }
  }, [rows])

  const chartData = rows.map(r => ({
    ...r,
    dayLabel: new Date(r.date).toLocaleDateString('default', { month: 'short', day: 'numeric' }),
  }))

  return (
    <div className="page-shell">
      <Sidebar title="Platform" subtitle="Wattaman" navItems={platformNav} accentColor="slate" />
      <div className="page-content">
        <div className="h-14 lg:hidden" />
        <div className="page-header flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <Link href={`/platform/schools/${id}`} className="text-xs text-slate-500 hover:text-slate-700 mb-2 inline-flex items-center gap-1">← Back to {schoolName || 'School'}</Link>
            <h1 className="text-2xl font-bold text-slate-800">Usage &amp; Speed</h1>
            <p className="text-sm text-slate-500 mt-1">Daily activity and average request latency for the last {days} days.</p>
          </div>
          <div className="flex gap-2">
            {RANGES.map(r => (
              <button key={r} onClick={() => setDays(r)}
                className={`text-sm px-3 py-1.5 rounded-lg border font-medium ${days === r ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-600 border-slate-200'}`}>
                {r}d
              </button>
            ))}
          </div>
        </div>

        <div className="page-body space-y-4">
          {error && <div className="px-4 py-3 rounded-lg text-sm font-medium bg-red-50 text-red-800 border border-red-200">{error}</div>}

          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-8 h-8 border-3 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
            </div>
          ) : rows.length === 0 ? (
            <div className="card p-10 text-center text-slate-400 text-sm">
              No usage data yet for this range — the daily rollup runs shortly after each UTC midnight, or use Recompute on the Usage Metrics page to backfill.
            </div>
          ) : (
            <>
              {summary && (
                <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                  <StatCard label={`Requests (${days}d)`} value={String(summary.totalRequests)} />
                  <StatCard label={`Errors (${days}d)`} value={String(summary.totalErrors)} />
                  <StatCard label="Avg latency" value={fmtMs(summary.avgLatency)} />
                  <StatCard label="Peak active users/day" value={String(summary.peakActive)} />
                  <StatCard label="Storage (current)" value={fmtBytes(summary.currentStorage)} />
                </div>
              )}

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
                <div className="px-5 pt-5">
                  <h3 className="text-sm font-bold text-gray-700">Requests &amp; Latency</h3>
                </div>
                <div className="px-5 pb-5 pt-2" style={{ height: '320px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                      <XAxis dataKey="dayLabel" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                      <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#9CA3AF' }} axisLine={false} tickLine={false} unit="ms" />
                      <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #E5E7EB', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: '13px' }} />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '12px', paddingTop: '8px' }} />
                      <Line yAxisId="left" type="monotone" dataKey="requestCount" name="Requests" stroke="#6366F1" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                      <Line yAxisId="right" type="monotone" dataKey="avgDurationMs" name="Avg latency (ms)" stroke="#F59E0B" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase">Date</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase">Requests</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase">Errors</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase">Avg latency</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase">P95 latency</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase">Active users</th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold text-slate-500 uppercase">Storage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {[...rows].reverse().map(r => (
                      <tr key={r.date} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5 text-slate-600">{r.date}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{r.requestCount}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{r.errorCount}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{fmtMs(r.avgDurationMs)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{fmtMs(r.p95DurationMs)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{r.activeUserCount}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{fmtBytes(r.storageBytes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function UsageTrendPage() {
  return (
    <AuthGuard requiredRole="PLATFORM_ADMIN">
      <UsageTrendContent />
    </AuthGuard>
  )
}
