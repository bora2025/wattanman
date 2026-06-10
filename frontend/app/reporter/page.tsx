'use client'

import Link from 'next/link'
import AuthGuard from '../../components/AuthGuard'
import Sidebar from '../../components/Sidebar'
import { reporterNav } from '../../lib/reporter-nav'
import { apiFetch, getCurrentUser } from '../../lib/api'
import { useState, useEffect } from 'react'
import { todayCambodia } from '../../lib/dateUtils'

interface GroupSummary {
  total: number
  present: number
  absent: number
  late: number
  permission: number
}
interface DashboardData {
  students: GroupSummary
  staff: GroupSummary
}

function StatCard({ label, value, total, color, icon }: { label: string; value: number; total: number; color: 'green' | 'red' | 'amber' | 'blue'; icon: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  const styles = {
    green: { bg: 'from-emerald-50 to-emerald-100/50 border-emerald-200/60', num: 'text-emerald-700', bar: 'bg-emerald-500' },
    red:   { bg: 'from-red-50 to-red-100/50 border-red-200/60',             num: 'text-red-700',     bar: 'bg-red-500' },
    amber: { bg: 'from-amber-50 to-amber-100/50 border-amber-200/60',       num: 'text-amber-700',   bar: 'bg-amber-500' },
    blue:  { bg: 'from-blue-50 to-blue-100/50 border-blue-200/60',          num: 'text-blue-700',    bar: 'bg-blue-500' },
  }
  const s = styles[color]
  return (
    <div className={`bg-gradient-to-br ${s.bg} border rounded-2xl p-4 flex flex-col gap-2`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-500">{icon} {label}</span>
        <span className="text-xs text-slate-400">{pct}%</span>
      </div>
      <div className={`text-3xl font-extrabold tracking-tight ${s.num}`}>{value}</div>
      <div className="h-1.5 bg-white/60 rounded-full overflow-hidden">
        <div className={`h-full ${s.bar} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
      <div className="text-[11px] text-slate-400">of {total} total</div>
    </div>
  )
}

function ReporterDashboardContent() {
  const [userName, setUserName] = useState('')
  const [selectedDate, setSelectedDate] = useState(todayCambodia())
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getCurrentUser().then(u => { if (u?.name) setUserName(u.name) }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!selectedDate) return
    setLoading(true)
    apiFetch(`/api/reports/dashboard-summary?date=${selectedDate}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setData(d) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [selectedDate])

  const stu = data?.students ?? { total: 0, present: 0, absent: 0, late: 0, permission: 0 }
  const stf = data?.staff    ?? { total: 0, present: 0, absent: 0, late: 0, permission: 0 }

  const reports = [
    { title: 'My Attendance Scan',        desc: 'Scan your QR card to record your own daily attendance.',                 href: '/employee/scan',            icon: '📷' },
    { title: 'Staff Attendance Report',   desc: 'Daily, weekly, monthly, and yearly reports for all staff.',              href: '/admin/staff-reports',      icon: '📋' },
    { title: 'Student Attendance Report', desc: 'Attendance records for students, grouped by class.',                      href: '/admin/reports',            icon: '🎓' },
    { title: 'Teacher Attendance Report', desc: 'Teacher lesson attendance and monthly summaries.',                        href: '/wattaman/teacher-reports', icon: '📚' },
    { title: 'Edit Staff Attendance',     desc: 'Manually add, update, or clear daily records for staff members.',         href: '/admin/staff-attendance/edit', icon: '✏️' },
    { title: 'Edit Student Attendance',   desc: 'Manually add, update, or clear per-session records for students.',        href: '/admin/attendance/edit',    icon: '📝' },
  ]

  return (
    <div className="page-shell">
      <Sidebar title="Reporter" subtitle="Wattaman" navItems={reporterNav} accentColor="teal" />
      <div className="page-content">
        <div className="h-14 lg:hidden" />

        {/* Header */}
        <div className="page-header">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-slate-800">
                {userName ? `Welcome, ${userName}` : 'Reporter Portal'}
              </h1>
              <p className="text-sm text-slate-500 mt-1">Attendance overview and reports</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="appearance-none bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 outline-none"
              />
              <button
                onClick={() => setSelectedDate(todayCambodia())}
                className="px-3 py-2 text-xs font-semibold text-teal-600 bg-teal-50 rounded-xl hover:bg-teal-100 transition-colors"
              >
                Today
              </button>
            </div>
          </div>
        </div>

        <div className="page-body space-y-6">

          {/* ── Student Stat Cards ── */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-5 rounded-full bg-purple-500" />
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Students</h2>
              <span className="text-xs bg-slate-100 text-slate-500 font-semibold px-2 py-0.5 rounded-full">{stu.total}</span>
            </div>
            {loading ? (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[1,2,3,4].map(i => <div key={i} className="h-28 rounded-2xl bg-slate-100 animate-pulse" />)}
              </div>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard label="Present"    value={stu.present}    total={stu.total} color="green" icon="✅" />
                <StatCard label="Absent"     value={stu.absent}     total={stu.total} color="red"   icon="❌" />
                <StatCard label="Late"       value={stu.late}       total={stu.total} color="amber" icon="⏰" />
                <StatCard label="Permission" value={stu.permission} total={stu.total} color="blue"  icon="📋" />
              </div>
            )}
          </section>

          {/* ── Staff Stat Cards ── */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-5 rounded-full bg-cyan-500" />
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Staff</h2>
              <span className="text-xs bg-slate-100 text-slate-500 font-semibold px-2 py-0.5 rounded-full">{stf.total}</span>
            </div>
            {loading ? (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[1,2,3,4].map(i => <div key={i} className="h-28 rounded-2xl bg-slate-100 animate-pulse" />)}
              </div>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard label="Present"    value={stf.present}    total={stf.total} color="green" icon="✅" />
                <StatCard label="Absent"     value={stf.absent}     total={stf.total} color="red"   icon="❌" />
                <StatCard label="Late"       value={stf.late}       total={stf.total} color="amber" icon="⏰" />
                <StatCard label="Permission" value={stf.permission} total={stf.total} color="blue"  icon="📋" />
              </div>
            )}
          </section>

          {/* ── Quick-access report links ── */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1 h-5 rounded-full bg-teal-500" />
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider">Quick Access</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {reports.map(r => (
                <Link key={r.href} href={r.href} className="card p-5 hover:shadow-md transition-shadow group block">
                  <div className="text-2xl mb-2">{r.icon}</div>
                  <h3 className="text-sm font-semibold text-slate-800 group-hover:text-teal-600 transition-colors mb-1">{r.title}</h3>
                  <p className="text-xs text-slate-500">{r.desc}</p>
                  <div className="mt-3 text-xs font-medium text-teal-600 group-hover:underline">Open →</div>
                </Link>
              ))}
            </div>
          </section>

        </div>
      </div>
    </div>
  )
}

export default function ReporterPage() {
  return (
    <AuthGuard allowedRoles={['WATTAMAN_REPORTER', 'ADMIN']}>
      <ReporterDashboardContent />
    </AuthGuard>
  )
}

    {
      title: 'My Attendance Scan',
      desc: 'Scan your QR card to record your own daily attendance check-in.',
      href: '/employee/scan',
      icon: '📷',
      accent: 'teal',
    },
    {
      title: 'Staff Attendance Report',
      desc: 'View and print daily, weekly, monthly, and yearly attendance reports for all staff members.',
      href: '/admin/staff-reports',
      icon: '📋',
      accent: 'indigo',
    },
    {
      title: 'Student Attendance Report',
      desc: 'View and print attendance records for students, grouped by class.',
      href: '/admin/reports',
      icon: '🎓',
      accent: 'emerald',
    },
    {
      title: 'Teacher Attendance Report',
      desc: 'View and print teacher lesson attendance and monthly summaries.',
      href: '/wattaman/teacher-reports',
      icon: '📚',
      accent: 'sky',
    },
    {
      title: 'Edit Staff Attendance',
      desc: 'Manually add, update, or clear daily attendance records for staff members.',
      href: '/admin/staff-attendance/edit',
      icon: '✏️',
      accent: 'amber',
    },
    {
      title: 'Edit Student Attendance',
      desc: 'Manually add, update, or clear per-session attendance records for students by class.',
      href: '/admin/attendance/edit',
      icon: '📝',
      accent: 'rose',
    },
  ]

  return (
    <div className="page-shell">
      <Sidebar title="Reporter" subtitle="Wattaman" navItems={reporterNav} accentColor="teal" />
      <div className="page-content">
        <div className="h-14 lg:hidden" />
        <div className="page-header">
          <h1 className="text-2xl font-bold text-slate-800">
            {userName ? `Welcome, ${userName}` : 'Reporter Portal'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">View and print attendance reports for staff and students.</p>
        </div>
        <div className="page-body">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-2">
            {reports.map(r => (
              <Link key={r.href} href={r.href} className="card p-6 hover:shadow-md transition-shadow group block">
                <div className="text-3xl mb-3">{r.icon}</div>
                <h2 className="text-base font-semibold text-slate-800 group-hover:text-indigo-600 transition-colors mb-1">
                  {r.title}
                </h2>
                <p className="text-sm text-slate-500">{r.desc}</p>
                <div className="mt-4 text-xs font-medium text-indigo-600 group-hover:underline">
                  Open report →
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ReporterPage() {
  return (
    <AuthGuard allowedRoles={['WATTAMAN_REPORTER', 'ADMIN']}>
      <ReporterDashboardContent />
    </AuthGuard>
  )
}
