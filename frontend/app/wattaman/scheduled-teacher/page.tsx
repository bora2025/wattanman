'use client'

import { useState, useEffect } from 'react'
import AuthGuard from '../../../components/AuthGuard'
import Sidebar from '../../../components/Sidebar'
import { wattamanNav } from '../../../lib/wattaman-nav'
import { apiFetch } from '../../../lib/api'
import Link from 'next/link'

interface ScheduledTeacher {
  id: string
  timetableId: string
  timetableName: string
  name: string
  short: string
  sex: string | null
  color: string | null
  qrCode: string | null
  weeklyLessons: number
  lessons: { id: string; subjectName: string; className: string; perWeek: number }[]
  todayPeriods: number[]
  totalEntries: number
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function ScheduledTeacherContent() {
  const [teachers, setTeachers] = useState<ScheduledTeacher[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const cambodiaNow = new Date(new Date().getTime() + 7 * 60 * 60 * 1000)
  const todayName = DAYS[cambodiaNow.getUTCDay()]

  useEffect(() => {
    fetchTeachers()
  }, [])

  const fetchTeachers = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await apiFetch('/api/timetable/scheduled-teachers/all')
      if (!res.ok) throw new Error('Failed to fetch')
      const data = await res.json()
      setTeachers(data)
    } catch {
      setError('Failed to load scheduled teachers. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const downloadCSV = () => {
    const rows: string[][] = [
      ['No.', 'Teacher Name', 'Short', 'Timetable', 'Weekly Lessons', 'Subjects & Classes', 'Today\'s Periods'],
    ]
    teachers.forEach((t, i) => {
      rows.push([
        String(i + 1),
        t.name,
        t.short ?? '',
        t.timetableName,
        String(t.weeklyLessons),
        t.lessons.map(l => `${l.subjectName}/${l.className}(${l.perWeek}×)`).join(' | '),
        t.todayPeriods.length > 0 ? t.todayPeriods.map(p => `P${p}`).join(', ') : 'None',
      ])
    })
    const csv = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `scheduled-teachers-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const filtered = teachers.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.timetableName.toLowerCase().includes(search.toLowerCase()) ||
    t.lessons.some(l => l.subjectName.toLowerCase().includes(search.toLowerCase()) || l.className.toLowerCase().includes(search.toLowerCase()))
  )

  // Group by timetable
  const byTimetable = filtered.reduce<Record<string, ScheduledTeacher[]>>((acc, t) => {
    const key = `${t.timetableId}|${t.timetableName}`
    if (!acc[key]) acc[key] = []
    acc[key].push(t)
    return acc
  }, {})

  return (
    <div className="page-shell">
      <Sidebar
        title="Wattaman"
        subtitle="QR Attendance"
        navItems={wattamanNav}
        accentColor="emerald"
        bottomTabs={['/wattaman', '/wattaman/scan', '/wattaman/scheduled-teacher', '/wattaman/teacher-reports']}
      />
      <div className="page-content">
        <div className="h-14 lg:hidden" />

        {/* Header */}
        <div className="page-header">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Scheduled Teacher</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Teachers with lessons from the active timetable · Today: <span className="font-semibold text-emerald-600">{todayName}</span>
              </p>
            </div>
            <div className="flex items-center gap-2">
              {teachers.length > 0 && (
                <button
                  onClick={downloadCSV}
                  className="flex items-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-semibold px-3 py-2 rounded-xl transition-colors shadow-sm"
                  title="Download as CSV"
                >
                  <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  CSV
                </button>
              )}
              <Link
                href="/wattaman/teacher-scan"
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors shadow-sm"
              >
                <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
                Scan Teacher
              </Link>
            </div>
          </div>
        </div>

        <div className="page-body space-y-4">

          {/* Search */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search teacher, subject, class…"
              className="w-full pl-9 pr-4 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-400 text-slate-700 placeholder:text-slate-400"
            />
          </div>

          {loading && (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 flex items-center justify-between">
              <span>{error}</span>
              <button onClick={fetchTeachers} className="text-red-600 font-medium underline text-xs">Retry</button>
            </div>
          )}

          {!loading && !error && teachers.length === 0 && (
            <div className="text-center py-16 text-slate-400">
              <div className="text-5xl mb-3">📅</div>
              <p className="font-medium text-slate-600">No scheduled teachers found</p>
              <p className="text-xs mt-1">Make sure there is a published timetable with lesson assignments.</p>
            </div>
          )}

          {!loading && filtered.length === 0 && teachers.length > 0 && (
            <div className="text-center py-8 text-slate-400 text-sm">No teachers match your search.</div>
          )}

          {/* Groups by timetable */}
          {Object.entries(byTimetable).map(([groupKey, groupTeachers]) => {
            const timetableName = groupKey.split('|')[1]
            return (
              <div key={groupKey}>
                <div className="flex items-center gap-2 mb-2 px-1">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{timetableName}</p>
                  <span className="text-xs text-slate-400">· {groupTeachers.length} teacher{groupTeachers.length !== 1 ? 's' : ''}</span>
                </div>

                <div className="space-y-2">
                  {groupTeachers.map(teacher => {
                    const isExpanded = expandedId === teacher.id
                    const isTeachingToday = teacher.todayPeriods.length > 0

                    return (
                      <div
                        key={teacher.id}
                        className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden"
                      >
                        <button
                          className="w-full text-left p-4 flex items-start gap-3"
                          onClick={() => setExpandedId(isExpanded ? null : teacher.id)}
                        >
                          {/* Avatar */}
                          <div
                            className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                            style={{ background: teacher.color || '#00C9A7' }}
                          >
                            {teacher.short?.charAt(0) ?? teacher.name.charAt(0)}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-slate-800 text-sm">{teacher.name}</span>
                              {teacher.short && (
                                <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono">{teacher.short}</span>
                              )}
                              {isTeachingToday && (
                                <span className="text-xs bg-emerald-100 text-emerald-700 font-semibold px-2 py-0.5 rounded-full">Today: P{teacher.todayPeriods.join(', P')}</span>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-2 mt-1">
                              <span className="text-xs text-slate-500">{teacher.weeklyLessons} lessons/week</span>
                              <span className="text-xs text-slate-400">·</span>
                              <span className="text-xs text-slate-500">{teacher.totalEntries} entries total</span>
                            </div>
                          </div>

                          <svg
                            className={`flex-shrink-0 text-slate-400 transition-transform mt-0.5 ${isExpanded ? 'rotate-180' : ''}`}
                            width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                          >
                            <path d="M6 9l6 6 6-6" />
                          </svg>
                        </button>

                        {isExpanded && (
                          <div className="px-4 pb-4 border-t border-slate-50 pt-3 space-y-3">
                            {/* Lessons */}
                            <div>
                              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Lesson Contracts</p>
                              <div className="space-y-1.5">
                                {teacher.lessons.map((l, i) => (
                                  <div key={i} className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-medium text-slate-700">{l.subjectName}</span>
                                      <span className="text-xs text-slate-400">–</span>
                                      <span className="text-xs text-slate-500">{l.className}</span>
                                    </div>
                                    <span className="text-xs font-semibold text-emerald-600">{l.perWeek}×/wk</span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            {/* Today's periods */}
                            {isTeachingToday && (
                              <div>
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Today's Periods</p>
                                <div className="flex gap-2 flex-wrap">
                                  {teacher.todayPeriods.map(p => (
                                    <span key={p} className="text-sm font-bold bg-emerald-100 text-emerald-700 rounded-lg px-3 py-1">Period {p}</span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Actions */}
                            <Link
                              href={`/wattaman/teacher-scan?hint=${encodeURIComponent(teacher.name)}`}
                              className="flex items-center justify-center gap-2 w-full bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold py-2.5 rounded-xl transition-colors"
                            >
                              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                                <circle cx="12" cy="13" r="4" />
                              </svg>
                              Scan {teacher.name.split(' ')[0]}'s QR Code
                            </Link>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {/* CTA to reports */}
          {!loading && teachers.length > 0 && (
            <Link href="/wattaman/teacher-reports" className="block">
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600 flex-shrink-0">
                  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-700">View Teacher Reports</p>
                  <p className="text-xs text-slate-400">Monthly attendance totals and history</p>
                </div>
                <svg className="ml-auto text-slate-400" width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </div>
            </Link>
          )}

        </div>
      </div>
    </div>
  )
}

export default function ScheduledTeacherPage() {
  return (
    <AuthGuard allowedRoles={['WATTAMAN', 'ADMIN']}>
      <ScheduledTeacherContent />
    </AuthGuard>
  )
}
