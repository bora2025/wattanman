'use client'

import { useState, useEffect } from 'react'
import AuthGuard from '../../../components/AuthGuard'
import Sidebar from '../../../components/Sidebar'
import { wattamanNav } from '../../../lib/wattaman-nav'
import { apiFetch } from '../../../lib/api'
import { getCurrentUser } from '../../../lib/api'
import QRCode from 'qrcode'
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
  email?: string | null
  phone?: string | null
  weeklyLessons: number
  lessons: { id: string; subjectName: string; className: string; perWeek: number }[]
  todayPeriods: number[]
  totalEntries: number
}

// ── Color swatch palette ────────────────────────────────────────────────────
const COLORS = [
  '#00C9A7','#4F46E5','#EC4899','#F59E0B','#10B981',
  '#3B82F6','#EF4444','#8B5CF6','#06B6D4','#84CC16',
  '#F97316','#64748B',
]

// ── MiniIdCard ──────────────────────────────────────────────────────────────
function MiniIdCard({ teacher, orgName }: { teacher: ScheduledTeacher; orgName: string }) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('')
  const color = teacher.color || '#00C9A7'
  const uniqueSubjects = [...new Set(teacher.lessons.map(l => l.subjectName))]

  useEffect(() => {
    if (teacher.qrCode) {
      QRCode.toDataURL(teacher.qrCode, {
        width: 160, margin: 1,
        color: { dark: '#1e293b', light: '#ffffff' },
        errorCorrectionLevel: 'M',
      }).then(setQrDataUrl).catch(() => {})
    }
  }, [teacher.qrCode])

  return (
    <div style={{ border: `2px solid ${color}33`, borderLeft: `4px solid ${color}` }}
      className="bg-white rounded-xl overflow-hidden flex w-full"
    >
      <div className="flex-1 p-3 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-slate-800 text-sm leading-tight">{teacher.name}</span>
          <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{ background: color + '22', color }}>
            {teacher.short}
          </span>
          {teacher.sex && (
            <span className="text-xs text-slate-400">{teacher.sex === 'MALE' ? '♂' : '♀'}</span>
          )}
        </div>
        <div className="text-xs text-slate-400 mt-0.5">{teacher.timetableName}</div>
        <div className="mt-1.5 space-y-0.5">
          {uniqueSubjects.slice(0, 3).map((s, i) => (
            <div key={i} className="text-xs text-slate-600 truncate"><span className="text-slate-400">•</span> {s}</div>
          ))}
          {uniqueSubjects.length > 3 && <div className="text-xs text-slate-400">+{uniqueSubjects.length - 3} more</div>}
        </div>
        <div className="mt-2 flex gap-2 text-xs text-slate-500">
          <span>{teacher.weeklyLessons} lessons/wk</span>
          <span>·</span>
          <span>{teacher.totalEntries} scheduled entries</span>
        </div>
        {(teacher.email || teacher.phone) && (
          <div className="mt-1 flex flex-col gap-0.5">
            {teacher.email && <span className="text-xs text-slate-400 truncate">{teacher.email}</span>}
            {teacher.phone && <span className="text-xs text-slate-400">{teacher.phone}</span>}
          </div>
        )}
      </div>
      <div className="flex flex-col items-center justify-center p-3 border-l border-slate-100 bg-slate-50 flex-shrink-0 gap-1">
        {qrDataUrl ? (
          <img src={qrDataUrl} alt="QR" className="w-16 h-16 block" />
        ) : teacher.qrCode ? (
          <div className="w-16 h-16 bg-slate-200 rounded animate-pulse" />
        ) : (
          <div className="w-16 h-16 bg-slate-100 rounded flex items-center justify-center">
            <span className="text-xs text-slate-400 text-center leading-tight">No<br />QR</span>
          </div>
        )}
        <span className="text-xs text-slate-400 text-center leading-tight">QR Code</span>
      </div>
    </div>
  )
}

// ── Edit Modal ──────────────────────────────────────────────────────────────
interface EditForm {
  firstName: string
  lastName: string
  short: string
  sex: string
  email: string
  phone: string
  color: string
}

