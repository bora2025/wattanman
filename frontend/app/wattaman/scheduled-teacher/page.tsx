'use client'

import { useState, useEffect, useRef } from 'react'
import AuthGuard from '../../../components/AuthGuard'
import Sidebar from '../../../components/Sidebar'
import { wattamanNav } from '../../../lib/wattaman-nav'
import { apiFetch } from '../../../lib/api'
import QRCode from 'qrcode'

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

// Inline ID Card preview component
function MiniIdCard({ teacher, orgName }: { teacher: ScheduledTeacher; orgName: string }) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('')
  const color = teacher.color || '#00C9A7'
  const uniqueSubjects = [...new Set(teacher.lessons.map(l => l.subjectName))]

  useEffect(() => {
    if (teacher.qrCode) {
      QRCode.toDataURL(teacher.qrCode, {
        width: 160,
        margin: 1,
        color: { dark: '#1e293b', light: '#ffffff' },
        errorCorrectionLevel: 'M',
      }).then(setQrDataUrl).catch(() => {})
    }
  }, [teacher.qrCode])

  return (
    <div
      style={{ border: `2px solid ${color}33`, borderLeft: `4px solid ${color}` }}
      className="bg-white rounded-xl overflow-hidden flex"
    >
      {/* Info section */}
      <div className="flex-1 p-3 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-slate-800 text-sm leading-tight">{teacher.name}</span>
          <span
            className="text-xs font-bold px-1.5 py-0.5 rounded"
            style={{ background: color + '22', color }}
          >
            {teacher.short}
          </span>
        </div>
        <div className="text-xs text-slate-400 mt-0.5">{teacher.timetableName}</div>
        <div className="mt-1.5 space-y-0.5">
          {uniqueSubjects.slice(0, 3).map((s, i) => (
            <div key={i} className="text-xs text-slate-600 truncate">
              <span className="text-slate-400">•</span> {s}
            </div>
          ))}
          {uniqueSubjects.length > 3 && (
            <div className="text-xs text-slate-400">+{uniqueSubjects.length - 3} more subjects</div>
          )}
        </div>
        <div className="mt-2 flex gap-2 text-xs text-slate-500">
          <span>{teacher.weeklyLessons} lessons/wk</span>
          <span>·</span>
          <span>{teacher.lessons.length} class{teacher.lessons.length !== 1 ? 'es' : ''}</span>
        </div>
      </div>

      {/* QR section */}
      <div className="flex flex-col items-center justify-center p-3 border-l border-slate-100 bg-slate-50 flex-shrink-0 gap-1">
        {qrDataUrl ? (
          <img src={qrDataUrl} alt="QR Code" className="w-16 h-16 block" />
        ) : teacher.qrCode ? (
          <div className="w-16 h-16 bg-slate-200 rounded animate-pulse" />
        ) : (
          <div className="w-16 h-16 bg-slate-100 rounded flex items-center justify-center">
            <span className="text-xs text-slate-400 text-center leading-tight">No<br />QR</span>
          </div>
        )}
        <span className="text-xs text-slate-400 text-center leading-tight">Scan to<br />check in</span>
      </div>
    </div>
  )
}

