'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '../../../../components/Sidebar'
import AuthGuard from '../../../../components/AuthGuard'
import { adminNav } from '../../../../lib/admin-nav'
import { apiFetch } from '../../../../lib/api'

interface TimetableListItem { id: string; name: string; academicYear: string }
interface TClass { id: string; name: string; short: string }
interface TLesson {
  id: string; perWeek: number; lessonType: string
  teacher: { lastName: string; firstName: string; short: string }
  subject: { name: string; short: string }
  class: { name: string; short: string }
}
interface TTeacher {
  id: string; lastName: string; firstName: string; short: string
  sex: string | null; email: string | null; phone: string | null
  color: string | null; classTeacherId: string | null
  classTeacher: TClass | null
  lessons?: TLesson[]
}

const COLOR_PALETTE = [
  '#ef4444','#f97316','#f59e0b','#22c55e','#14b8a6',
  '#06b6d4','#3b82f6','#6366f1','#8b5cf6','#ec4899','#22d3ee',
]
const LESSON_TYPES = ['SINGLE','DOUBLE','TRIPLE']

export default function TeachersPage() {
  const router = useRouter()
  const [timetables, setTimetables] = useState<TimetableListItem[]>([])
  const [selectedTT, setSelectedTT] = useState('')
  const [teachers, setTeachers] = useState<TTeacher[]>([])
  const [classes, setClasses] = useState<TClass[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedTeacher, setSelectedTeacher] = useState<TTeacher | null>(null)

  // Teacher modal
  const [showTeacherModal, setShowTeacherModal] = useState(false)
  const [editingTeacher, setEditingTeacher] = useState<TTeacher | null>(null)
  const [fLastName, setFLastName] = useState('')
  const [fFirstName, setFFirstName] = useState('')
  const [fShort, setFShort] = useState('')
  const [fSex, setFSex] = useState('')
  const [fEmail, setFEmail] = useState('')
  const [fPhone, setFPhone] = useState('')
  const [fColor, setFColor] = useState('#22c55e')
  const [fClassTeacher, setFClassTeacher] = useState('')
  const [savingTeacher, setSavingTeacher] = useState(false)
  const [teacherError, setTeacherError] = useState('')
  const [deleteTeacherId, setDeleteTeacherId] = useState<string | null>(null)

  // Lesson modal
  const [showLessonModal, setShowLessonModal] = useState(false)
  const [editingLesson, setEditingLesson] = useState<TLesson | null>(null)
  const [allSubjects, setAllSubjects] = useState<{id: string; name: string; short: string}[]>([])
  const [fLTeacher, setFLTeacher] = useState('')
  const [fLSubject, setFLSubject] = useState('')
  const [fLClass, setFLClass] = useState('')
  const [fLPerWeek, setFLPerWeek] = useState(2)
  const [fLType, setFLType] = useState('SINGLE')
  const [savingLesson, setSavingLesson] = useState(false)
  const [deleteLessonId, setDeleteLessonId] = useState<string | null>(null)

  const fetchAll = useCallback(async () => {
    const res = await apiFetch('/api/timetable')
    if (res.ok) {
      const list = await res.json()
      setTimetables(list)
      if (list.length > 0 && !selectedTT) setSelectedTT(list[0].id)
    }
  }, [selectedTT])

  const fetchTimetableData = useCallback(async () => {
    if (!selectedTT) return
    setLoading(true)
    const res = await apiFetch(`/api/timetable/${selectedTT}`)
    if (res.ok) {
      const tt = await res.json()
      setTeachers(tt.teachers ?? [])
      setClasses(tt.classes ?? [])
      setAllSubjects(tt.subjects ?? [])
    }
    setLoading(false)
  }, [selectedTT])

  useEffect(() => { fetchAll() }, [fetchAll])
  useEffect(() => { fetchTimetableData() }, [fetchTimetableData])

  function openTeacherModal(item?: TTeacher) {
    setEditingTeacher(item ?? null)
    setFLastName(item?.lastName ?? ''); setFFirstName(item?.firstName ?? '')
    setFShort(item?.short ?? ''); setFSex(item?.sex ?? '')
    setFEmail(item?.email ?? ''); setFPhone(item?.phone ?? '')
    setFColor(item?.color ?? '#22c55e'); setFClassTeacher(item?.classTeacherId ?? '')
    setTeacherError('')
    setShowTeacherModal(true)
  }

  async function saveTeacher() {
    if (!selectedTT || !fLastName || !fFirstName || !fShort) return
    setSavingTeacher(true)
    setTeacherError('')
    const url = editingTeacher ? `/api/timetable/teachers/${editingTeacher.id}` : `/api/timetable/${selectedTT}/teachers`
    const res = await apiFetch(url, {
      method: editingTeacher ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lastName: fLastName, firstName: fFirstName, short: fShort,
        sex: fSex || null, email: fEmail || null, phone: fPhone || null,
        color: fColor, classTeacherId: fClassTeacher || null,
      }),
    })
    if (res.ok) {
      await fetchTimetableData(); setShowTeacherModal(false)
    } else {
      const err = await res.json().catch(() => ({}))
      const reason = Array.isArray(err?.message) ? err.message[0] : (err?.message ?? `Error ${res.status}`)
      setTeacherError(reason)
    }
    setSavingTeacher(false)
  }

  async function deleteTeacher(id: string) {
    await apiFetch(`/api/timetable/teachers/${id}`, { method: 'DELETE' })
    await fetchTimetableData(); setDeleteTeacherId(null); setSelectedTeacher(null)
  }

  function openLessonModal(item?: TLesson, teacherId?: string) {
    setEditingLesson(item ?? null)
    setFLTeacher(item?.teacher ? (teachers.find(t => t.short === item.teacher.short)?.id ?? '') : (teacherId ?? ''))
    setFLSubject(item ? (allSubjects.find(s => s.short === item.subject.short)?.id ?? '') : '')
    setFLClass(item ? (classes.find(c => c.short === item.class.short)?.id ?? '') : '')
    setFLPerWeek(item?.perWeek ?? 2); setFLType(item?.lessonType ?? 'SINGLE')
    setShowLessonModal(true)
  }

  async function saveLesson() {
    if (!selectedTT || !fLTeacher || !fLSubject || !fLClass) return
    setSavingLesson(true)
    const url = editingLesson ? `/api/timetable/lessons/${editingLesson.id}` : `/api/timetable/${selectedTT}/lessons`
    await apiFetch(url, {
      method: editingLesson ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teacherId: fLTeacher, subjectId: fLSubject, classId: fLClass, perWeek: fLPerWeek, lessonType: fLType }),
    })
    await fetchTimetableData(); setShowLessonModal(false); setSavingLesson(false)
  }

  async function deleteLesson(id: string) {
    await apiFetch(`/api/timetable/lessons/${id}`, { method: 'DELETE' })
    await fetchTimetableData(); setDeleteLessonId(null)
  }

  // Get lessons for currently selected teacher (for sidebar detail view)
  const teacherLessons = teachers.flatMap(t =>
    t.lessons ? t.lessons.map(l => ({ ...l, _teacherId: t.id })) : []
  ).filter(l => l._teacherId === selectedTeacher?.id)

  // Since the API returns all lessons in timetable, filter by teacher from full data
  // We need to get lessons from the timetable response - they're on teachers via separate fetch
  // The teacher has .lessons when the full timetable is fetched with includes

  return (
    <AuthGuard allowedRoles={['ADMIN']}>
      <div className="flex h-screen bg-gray-100">
        <Sidebar title="Admin Panel" subtitle="Wattaman" navItems={adminNav} accentColor="indigo" />
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
            <div>
              <button onClick={() => router.push('/admin/timetable')} className="text-indigo-600 text-sm hover:underline mb-1">← Back to Timetable</button>
              <h1 className="text-xl font-bold text-gray-800">Teachers</h1>
              <p className="text-sm text-gray-500">Manage timetable teachers and their lesson contracts</p>
            </div>
            <button onClick={() => openTeacherModal()} className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium text-sm hover:bg-indigo-700">+ New Teacher</button>
          </div>
          <div className="bg-white border-b border-gray-200 px-6 py-2 flex items-center gap-3">
            <label className="text-sm text-gray-600 font-medium">Timetable:</label>
            <select className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              value={selectedTT} onChange={e => setSelectedTT(e.target.value)}>
              {timetables.map(tt => <option key={tt.id} value={tt.id}>{tt.name} · {tt.academicYear}</option>)}
            </select>
            <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-0.5 ml-2">
              Timetable teachers are separate from the school's main teacher accounts
            </span>
          </div>

          <div className="flex-1 overflow-auto p-6">
            {loading ? <div className="text-gray-400 text-center py-20">Loading…</div>
              : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Teacher list */}
                  <div className="lg:col-span-2">
                    {teachers.length === 0 ? (
                      <div className="text-center py-20 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
                        <p className="text-lg mb-2">No teachers yet</p>
                        <p className="text-sm">Click "+ New Teacher" to add one.</p>
                      </div>
                    ) : (
                      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                        <table className="w-full text-sm">
                          <thead><tr className="bg-gray-50 border-b border-gray-200">
                            <th className="px-4 py-3 text-left font-semibold text-gray-600">Name</th>
                            <th className="px-4 py-3 text-left font-semibold text-gray-600">Short</th>
                            <th className="px-4 py-3 text-left font-semibold text-gray-600">Contact</th>
                            <th className="px-4 py-3 text-left font-semibold text-gray-600">Class Teacher</th>
                            <th className="px-4 py-3 text-right font-semibold text-gray-600">Actions</th>
                          </tr></thead>
                          <tbody>
                            {teachers.map(t => (
                              <tr key={t.id}
                                className={`border-b border-gray-100 cursor-pointer ${selectedTeacher?.id === t.id ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}
                                onClick={() => setSelectedTeacher(t)}>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
                                    <span className="w-3 h-3 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: t.color ?? '#22c55e' }} />
                                    <span className="font-medium text-gray-800">{t.lastName} {t.firstName}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <span className="inline-block rounded px-2 py-0.5 text-xs font-semibold text-white"
                                    style={{ backgroundColor: t.color ?? '#22c55e' }}>{t.short}</span>
                                </td>
                                <td className="px-4 py-3 text-gray-500 text-xs">
                                  {t.email && <div>{t.email}</div>}
                                  {t.phone && <div>{t.phone}</div>}
                                </td>
                                <td className="px-4 py-3 text-gray-600 text-sm">
                                  {t.classTeacher?.short ?? '—'}
                                </td>
                                <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                                  <button onClick={() => openTeacherModal(t)} className="text-blue-600 hover:underline text-sm mr-2">Edit</button>
                                  <button onClick={() => { openLessonModal(undefined, t.id); }} className="text-emerald-600 hover:underline text-sm mr-2">+ Lesson</button>
                                  <button onClick={() => setDeleteTeacherId(t.id)} className="text-red-500 hover:underline text-sm">Remove</button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Lesson contracts panel */}
                  <div className="bg-white rounded-xl border border-gray-200 flex flex-col">
                    <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                      <h3 className="font-semibold text-gray-700 text-sm">
                        {selectedTeacher ? `${selectedTeacher.lastName} ${selectedTeacher.firstName} — Lessons` : 'Select a teacher'}
                      </h3>
                      {selectedTeacher && (
                        <button onClick={() => openLessonModal(undefined, selectedTeacher.id)}
                          className="text-xs bg-indigo-600 text-white px-2 py-1 rounded font-medium">+ New Lesson</button>
                      )}
                    </div>
                    <div className="flex-1 overflow-auto p-3">
                      {!selectedTeacher ? (
                        <p className="text-gray-400 text-xs text-center mt-8">Click a teacher row to see their lesson contracts</p>
                      ) : (
                        <div className="space-y-2">
                          {/* All lessons are embedded in timetable response under teachers if included */}
                          <p className="text-xs text-gray-400 text-center mt-4">
                            Use "+ New Lesson" to add lesson contracts.<br/>All lessons are also visible in the wizard.
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="px-4 py-3 border-t border-gray-200">
                      <button onClick={() => router.push('/admin/timetable/teacher-attendance')}
                        className="w-full text-sm text-indigo-600 hover:underline">
                        → Teacher Attendance Report
                      </button>
                    </div>
                  </div>
                </div>
              )}
          </div>
        </div>
      </div>

      {/* Teacher modal */}
      {showTeacherModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-bold text-gray-800">{editingTeacher ? 'Edit Teacher' : 'New Teacher'}</h2>
              <button onClick={() => setShowTeacherModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Last Name</label>
                  <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={fLastName} onChange={e => setFLastName(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">First Name</label>
                  <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={fFirstName} onChange={e => setFFirstName(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Short Name</label>
                <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={fShort} onChange={e => setFShort(e.target.value)} maxLength={8} placeholder="e.g. SmithJ" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Sex</label>
                <div className="flex gap-4">
                  {['MALE','FEMALE'].map(s => (
                    <label key={s} className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input type="radio" name="teacher-sex" value={s} checked={fSex === s} onChange={() => setFSex(s)} />
                      {s === 'MALE' ? 'Male' : 'Female'}
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">E-mail</label>
                  <input type="email" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={fEmail} onChange={e => setFEmail(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Phone</label>
                  <input className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={fPhone} onChange={e => setFPhone(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Class Teacher for</label>
                <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={fClassTeacher} onChange={e => setFClassTeacher(e.target.value)}>
                  <option value="">— None —</option>
                  {classes
                    .filter(c => {
                      // Only show classes not already used as classTeacherId by another teacher
                      const usedByOther = teachers.some(
                        t => t.classTeacherId === c.id && t.id !== editingTeacher?.id
                      )
                      return !usedByOther
                    })
                    .map(c => <option key={c.id} value={c.id}>{c.name}</option>)
                  }
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-2">Color</label>
                <div className="flex flex-wrap gap-2 items-center">
                  {COLOR_PALETTE.map(c => (
                    <button key={c} type="button" onClick={() => setFColor(c)}
                      className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 ${fColor === c ? 'border-gray-800 scale-110' : 'border-transparent'}`}
                      style={{ backgroundColor: c }} />
                  ))}
                  <input type="color" value={fColor} onChange={e => setFColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0" />
                </div>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-gray-200 flex flex-col gap-2">
              {teacherError && (
                <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs">
                  ⚠️ {teacherError}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowTeacherModal(false)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium">Cancel</button>
                <button onClick={saveTeacher} disabled={savingTeacher || !fLastName || !fFirstName || !fShort}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-40">
                  {savingTeacher ? 'Saving…' : 'OK'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lesson modal */}
      {showLessonModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="font-bold text-gray-800">{editingLesson ? 'Edit Lesson' : 'New Lesson'}</h2>
              <button onClick={() => setShowLessonModal(false)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>
            <div className="px-5 py-4 space-y-4">
              {[
                { label: 'Teacher', val: fLTeacher, set: setFLTeacher, opts: teachers.map(t => ({ id: t.id, name: `${t.lastName} ${t.firstName}` })) },
                { label: 'Subject', val: fLSubject, set: setFLSubject, opts: allSubjects.map(s => ({ id: s.id, name: s.name })) },
                { label: 'Class', val: fLClass, set: setFLClass, opts: classes.map(c => ({ id: c.id, name: c.name })) },
              ].map(({ label, val, set, opts }) => (
                <div key={label}>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
                  <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    value={val} onChange={e => set(e.target.value)}>
                    <option value="">Select {label.toLowerCase()}</option>
                    {opts.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </div>
              ))}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Lessons / Week</label>
                <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={fLPerWeek} onChange={e => setFLPerWeek(+e.target.value)}>
                  {[1,2,3,4,5,6,7,8].map(n => <option key={n} value={n}>{n} per week</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Type</label>
                <select className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  value={fLType} onChange={e => setFLType(e.target.value)}>
                  {LESSON_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
              <button onClick={() => setShowLessonModal(false)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium">Cancel</button>
              <button onClick={saveLesson} disabled={savingLesson || !fLTeacher || !fLSubject || !fLClass}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-40">
                {savingLesson ? 'Saving…' : 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirms */}
      {deleteTeacherId && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 text-center">
            <p className="text-gray-800 font-semibold mb-4">Remove this teacher? Their lesson contracts will also be removed.</p>
            <div className="flex justify-center gap-3">
              <button onClick={() => setDeleteTeacherId(null)} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm">Cancel</button>
              <button onClick={() => deleteTeacher(deleteTeacherId)} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm">Remove</button>
            </div>
          </div>
        </div>
      )}
    </AuthGuard>
  )
}