function EditModal({
  teacher, onClose, onSaved,
}: {
  teacher: ScheduledTeacher
  onClose: () => void
  onSaved: (updated: Partial<ScheduledTeacher>) => void
}) {
  const nameParts = teacher.name.split(' ')
  const [form, setForm] = useState<EditForm>({
    firstName: nameParts.slice(0, -1).join(' ') || nameParts[0],
    lastName: nameParts.length > 1 ? nameParts[nameParts.length - 1] : '',
    short: teacher.short ?? '',
    sex: teacher.sex ?? '',
    email: teacher.email ?? '',
    phone: teacher.phone ?? '',
    color: teacher.color ?? '#00C9A7',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (key: keyof EditForm, val: string) => setForm(f => ({ ...f, [key]: val }))

  const save = async () => {
    if (!form.firstName.trim() || !form.lastName.trim() || !form.short.trim()) {
      setError('First name, last name and short code are required.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await apiFetch(`/api/timetable/teachers/${teacher.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          short: form.short.trim(),
          sex: form.sex || null,
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          color: form.color,
        }),
      })
      if (!res.ok) throw new Error('Save failed')
      onSaved({
        name: `${form.firstName.trim()} ${form.lastName.trim()}`,
        short: form.short.trim(),
        sex: form.sex || null,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        color: form.color,
      })
      onClose()
    } catch {
      setError('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-800 text-base">Edit Teacher</h3>
            <p className="text-xs text-slate-500 mt-0.5">{teacher.timetableName}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">First Name *</label>
              <input
                value={form.firstName}
                onChange={e => set('firstName', e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Last Name *</label>
              <input
                value={form.lastName}
                onChange={e => set('lastName', e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Short Code *</label>
              <input
                value={form.short}
                onChange={e => set('short', e.target.value.toUpperCase())}
                maxLength={6}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400 font-mono uppercase"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 block mb-1">Sex</label>
              <select
                value={form.sex}
                onChange={e => set('sex', e.target.value)}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              >
                <option value="">— unset —</option>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={e => set('email', e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              placeholder="teacher@school.edu"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">Phone</label>
            <input
              value={form.phone}
              onChange={e => set('phone', e.target.value)}
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              placeholder="+855..."
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">Card Color</label>
            <div className="flex flex-wrap gap-2">
              {COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => set('color', c)}
                  className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 ${form.color === c ? 'border-slate-700 scale-110' : 'border-transparent'}`}
                  style={{ background: c }}
                  title={c}
                />
              ))}
              <input
                type="color"
                value={form.color}
                onChange={e => set('color', e.target.value)}
                className="w-7 h-7 rounded-full cursor-pointer border border-slate-200 p-0"
                title="Custom color"
              />
            </div>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-5 pt-0">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50 font-semibold"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main content ─────────────────────────────────────────────────────────────
function ManageTeachersContent() {
  const [teachers, setTeachers] = useState<ScheduledTeacher[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [selectedTimetable, setSelectedTimetable] = useState<string>('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [orgName, setOrgName] = useState<string>('School')
  const [editingOrg, setEditingOrg] = useState(false)
  const [editTeacher, setEditTeacher] = useState<ScheduledTeacher | null>(null)
  const [userRole, setUserRole] = useState<string>('')

  useEffect(() => {
    const saved = localStorage.getItem('wattaman-org-name')
    if (saved) setOrgName(saved)
    getCurrentUser().then(u => { if (u) setUserRole(u.role) })
  }, [])

  useEffect(() => { fetchTeachers() }, [])

  const fetchTeachers = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await apiFetch('/api/timetable/scheduled-teachers/all')
      if (!res.ok) throw new Error()
      setTeachers(await res.json())
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

  const applyEdit = (id: string, patch: Partial<ScheduledTeacher>) => {
    setTeachers(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t))
  }

  const timetables = [...new Map(teachers.map(t => [t.timetableId, t.timetableName])).entries()]

  const filtered = teachers.filter(t => {
    const matchTT = selectedTimetable === 'all' || t.timetableId === selectedTimetable
    const q = search.toLowerCase()
    const matchQ = !q || t.name.toLowerCase().includes(q) || t.short.toLowerCase().includes(q) ||
      t.lessons.some(l => l.subjectName.toLowerCase().includes(q) || l.className.toLowerCase().includes(q))
    return matchTT && matchQ
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

  const printCards = (ids: string[]) => {
    window.open(`/wattaman/scheduled-teacher/print?teacherIds=${ids.join(',')}&orgName=${encodeURIComponent(orgName)}`, '_blank')
  }

  const canEdit = userRole === 'ADMIN'

  return (
    <div className="page-shell">
      <Sidebar
        title="Wattaman"
        subtitle="QR Attendance"
        navItems={wattamanNav}
        accentColor="emerald"
        bottomTabs={['/wattaman', '/wattaman/scan', '/wattaman/teacher-reports']}
      />
      <div className="page-content">
        <div className="h-14 lg:hidden" />

        {/* Header */}
        <div className="page-header">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Manage Scheduled Teachers</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Teachers from timetables · Edit info · Print ID cards · View attendance reports
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => printCards(selectedIds.size > 0 ? [...selectedIds] : filtered.map(t => t.id))}
                disabled={filtered.length === 0}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors shadow-sm"
              >
                <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 6 2 18 2 18 9" />
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                  <rect x="6" y="14" width="12" height="8" />
                </svg>
                {selectedIds.size > 0 ? `Print ${selectedIds.size}` : `Print All (${filtered.length})`}
              </button>
            </div>
          </div>
        </div>

        <div className="page-body space-y-4">

          {/* Org name + timetable filter */}
          <div className="flex flex-col sm:flex-row gap-3">
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
                  placeholder="School / Organization name for ID cards"
                />
              ) : (
                <button onClick={() => setEditingOrg(true)} className="flex-1 text-sm text-slate-700 text-left truncate hover:text-slate-900">
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

            {timetables.length > 1 && (
              <select
                value={selectedTimetable}
                onChange={e => setSelectedTimetable(e.target.value)}
                className="bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              >
                <option value="all">All Timetables ({teachers.length})</option>
                {timetables.map(([id, name]) => (
                  <option key={id} value={id}>{name} ({teachers.filter(t => t.timetableId === id).length})</option>
                ))}
              </select>
            )}
          </div>

          {/* Search + select-all */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search teacher name, short code, subject…"
                className="w-full pl-9 pr-4 py-2.5 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-400 text-slate-700 placeholder:text-slate-400"
              />
            </div>
            {filtered.length > 0 && (
              <button
                onClick={() => setSelectedIds(selectedIds.size === filtered.length ? new Set() : new Set(filtered.map(t => t.id)))}
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
              <p className="text-xs mt-1">Add teachers to a timetable first.</p>
            </div>
          )}
          {!loading && filtered.length === 0 && teachers.length > 0 && (
            <div className="text-center py-8 text-slate-400 text-sm">No teachers match your search.</div>
          )}

          {/* Groups */}
          {Object.entries(grouped).map(([timetableId, groupTeachers]) => (
            <div key={timetableId} className="space-y-3">
              {/* Group header */}
              <div className="flex items-center gap-2 px-1 flex-wrap">
                <div className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{groupTeachers[0].timetableName}</p>
                <span className="text-xs text-slate-400">· {groupTeachers.length} teacher{groupTeachers.length !== 1 ? 's' : ''}</span>
                <div className="ml-auto flex items-center gap-3">
                  {/* Attendance report link */}
                  <Link
                    href={`/wattaman/teacher-reports?timetableId=${timetableId}`}
                    className="text-xs text-indigo-600 hover:underline flex items-center gap-1"
                  >
                    <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
                    </svg>
                    Attendance Report
                  </Link>
                  <span className="text-slate-200">|</span>
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
                  <span className="text-slate-200">|</span>
                  <button
                    onClick={() => {
                      const allSel = groupTeachers.every(t => selectedIds.has(t.id))
                      setSelectedIds(prev => {
                        const next = new Set(prev)
                        if (allSel) groupTeachers.forEach(t => next.delete(t.id))
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

              {/* Teacher grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {groupTeachers.map(teacher => (
                  <div key={teacher.id} className="relative">
                    {/* Checkbox */}
                    <button
                      onClick={() => toggleSelect(teacher.id)}
                      className={`absolute top-2 left-2 z-10 w-5 h-5 rounded flex items-center justify-center border-2 transition-colors shadow-sm bg-white ${
                        selectedIds.has(teacher.id) ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 hover:border-emerald-400'
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

                    {/* Actions row */}
                    <div className="flex gap-1.5 mt-1.5 ml-2">
                      {canEdit && (
                        <button
                          onClick={() => setEditTeacher(teacher)}
                          className="flex items-center gap-1 text-xs font-semibold bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 px-2.5 py-1.5 rounded-lg shadow-sm transition-colors"
                        >
                          <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                          Edit
                        </button>
                      )}
                      <button
                        onClick={() => printCards([teacher.id])}
                        className="flex items-center gap-1 text-xs font-semibold bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 px-2.5 py-1.5 rounded-lg shadow-sm transition-colors"
                      >
                        <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="6 9 6 2 18 2 18 9" />
                          <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                          <rect x="6" y="14" width="12" height="8" />
                        </svg>
                        Print
                      </button>
                      <Link
                        href={`/wattaman/teacher-reports?timetableId=${teacher.timetableId}`}
                        className="flex items-center gap-1 text-xs font-semibold bg-white border border-slate-200 hover:bg-slate-50 text-indigo-600 px-2.5 py-1.5 rounded-lg shadow-sm transition-colors"
                      >
                        <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                        Report
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

        </div>
      </div>

      {/* Edit Modal */}
      {editTeacher && (
        <EditModal
          teacher={editTeacher}
          onClose={() => setEditTeacher(null)}
          onSaved={(patch) => {
            applyEdit(editTeacher.id, patch)
            setEditTeacher(null)
          }}
        />
      )}
    </div>
  )
}

export default function ScheduledTeacherPage() {
  return (
    <AuthGuard allowedRoles={['ADMIN', 'WATTAMAN']}>
      <ManageTeachersContent />
    </AuthGuard>
  )
}
