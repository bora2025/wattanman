'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, LineChart, Line,
} from 'recharts'
import Sidebar from '../../../components/Sidebar'
import AuthGuard from '../../../components/AuthGuard'
import { adminNav } from '../../../lib/admin-nav'
import { apiFetch } from '../../../lib/api'

/* ─── Types ─────────────────────────────────────────────── */

type Period = 'daily' | 'weekly' | 'monthly' | 'yearly'

interface BudgetSummary {
  totalCollected: number
  totalFees: number
  discountGiven: number
  outstanding: number
  collectionRate: number
  feeRecordsCreated: number
  paymentsCount: number
}

interface BreakdownItem {
  label: string
  collected: number
  fees: number
}

interface Payment {
  id: string
  studentName: string
  class: string
  amount: number
  note: string
  date: string
  time: string
}

interface BudgetReport {
  period: Period
  dateRange: { start: string; end: string }
  summary: BudgetSummary
  breakdown: BreakdownItem[]
  payments: Payment[]
}

interface SalarySummary {
  total: number
  totalNet: number
  paid: number
  unpaid: number
}

interface FeeSummaryAll {
  totalRevenue: number
  pendingAmount: number
  paidCount: number
  collectionRate: number
  total: number
}

/* ─── Helpers ────────────────────────────────────────────── */

function fmt(amount: number) {
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)
}

function periodLabel(period: Period, dateRange: { start: string; end: string }) {
  if (period === 'daily') return dateRange.start
  if (period === 'weekly') return `${dateRange.start} – ${dateRange.end}`
  if (period === 'monthly') {
    const d = new Date(dateRange.start + 'T00:00:00')
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }
  return dateRange.start.slice(0, 4)
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-lg p-3 text-sm">
      <p className="font-semibold text-gray-700 mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: p.color }} />
          <span className="text-gray-500">{p.name}:</span>
          <span className="font-semibold text-gray-800">${fmt(p.value)}</span>
        </p>
      ))}
    </div>
  )
}

/* ─── Stat Card ─────────────────────────────────────────── */

