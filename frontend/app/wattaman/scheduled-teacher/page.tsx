'use client'

import { useState, useEffect } from 'react'
import AuthGuard from '../../../components/AuthGuard'
import Sidebar from '../../../components/Sidebar'
import { adminNav } from '../../../lib/admin-nav'
import { apiFetch } from '../../../lib/api'
import Link from 'next/link'

interface ScheduledTeacher {
  id: string
  timetableId: string
  timetableName: string
  timetableStatus: string
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

// -- Color swatch palette ----------------------------------------------------
const COLORS = [
  '#00C9A7','#4F46E5','#EC4899','#F59E0B','#10B981',
  '#3B82F6','#EF4444','#8B5CF6','#06B6D4','#84CC16',
  '#F97316','#64748B',
]

// -- Edit Modal --------------------------------------------------------------
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
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
    } catch {
      setError('Failed to save. Please try again.')
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-bold text-slate-800 mb-4">Edit Teacher</h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">First Name *</label>
              <input value={form.firstName} onChange={e => set('firstName', e.target.value)} required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="First name" />
            </div>
            <div>
              <label className="form-label">Last Name *</label>
              <input value={form.lastName} onChange={e => set('lastName', e.target.value)} required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Last name" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="form-label">Short Code *</label>
              <input
                value={form.short}
                onChange={e => set('short', e.target.value.toUpperCase())}
                maxLength={6}
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono uppercase"
                placeholder="e.g. SMITH"
              />
            </div>
            <div>
              <label className="form-label">Sex</label>
              <select value={form.sex} onChange={e => set('sex', e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="">— unset —</option>
                <option value="MALE">Male</option>
                <option value="FEMALE">Female</option>
              </select>
            </div>
          </div>
          <div>
            <label className="form-label">Email</label>
            <input type="email" value={form.email} onChange={e => set('email', e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="teacher@school.edu" />
          </div>
          <div>
            <label className="form-label">Phone</label>
            <input value={form.phone} onChange={e => set('phone', e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="+855..." />
          </div>
          <div>
            <label className="form-label">Card Color</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {COLORS.map(c => (
                <button
                  key={c}
                  type="button"
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
          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={onClose} className="btn-outline btn-sm">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary btn-sm">{saving ? 'Saving...' : 'Save Changes'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

// -- Main content -------------------------------------------------------------
function ManageTeachersContent() {
  const [teachers, setTeachers] = useState<ScheduledTeacher[]>([])
  const [loading, setLoading] = useState(true)
  const [timetableFilter, setTimetableFilter] = useState('ALL')
  const [search, setSearch] = useState('')
  const [editTeacher, setEditTeacher] = useState<ScheduledTeacher | null>(null)
  const [message, setMessage] = useState('')
  const [msgType, setMsgType] = useState<'success' | 'error'>('success')
  const [orgName, setOrgName] = useState<string>('School')

  useEffect(() => {
    const saved = localStorage.getItem('wattaman-org-name')
    if (saved) setOrgName(saved)
    fetchTeachers()
  }, [])

  const fetchTeachers = async () => {
    setLoading(true)
    try {
      const res = await apiFetch('/api/timetable/scheduled-teachers/all')
      if (!res.ok) throw new Error()
      setTeachers(await res.json())
    } catch {
      showMsg('Failed to load teachers.', 'error')
    } finally {
      setLoading(false)
    }
  }

  const showMsg = (text: string, type: 'success' | 'error') => {
    setMessage(text)
    setMsgType(type)
    setTimeout(() => setMessage(''), 4000)
  }

  const applyEdit = (id: string, patch: Partial<ScheduledTeacher>) => {
    setTeachers(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t))
    setEditTeacher(null)
    showMsg('Teacher updated!', 'success')
  }

  const timetables = [...new Map(teachers.map(t => [t.timetableId, { name: t.timetableName, status: t.timetableStatus }])).entries()]

  const filtered = teachers.filter(t => {
    if (timetableFilter !== 'ALL' && t.timetableId !== timetableFilter) return false
    if (search) {
      const q = search.toLowerCase()
      return (
        t.name.toLowerCase().includes(q) ||
        t.short.toLowerCase().includes(q) ||
        (t.email || '').toLowerCase().includes(q) ||
        (t.phone || '').toLowerCase().includes(q) ||
        t.timetableName.toLowerCase().includes(q)
      )
    }
    return true
  })

  const printCards = (ids: string[]) => {
    window.open(
      `/wattaman/scheduled-teacher/print?teacherIds=${ids.join(',')}&orgName=${encodeURIComponent(orgName)}`,
      '_blank'
    )
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar title="Admin" subtitle="Wattanman" navItems={adminNav} accentColor="indigo" />

      <main className="flex-1 lg:ml-0">
        <div className="lg:hidden h-14" />
        <div className="page-shell">
          <div className="page-content">

            {/* Header */}
            <div className="page-header">
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Manage Scheduled Teachers</h1>
                <p className="text-sm text-slate-500 mt-1">
                  {filtered.length} teacher{filtered.length !== 1 ? 's' : ''} · {timetables.length} timetable{timetables.length !== 1 ? 's' : ''}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => printCards(filtered.map(t => t.id))}
                  disabled={filtered.length === 0}
                  className="btn-primary flex items-center gap-1"
                >
                  Print ID Cards
                </button>
              </div>
            </div>

            {/* Messages */}
            {message && (
              <div className={`mx-4 mb-4 p-3 rounded-lg text-sm font-medium ${msgType === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                {message}
              </div>
            )}

            <div className="page-body space-y-4">

              {/* Timetable tabs */}
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => setTimetableFilter('ALL')}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${timetableFilter === 'ALL' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200 hover:border-indigo-300'}`}
                >
                  All Timetables ({teachers.length})
                </button>
                {timetables.map(([id, { name, status }]) => (
                  <button
                    key={id}
                    onClick={() => setTimetableFilter(id)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-1.5 ${timetableFilter === id ? 'bg-indigo-600 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200 hover:border-indigo-300'}`}
                  >
                    {name} ({teachers.filter(t => t.timetableId === id).length})
                    <span className={`text-xs px-1 py-0.5 rounded ${timetableFilter === id ? 'bg-white/20 text-white' : status === 'PUBLISHED' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {status}
                    </span>
                  </button>
                ))}
              </div>

              {/* Search + Attendance Report link */}
              <div className="flex flex-wrap items-center gap-3">
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search name, short code, email..."
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm w-64"
                />
                {timetableFilter !== 'ALL' && (
                  <Link
                    href={`/wattaman/teacher-reports?timetableId=${timetableFilter}`}
                    className="btn-outline flex items-center gap-1 text-sm"
                  >
                    Attendance Report
                  </Link>
                )}
              </div>

              {/* Table */}
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : teachers.length === 0 ? (
                <div className="card p-12 text-center">
                  <p className="text-4xl mb-3">No teachers found</p>
                  <p className="font-semibold text-slate-600">No scheduled teachers</p>
                  <p className="text-sm text-slate-400 mt-1">Add teachers to a timetable first.</p>
                </div>
              ) : (
                <div className="card">
                  <div className="table-container">
                    <table>
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>Short</th>
                          <th>Timetable</th>
                          <th>Sex</th>
                          <th>Email</th>
                          <th>Phone</th>
                          <th>Lessons/wk</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map(teacher => (
                          <tr key={teacher.id}>
                            <td>
                              <div className="flex items-center gap-3">
                                <div
                                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                                  style={{ background: teacher.color || '#00C9A7' }}
                                >
                                  {teacher.short.charAt(0)}
                                </div>
                                <span className="font-medium text-slate-800">{teacher.name}</span>
                              </div>
                            </td>
                            <td>
                              <span className="badge-gray font-mono text-xs">{teacher.short}</span>
                            </td>
                            <td className="text-slate-500">
                              <div className="flex items-center gap-1.5">
                                {teacher.timetableName}
                                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${teacher.timetableStatus === 'PUBLISHED' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                  {teacher.timetableStatus}
                                </span>
                              </div>
                            </td>
                            <td className="text-slate-500">
                              {teacher.sex === 'MALE' ? 'Male' : teacher.sex === 'FEMALE' ? 'Female' : '—'}
                            </td>
                            <td className="text-slate-500">{teacher.email || '—'}</td>
                            <td className="text-slate-500">{teacher.phone || '—'}</td>
                            <td className="text-slate-500">{teacher.weeklyLessons}</td>
                            <td>
                              <div className="flex gap-1">
                                <button onClick={() => setEditTeacher(teacher)} className="btn-outline btn-sm">Edit</button>
                                <button onClick={() => printCards([teacher.id])} className="btn-outline btn-sm" title="Print ID card">Print</button>
                                <Link href={`/wattaman/teacher-reports?timetableId=${teacher.timetableId}`} className="btn-outline btn-sm" title="Attendance report">Report</Link>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {filtered.length === 0 && (
                          <tr>
                            <td colSpan={8} className="text-center text-slate-400 py-8">No teachers match your search.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Edit Modal */}
        {editTeacher && (
          <EditModal
            teacher={editTeacher}
            onClose={() => setEditTeacher(null)}
            onSaved={(patch) => applyEdit(editTeacher.id, patch)}
          />
        )}
      </main>
    </div>
  )
}

export default function ManageTeachersPage() {
  return (
    <AuthGuard requiredRole="ADMIN">
      <ManageTeachersContent />
    </AuthGuard>
  )
}