function ScheduledTeacherContent() {
  const [teachers, setTeachers] = useState<ScheduledTeacher[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [selectedTimetable, setSelectedTimetable] = useState<string>('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [orgName, setOrgName] = useState<string>('School')
  const [editingOrg, setEditingOrg] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('wattaman-org-name')
    if (saved) setOrgName(saved)
  }, [])

  useEffect(() => {
    fetchTeachers()
  }, [])

  const fetchTeachers = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await apiFetch('/api/timetable/scheduled-teachers/all')
      if (!res.ok) throw new Error()
      const data = await res.json()
      setTeachers(data)
    } catch {
      setError('Failed to load teachers.')
    } finally {
      setLoading(false)
    }
  }

  const saveOrgName = () => {
    localStorage.setItem('wattaman-org-name', orgName)
    setEditingOrg(false)
  }

  const timetables = [...new Map(teachers.map(t => [t.timetableId, t.timetableName])).entries()]

  const filtered = teachers.filter(t => {
    const matchTimetable = selectedTimetable === 'all' || t.timetableId === selectedTimetable
    const q = search.toLowerCase()
    const matchSearch = !q || t.name.toLowerCase().includes(q) || t.short.toLowerCase().includes(q) ||
      t.timetableName.toLowerCase().includes(q) ||
      t.lessons.some(l => l.subjectName.toLowerCase().includes(q) || l.className.toLowerCase().includes(q))
    return matchTimetable && matchSearch
  })

  const grouped = filtered.reduce<Record<string, ScheduledTeacher[]>>((acc, t) => {
    if (!acc[t.timetableId]) acc[t.timetableId] = []
    acc[t.timetableId].push(t)
    return acc
  }, {})

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map(t => t.id)))
    }
  }

  const printCards = (ids: string[]) => {
    const params = `teacherIds=${ids.join(',')}&orgName=${encodeURIComponent(orgName)}`
    window.open(`/wattaman/scheduled-teacher/print?${params}`, '_blank')
  }

  const printSelected = () => {
    const ids = selectedIds.size > 0 ? [...selectedIds] : filtered.map(t => t.id)
    printCards(ids)
  }

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
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Scheduled Teacher ID Cards</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Teachers added to timetables · Manage &amp; print ID cards with QR codes
              </p>
            </div>
            <button
              onClick={printSelected}
              disabled={filtered.length === 0}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors shadow-sm flex-shrink-0"
            >
              <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
              {selectedIds.size > 0 ? `Print ${selectedIds.size} Selected` : `Print All (${filtered.length})`}
            </button>
          </div>
        </div>

        <div className="page-body space-y-4">

          {/* Org name + timetable filter row */}
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Org name editor */}
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-2 shadow-sm flex-1">
              <svg className="text-slate-400 flex-shrink-0" width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
              {editingOrg ? (
                <input
                  value={orgName}
                  onChange={e => setOrgName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && saveOrgName()}
                  onBlur={saveOrgName}
                  autoFocus
                  className="flex-1 text-sm text-slate-700 bg-transparent outline-none"
                  placeholder="School / Organization name"
                />
              ) : (
                <button
                  onClick={() => setEditingOrg(true)}
                  className="flex-1 text-sm text-slate-700 text-left truncate hover:text-slate-900"
                >
                  {orgName || <span className="text-slate-400">Set organization name for ID cards…</span>}
                </button>
              )}
              <button onClick={() => setEditingOrg(true)} className="text-slate-400 hover:text-slate-600 flex-shrink-0">
                <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
            </div>

            {/* Timetable filter */}
            {timetables.length > 1 && (
              <select
                value={selectedTimetable}
                onChange={e => setSelectedTimetable(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              >
                <option value="all">All Timetables</option>
                {timetables.map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Search + select-all row */}
          <div className="flex gap-2">
            <div className="relative flex-1">
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
            {filtered.length > 0 && (
              <button
                onClick={selectAll}
                className="flex-shrink-0 text-xs font-semibold bg-white border border-slate-200 rounded-xl px-3 py-2 text-slate-600 hover:bg-slate-50 shadow-sm"
              >
                {selectedIds.size === filtered.length ? 'Deselect All' : 'Select All'}
              </button>
            )}
          </div>

          {/* States */}
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
              <div className="text-5xl mb-3">🪪</div>
              <p className="font-medium text-slate-600">No teachers found</p>
              <p className="text-xs mt-1">Add teachers to a timetable first, then their ID cards will appear here.</p>
            </div>
          )}
          {!loading && filtered.length === 0 && teachers.length > 0 && (
            <div className="text-center py-8 text-slate-400 text-sm">No teachers match your search.</div>
          )}

          {/* Teacher groups */}
          {Object.entries(grouped).map(([timetableId, groupTeachers]) => (
            <div key={timetableId} className="space-y-2">
              {/* Group header */}
              <div className="flex items-center gap-2 px-1">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{groupTeachers[0].timetableName}</p>
                <span className="text-xs text-slate-400">· {groupTeachers.length} teacher{groupTeachers.length !== 1 ? 's' : ''}</span>
                <div className="ml-auto flex items-center gap-2">
                  <button
                    onClick={() => printCards(groupTeachers.map(t => t.id))}
                    className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"
                  >
                    <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6 9 6 2 18 2 18 9" />
                      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                      <rect x="6" y="14" width="12" height="8" />
                    </svg>
                    Print group
                  </button>
                  <span className="text-slate-300">|</span>
                  <button
                    onClick={() => {
                      const allSelected = groupTeachers.every(t => selectedIds.has(t.id))
                      setSelectedIds(prev => {
                        const next = new Set(prev)
                        if (allSelected) groupTeachers.forEach(t => next.delete(t.id))
                        else groupTeachers.forEach(t => next.add(t.id))
                        return next
                      })
                    }}
                    className="text-xs text-emerald-600 hover:underline"
                  >
                    {groupTeachers.every(t => selectedIds.has(t.id)) ? 'Deselect' : 'Select'} group
                  </button>
                </div>
              </div>

              {/* ID card grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {groupTeachers.map(teacher => (
                  <div key={teacher.id} className="relative">
                    {/* Checkbox */}
                    <button
                      onClick={() => toggleSelect(teacher.id)}
                      className={`absolute top-2 left-2 z-10 w-5 h-5 rounded flex items-center justify-center border-2 transition-colors shadow-sm ${
                        selectedIds.has(teacher.id)
                          ? 'bg-emerald-500 border-emerald-500'
                          : 'bg-white border-slate-300 hover:border-emerald-400'
                      }`}
                    >
                      {selectedIds.has(teacher.id) && (
                        <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>

                    {/* Card */}
                    <div className={`ml-2 transition-all ${selectedIds.has(teacher.id) ? 'ring-2 ring-emerald-400 rounded-xl' : ''}`}>
                      <MiniIdCard teacher={teacher} orgName={orgName} />
                    </div>

                    {/* Print single */}
                    <button
                      onClick={() => printCards([teacher.id])}
                      title="Print this teacher's ID card"
                      className="absolute bottom-2 right-2 z-10 flex items-center gap-1 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold px-2 py-1 rounded-lg shadow-sm transition-colors"
                    >
                      <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 9 6 2 18 2 18 9" />
                        <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                        <rect x="6" y="14" width="12" height="8" />
                      </svg>
                      Print
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}

        </div>
      </div>
    </div>
  )
}

export default function ScheduledTeacherPage() {
  return (
    <AuthGuard allowedRoles={['ADMIN', 'WATTAMAN']}>
      <ScheduledTeacherContent />
    </AuthGuard>
  )
}