function StatCard({
  label, value, sub, icon, color, prefix = '$',
}: {
  label: string; value: string | number; sub?: string
  icon: React.ReactNode; color: string; prefix?: string
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-start gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-none ${color}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 font-medium">{label}</p>
        <p className="text-xl font-extrabold text-gray-900 mt-0.5 truncate">
          {typeof value === 'number' ? `${prefix}${fmt(value)}` : value}
        </p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

/* ─── Main page ──────────────────────────────────────────── */

function BudgetContent() {
  const [period, setPeriod] = useState<Period>('monthly')
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0])
  const [report, setReport] = useState<BudgetReport | null>(null)
  const [salary, setSalary] = useState<SalarySummary | null>(null)
  const [allTime, setAllTime] = useState<FeeSummaryAll | null>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'chart' | 'payments'>('chart')

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const d = new Date(date + 'T00:00:00')
      const year = d.getFullYear()
      const month = d.getMonth() + 1

      const [r1, r2, r3] = await Promise.all([
        apiFetch(`/api/fees/budget-report?period=${period}&date=${date}`),
        apiFetch(`/api/salary/summary?year=${year}&month=${month}`),
        apiFetch('/api/fees/summary'),
      ])
      if (r1.ok) setReport(await r1.json())
      if (r2.ok) setSalary(await r2.json())
      if (r3.ok) setAllTime(await r3.json())
    } catch {}
    setLoading(false)
  }, [period, date])

  useEffect(() => { loadData() }, [loadData])

  const periodTabs: { id: Period; label: string }[] = [
    { id: 'daily', label: 'Daily' },
    { id: 'weekly', label: 'Weekly' },
    { id: 'monthly', label: 'Monthly' },
    { id: 'yearly', label: 'Yearly' },
  ]

  const s = report?.summary
  const net = s && salary ? s.totalCollected - salary.totalNet : null

  // Filter breakdown to non-zero for monthly/yearly to keep chart readable
  const chartData = report?.breakdown.filter((b, _, arr) =>
    arr.some(x => x.collected > 0 || x.fees > 0) ? true : true
  ) ?? []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Budget Report</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {report ? periodLabel(period, report.dateRange) : '—'}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Period tabs */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
            {periodTabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setPeriod(t.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  period === t.id ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {/* Date picker */}
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
          />
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-60"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
            )}
            Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* ── Net Balance Banner ── */}
          {net !== null && (
            <div className={`rounded-2xl p-5 flex items-center justify-between gap-4 ${net >= 0 ? 'bg-emerald-50 border border-emerald-100' : 'bg-red-50 border border-red-100'}`}>
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${net >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`}>
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    {net >= 0
                      ? <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                      : <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>}
                  </svg>
                </div>
                <div>
                  <p className={`text-sm font-semibold ${net >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                    Net Balance — {net >= 0 ? 'Surplus' : 'Deficit'}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">Income collected – salary payout this period</p>
                </div>
              </div>
              <p className={`text-3xl font-extrabold tabular-nums ${net >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                {net < 0 ? '-' : '+'}${fmt(Math.abs(net))}
              </p>
            </div>
          )}

          {/* ── Income cards ── */}
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Income — {period} period</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label="Total Collected"
                value={s?.totalCollected ?? 0}
                sub={`${s?.paymentsCount ?? 0} payments`}
                color="bg-emerald-100"
                icon={<svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>}
              />
              <StatCard
                label="Outstanding"
                value={s?.outstanding ?? 0}
                sub="unpaid balances"
                color="bg-red-100"
                icon={<svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>}
              />
              <StatCard
                label="Discount Given"
                value={s?.discountGiven ?? 0}
                sub={`on ${s?.feeRecordsCreated ?? 0} records`}
                color="bg-blue-100"
                icon={<svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7 7h.01M17 17h.01M3 21l18-18"/></svg>}
              />
              <StatCard
                label="Collection Rate"
                value={`${s?.collectionRate ?? 0}%`}
                sub="of effective amount"
                color="bg-violet-100"
                prefix=""
                icon={<svg className="w-5 h-5 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>}
              />
            </div>
          </div>

          {/* ── Salary / Expense cards ── */}
          {salary && (
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Expenses — salary payout ({new Date(date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })})</p>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                  label="Total Salary Payout"
                  value={salary.totalNet}
                  sub={`${salary.total} staff records`}
                  color="bg-orange-100"
                  icon={<svg className="w-5 h-5 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"/></svg>}
                />
                <StatCard
                  label="Paid Salaries"
                  value={salary.paid}
                  sub="disbursed this month"
                  color="bg-emerald-100"
                  prefix=""
                  icon={<svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>}
                />
                <StatCard
                  label="Unpaid Salaries"
                  value={salary.unpaid}
                  sub="pending disbursement"
                  color="bg-amber-100"
                  prefix=""
                  icon={<svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>}
                />
                {allTime && (
                  <StatCard
                    label="All-Time Revenue"
                    value={allTime.totalRevenue}
                    sub={`${allTime.collectionRate}% collection rate`}
                    color="bg-indigo-100"
                    icon={<svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/></svg>}
                  />
                )}
              </div>
            </div>
          )}

          {/* ── Chart + Payments tab ── */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
                {(['chart', 'payments'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`px-4 py-1.5 text-xs font-semibold rounded-lg capitalize transition-all ${
                      tab === t ? 'bg-white text-indigo-700 shadow-sm' : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    {t === 'chart' ? '📊 Chart' : `💳 Payments (${report?.payments.length ?? 0})`}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400">
                {report?.dateRange.start} – {report?.dateRange.end}
              </p>
            </div>

            {/* ── Chart ── */}
            {tab === 'chart' && (
              <div className="p-6">
                {chartData.every(b => b.collected === 0 && b.fees === 0) ? (
                  <div className="flex flex-col items-center justify-center h-52 text-gray-400">
                    <svg className="w-10 h-10 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                    </svg>
                    <p className="text-sm font-medium">No transactions in this period.</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 11, fill: '#9CA3AF' }}
                        tickLine={false}
                        axisLine={false}
                        interval={period === 'monthly' ? 4 : period === 'daily' ? 2 : 0}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: '#9CA3AF' }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => v === 0 ? '0' : `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                      />
                      <Tooltip content={<CustomTooltip />} />
                      <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="fees" name="Fees Issued" fill="#E0E7FF" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="collected" name="Collected" fill="#6366F1" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            )}

            {/* ── Payments list ── */}
            {tab === 'payments' && (
              <div className="overflow-x-auto">
                {(!report?.payments.length) ? (
                  <div className="flex flex-col items-center justify-center h-40 text-gray-400">
                    <p className="text-sm">No payments in this period.</p>
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wider">
                      <tr>
                        <th className="px-5 py-3 text-left font-semibold">Student</th>
                        <th className="px-5 py-3 text-left font-semibold">Class</th>
                        <th className="px-5 py-3 text-left font-semibold">Date</th>
                        <th className="px-5 py-3 text-left font-semibold">Time</th>
                        <th className="px-5 py-3 text-right font-semibold">Amount</th>
                        <th className="px-5 py-3 text-left font-semibold">Note</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {report.payments.map((p) => (
                        <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-5 py-3 font-medium text-gray-900">{p.studentName}</td>
                          <td className="px-5 py-3 text-gray-500">{p.class || '—'}</td>
                          <td className="px-5 py-3 text-gray-500">{p.date}</td>
                          <td className="px-5 py-3 text-gray-500">{p.time}</td>
                          <td className="px-5 py-3 text-right font-bold text-emerald-700">${fmt(p.amount)}</td>
                          <td className="px-5 py-3 text-gray-400 text-xs max-w-[160px] truncate">{p.note || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50 border-t border-gray-200">
                      <tr>
                        <td colSpan={4} className="px-5 py-3 text-xs font-bold text-gray-600 uppercase tracking-wider">Total</td>
                        <td className="px-5 py-3 text-right font-extrabold text-emerald-700">
                          ${fmt(report.payments.reduce((s, p) => s + p.amount, 0))}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/* ─── Page export ─────────────────────────────────────────── */

export default function BudgetReportPage() {
  return (
    <AuthGuard>
      <div className="flex h-screen bg-gray-50">
        <Sidebar title="Admin" navItems={adminNav} accentColor="indigo" />
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-6 py-8">
            <BudgetContent />
          </div>
        </main>
      </div>
    </AuthGuard>
  )
}
