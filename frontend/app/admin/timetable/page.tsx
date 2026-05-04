'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '../../../components/Sidebar'
import AuthGuard from '../../../components/AuthGuard'
import { adminNav } from '../../../lib/admin-nav'
import { apiFetch } from '../../../lib/api'
import { useLanguage } from '../../../lib/i18n'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Timetable {
  id: string; name: string; short: string | null; academicYear: string
  periodsPerDay: number; numberOfDays: number; weekend: string[]
  timeOffRules?: string | null; distribution?: string | null
  homeworkPrep?: string | null; maxOnDay?: number | null
  docNotes?: string | null; status: string
  subjects: TSubject[]; classes: TClass[]; classrooms: TClassroom[]
  teachers: TTeacher[]; lessons: TLesson[]; entries: TEntry[]
}
interface TSubject {
  id: string; name: string; short: string; color: string | null
  classroomCount: number; customFields: any
}
interface TClass {
  id: string; name: string; short: string; color: string | null
  printSubjectPicture: boolean; customFields: any; classTeachers?: TTeacher[]
}
interface TClassroom {
  id: string; name: string; short: string; color: string | null; customFields: any
}
interface TTeacher {
  id: string; lastName: string; firstName: string; short: string
  sex: string | null; email: string | null; phone: string | null
  color: string | null; classTeacherId: string | null; classTeacher?: TClass | null
}
interface TLesson {
  id: string; teacherId: string; subjectId: string; classId: string
  perWeek: number; lessonType: string
  teacher: TTeacher; subject: TSubject; class: TClass
}
interface TEntry {
  id: string; classId: string; teacherId: string; subjectId: string
  classroomId: string | null; day: number; period: number
  class: TClass; teacher: TTeacher; subject: TSubject; classroom: TClassroom | null
}
interface TimetableListItem {
  id: string; name: string; short: string | null; academicYear: string; status: string; createdAt: string
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const WEEKENDS = ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY']
const COLOR_PALETTE = [
  '#ef4444','#f97316','#f59e0b','#84cc16','#22c55e',
  '#14b8a6','#06b6d4','#3b82f6','#6366f1','#8b5cf6',
  '#a855f7','#ec4899','#64748b','#374151','#0f172a',
]
const WIZARD_STEPS = ['School Info', 'Subjects', 'Classes', 'Classrooms', 'Teachers & Contracts']

// ─── Toast ──────────────────────────────────────────────────────────────────

type Toast = { id: number; msg: string; ok: boolean }
let _toastId = 0

// ─── Helpers ─────────────────────────────────────────────────────────────────

function colorBadge(color: string | null, text: string) {
  return (
    <span className="inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold text-white"
      style={{ backgroundColor: color ?? '#6366f1' }}>{text}</span>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function TimetablePage() {
  const { t } = useLanguage()
  const router = useRouter()

  const [timetableList, setTimetableList] = useState<TimetableListItem[]>([])
  const [current, setCurrent] = useState<Timetable | null>(null)
  const [zoom, setZoom] = useState(1)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [showOpenModal, setShowOpenModal] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])

  function showToast(msg: string, ok = true) {
    const id = ++_toastId
    setToasts(prev => [...prev, { id, msg, ok }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500)
  }

  const [showWizard, setShowWizard] = useState(false)
  const [wizardStep, setWizardStep] = useState(0)
  const [wizardTimetableId, setWizardTimetableId] = useState<string | null>(null)
  const [wizardSaving, setWizardSaving] = useState(false)
  const [wizardError, setWizardError] = useState('')

  // Step 1 fields
  const [wSchoolName, setWSchoolName] = useState('')
  const [wAcademicYear, setWAcademicYear] = useState('2025-2026')
  const [wPeriods, setWPeriods] = useState(8)
  const [wDays, setWDays] = useState(5)
  const [wWeekend, setWWeekend] = useState<string[]>(['SATURDAY', 'SUNDAY'])
  const [wTimeOff, setWTimeOff] = useState('')
  const [wDistrib, setWDistrib] = useState('')
  const [wHomework, setWHomework] = useState('')
  const [wMaxOn, setWMaxOn] = useState<number | ''>('')
  const [wDoc, setWDoc] = useState('')

  // Modal visibility
  const [showSubjectModal, setShowSubjectModal] = useState(false)
  const [showClassModal, setShowClassModal] = useState(false)
  const [showClassroomModal, setShowClassroomModal] = useState(false)
  const [showTeacherModal, setShowTeacherModal] = useState(false)
  const [showLessonModal, setShowLessonModal] = useState(false)
  const [showContractPanel, setShowContractPanel] = useState(false)
  const [contractTeacher, setContractTeacher] = useState<TTeacher | null>(null)
  const [editingItem, setEditingItem] = useState<any>(null)

  // Subject form
  const [fSubName, setFSubName] = useState('')
  const [fSubShort, setFSubShort] = useState('')
  const [fSubColor, setFSubColor] = useState('#6366f1')
  const [fSubRooms, setFSubRooms] = useState(1)
  const [fSubCustom, setFSubCustom] = useState('')

  // Class form
  const [fClsName, setFClsName] = useState('')
  const [fClsShort, setFClsShort] = useState('')
  const [fClsColor, setFClsColor] = useState('#3b82f6')
  const [fClsPrint, setFClsPrint] = useState(false)
  const [fClsCustom, setFClsCustom] = useState('')

  // Classroom form
  const [fRmName, setFRmName] = useState('')
  const [fRmShort, setFRmShort] = useState('')
  const [fRmColor, setFRmColor] = useState('#14b8a6')
  const [fRmCustom, setFRmCustom] = useState('')

  // Teacher form
  const [fTLast, setFTLast] = useState('')
  const [fTFirst, setFTFirst] = useState('')
  const [fTShort, setFTShort] = useState('')
  const [fTSex, setFTSex] = useState('')
  const [fTEmail, setFTEmail] = useState('')
  const [fTPhone, setFTPhone] = useState('')
  const [fTColor, setFTColor] = useState('#22c55e')
  const [fTClassTeacher, setFTClassTeacher] = useState('')

  // Lesson form
  const [fLTeacher, setFLTeacher] = useState('')
  const [fLSubject, setFLSubject] = useState('')
  const [fLClass, setFLClass] = useState('')
  const [fLPerWeek, setFLPerWeek] = useState(2)
  const [fLType, setFLType] = useState('SINGLE')

  // Color picker
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [colorPickerValue, setColorPickerValue] = useState('#6366f1')
  const colorPickerResolve = useRef<((c: string) => void) | null>(null)

  function openColorPicker(current: string): Promise<string> {
    setColorPickerValue(current)
    setShowColorPicker(true)
    return new Promise(resolve => { colorPickerResolve.current = resolve })
  }
  function resolveColorPicker(color: string) {
    colorPickerResolve.current?.(color)
    colorPickerResolve.current = null
    setShowColorPicker(false)
  }

  const fetchList = useCallback(async () => {
    const res = await apiFetch('/api/timetable')
    if (res.ok) {
      const list: TimetableListItem[] = await res.json()
      setTimetableList(list)
      return list
    }
    return [] as TimetableListItem[]
  }, [])

  const loadTimetable = useCallback(async (id: string) => {
    setLoading(true)
    const res = await apiFetch(`/api/timetable/${id}`)
    if (res.ok) setCurrent(await res.json())
    setLoading(false)
  }, [])

  // Auto-load the timetable whose academicYear matches the current year on first mount
  useEffect(() => {
    const currentYear = new Date().getFullYear()
    fetchList().then(list => {
      if (!list || list.length === 0) return
      // Prefer a timetable whose academicYear contains the current calendar year
      const match =
        list.find(tt => tt.academicYear?.includes(String(currentYear))) ??
        list.find(tt => tt.status === 'PUBLISHED') ??
        list[0]
      if (match) loadTimetable(match.id)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const ttId = () => wizardTimetableId ?? current?.id ?? ''

  function openWizard() {
    setWizardStep(0); setWizardTimetableId(null); setWizardError('')
    setWSchoolName(''); setWAcademicYear('2025-2026')
    setWPeriods(8); setWDays(5); setWWeekend(['SATURDAY','SUNDAY'])
    setWTimeOff(''); setWDistrib(''); setWHomework(''); setWMaxOn(''); setWDoc('')
    setShowWizard(true)
  }

  async function wizardNext() {
    setWizardError('')
    if (wizardStep === 0) {
      // Step 1 → create timetable, only advance on success
      setWizardSaving(true)
      const res = await apiFetch('/api/timetable', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: wSchoolName || 'New Timetable', academicYear: wAcademicYear,
          periodsPerDay: wPeriods, numberOfDays: wDays, weekend: wWeekend,
          timeOffRules: wTimeOff || null, distribution: wDistrib || null,
          homeworkPrep: wHomework || null, maxOnDay: wMaxOn || null, docNotes: wDoc || null,
        }),
      })
      if (res.ok) {
        const tt = await res.json()
        setWizardTimetableId(tt.id)
        await loadTimetable(tt.id)
        await fetchList()
        setWizardSaving(false)
        showToast(`Timetable "${tt.name}" created successfully.`)
        setWizardStep(1)  // only advance when create succeeded
      } else {
        const body = await res.json().catch(() => ({}))
        const msg = body?.message ?? `Error ${res.status} — could not create timetable.`
        setWizardError(msg)
        showToast(msg, false)
        setWizardSaving(false)
      }
      return
    }
    // Steps 1-4: just advance
    if (wizardStep < WIZARD_STEPS.length - 1) setWizardStep(s => s + 1)
  }

  function wizardPrev() { if (wizardStep > 0) setWizardStep(s => s - 1) }

  async function wizardOk() {
    setShowWizard(false)
    if (wizardTimetableId) loadTimetable(wizardTimetableId)
  }

  // CRUD
  async function saveSubject() {
    const id = ttId(); if (!id) return
    const isEdit = !!editingItem
    const url = isEdit ? `/api/timetable/subjects/${editingItem.id}` : `/api/timetable/${id}/subjects`
    const res = await apiFetch(url, { method: isEdit ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: fSubName, short: fSubShort, color: fSubColor, classroomCount: fSubRooms,
        customFields: fSubCustom ? { note: fSubCustom } : undefined }) })
    if (res.ok) {
      showToast(isEdit ? `Subject "${fSubName}" updated.` : `Subject "${fSubName}" added.`)
      await loadTimetable(id); setShowSubjectModal(false)
    } else { showToast(`Failed to ${isEdit ? 'update' : 'add'} subject.`, false) }
  }
  async function removeSubject(subId: string, name: string) {
    const id = ttId(); if (!id) return
    const res = await apiFetch(`/api/timetable/subjects/${subId}`, { method: 'DELETE' })
    if (res.ok) { showToast(`Subject "${name}" removed.`); await loadTimetable(id) }
    else showToast('Failed to remove subject.', false)
  }
  async function saveClass() {
    const id = ttId(); if (!id) return
    const isEdit = !!editingItem
    const url = isEdit ? `/api/timetable/classes/${editingItem.id}` : `/api/timetable/${id}/classes`
    const res = await apiFetch(url, { method: isEdit ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: fClsName, short: fClsShort, color: fClsColor,
        printSubjectPicture: fClsPrint, customFields: fClsCustom ? { note: fClsCustom } : undefined }) })
    if (res.ok) {
      showToast(isEdit ? `Class "${fClsName}" updated.` : `Class "${fClsName}" added.`)
      await loadTimetable(id); setShowClassModal(false)
    } else { showToast(`Failed to ${isEdit ? 'update' : 'add'} class.`, false) }
  }
  async function removeClass(clsId: string, name: string) {
    const id = ttId(); if (!id) return
    const res = await apiFetch(`/api/timetable/classes/${clsId}`, { method: 'DELETE' })
    if (res.ok) { showToast(`Class "${name}" removed.`); await loadTimetable(id) }
    else showToast('Failed to remove class.', false)
  }
  async function saveClassroom() {
    const id = ttId(); if (!id) return
    const isEdit = !!editingItem
    const url = isEdit ? `/api/timetable/classrooms/${editingItem.id}` : `/api/timetable/${id}/classrooms`
    const res = await apiFetch(url, { method: isEdit ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: fRmName, short: fRmShort, color: fRmColor,
        customFields: fRmCustom ? { note: fRmCustom } : undefined }) })
    if (res.ok) {
      showToast(isEdit ? `Classroom "${fRmName}" updated.` : `Classroom "${fRmName}" added.`)
      await loadTimetable(id); setShowClassroomModal(false)
    } else { showToast(`Failed to ${isEdit ? 'update' : 'add'} classroom.`, false) }
  }
  async function removeClassroom(rmId: string, name: string) {
    const id = ttId(); if (!id) return
    const res = await apiFetch(`/api/timetable/classrooms/${rmId}`, { method: 'DELETE' })
    if (res.ok) { showToast(`Classroom "${name}" removed.`); await loadTimetable(id) }
    else showToast('Failed to remove classroom.', false)
  }
  async function saveTeacher() {
    const id = ttId(); if (!id) return
    const isEdit = !!editingItem
    const url = isEdit ? `/api/timetable/teachers/${editingItem.id}` : `/api/timetable/${id}/teachers`
    const res = await apiFetch(url, { method: isEdit ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lastName: fTLast, firstName: fTFirst, short: fTShort,
        sex: fTSex || null, email: fTEmail || null, phone: fTPhone || null,
        color: fTColor, classTeacherId: fTClassTeacher || null }) })
    const fullName = `${fTFirst} ${fTLast}`.trim()
    if (res.ok) {
      showToast(isEdit ? `Teacher "${fullName}" updated.` : `Teacher "${fullName}" added.`)
      await loadTimetable(id); setShowTeacherModal(false)
    } else {
      const err = await res.json().catch(() => ({}))
      const reason = Array.isArray(err?.message) ? err.message[0] : (err?.message ?? `HTTP ${res.status}`)
      showToast(`Failed to ${isEdit ? 'update' : 'add'} teacher: ${reason}`, false)
    }
  }
  async function removeTeacher(tchId: string, name: string) {
    const id = ttId(); if (!id) return
    const res = await apiFetch(`/api/timetable/teachers/${tchId}`, { method: 'DELETE' })
    if (res.ok) { showToast(`Teacher "${name}" removed.`); await loadTimetable(id) }
    else showToast('Failed to remove teacher.', false)
  }
  async function saveLesson() {
    const id = ttId(); if (!id) return
    const isEdit = !!editingItem
    const url = isEdit ? `/api/timetable/lessons/${editingItem.id}` : `/api/timetable/${id}/lessons`
    const res = await apiFetch(url, { method: isEdit ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teacherId: fLTeacher, subjectId: fLSubject, classId: fLClass,
        perWeek: fLPerWeek, lessonType: fLType }) })
    if (res.ok) {
      showToast(isEdit ? 'Lesson contract updated.' : 'Lesson contract added.')
      await loadTimetable(id); setShowLessonModal(false)
    } else { showToast(`Failed to ${isEdit ? 'update' : 'add'} lesson.`, false) }
  }
  async function removeLesson(lsnId: string) {
    const id = ttId(); if (!id) return
    const res = await apiFetch(`/api/timetable/lessons/${lsnId}`, { method: 'DELETE' })
    if (res.ok) { showToast('Lesson contract removed.'); await loadTimetable(id) }
    else showToast('Failed to remove lesson.', false)
  }
  async function handleGenerate() {
    const id = current?.id; if (!id) return
    setGenerating(true)
    const res = await apiFetch(`/api/timetable/${id}/generate`, { method: 'POST' })
    if (res.ok) {
      const data = await res.json()
      showToast(`Timetable generated — ${data.generated} entries created.`)
      await loadTimetable(id)
    } else { showToast('Timetable generation failed.', false) }
    setGenerating(false)
  }
  async function handleSave() {
    if (!current) return
    const res = await apiFetch(`/api/timetable/${current.id}`, { method: 'PUT',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: current.status }) })
    if (res.ok) showToast('Timetable saved.')
    else showToast('Failed to save timetable.', false)
  }

  async function handleDeleteTimetable(id: string, name: string) {
    if (!window.confirm(`Delete "${name}"?\n\nThis will permanently remove the timetable and all its subjects, classes, classrooms, teachers, lessons and entries.`)) return
    const res = await apiFetch(`/api/timetable/${id}`, { method: 'DELETE' })
    if (res.ok) {
      showToast(`Timetable "${name}" deleted.`)
      if (current?.id === id) setCurrent(null)
      await fetchList()
    } else { showToast(`Failed to delete "${name}".`, false) }
  }

  // Open modals
  function openSubjectModal(item?: TSubject) {
    setEditingItem(item ?? null); setFSubName(item?.name ?? ''); setFSubShort(item?.short ?? '')
    setFSubColor(item?.color ?? '#6366f1'); setFSubRooms(item?.classroomCount ?? 1); setFSubCustom(item?.customFields?.note ?? '')
    setShowSubjectModal(true)
  }
  function openClassModal(item?: TClass) {
    setEditingItem(item ?? null); setFClsName(item?.name ?? ''); setFClsShort(item?.short ?? '')
    setFClsColor(item?.color ?? '#3b82f6'); setFClsPrint(item?.printSubjectPicture ?? false); setFClsCustom(item?.customFields?.note ?? '')
    setShowClassModal(true)
  }
  function openClassroomModal(item?: TClassroom) {
    setEditingItem(item ?? null); setFRmName(item?.name ?? ''); setFRmShort(item?.short ?? '')
    setFRmColor(item?.color ?? '#14b8a6'); setFRmCustom(item?.customFields?.note ?? '')
    setShowClassroomModal(true)
  }
  function openTeacherModal(item?: TTeacher) {
    setEditingItem(item ?? null); setFTLast(item?.lastName ?? ''); setFTFirst(item?.firstName ?? '')
    setFTShort(item?.short ?? ''); setFTSex(item?.sex ?? ''); setFTEmail(item?.email ?? '')
    setFTPhone(item?.phone ?? ''); setFTColor(item?.color ?? '#22c55e'); setFTClassTeacher(item?.classTeacherId ?? '')
    setShowTeacherModal(true)
  }
  function openLessonModal(item?: TLesson, teacherDefault?: TTeacher) {
    setEditingItem(item ?? null); setFLTeacher(item?.teacherId ?? teacherDefault?.id ?? '')
    setFLSubject(item?.subjectId ?? ''); setFLClass(item?.classId ?? '')
    setFLPerWeek(item?.perWeek ?? 2); setFLType(item?.lessonType ?? 'SINGLE'); setShowLessonModal(true)
  }
  function openContractPanel(teacher: TTeacher) { setContractTeacher(teacher); setShowContractPanel(true) }

  // Grid
  function buildGrid() {
    if (!current) return null
    const { classes, entries, periodsPerDay, numberOfDays } = current
    const days = Array.from({ length: numberOfDays }, (_, i) => i + 1)
    return (
      <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', transition: 'transform 0.2s' }}>
        <table className="border-collapse text-xs select-none">
          <thead>
            <tr className="bg-indigo-700 text-white">
              <th className="border border-indigo-800 px-2 py-1 min-w-[80px] text-left">Class</th>
              {days.map(d => (
                <th key={d} className="border border-indigo-800 px-2 py-1 min-w-[120px] text-center">
                  {DAY_LABELS[d - 1] ?? `Day ${d}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {classes.map(cls => (
              <tr key={cls.id} className="even:bg-gray-50">
                <td className="border border-gray-300 px-2 py-1 font-semibold align-top whitespace-nowrap">
                  {colorBadge(cls.color, cls.short)}
                  <div className="text-gray-500 text-[10px] mt-0.5">{cls.name}</div>
                </td>
                {days.map(day => {
                  const sorted = entries.filter(e => e.classId === cls.id && e.day === day).sort((a, b) => a.period - b.period)
                  return (
                    <td key={day} className="border border-gray-300 align-top p-0.5 min-h-[60px]">
                      {sorted.map(e => (
                        <div key={e.id} className="rounded mb-0.5 px-1 py-0.5 text-white text-[10px] leading-tight"
                          style={{ backgroundColor: e.subject.color ?? '#6366f1' }}>
                          <div className="font-semibold">{e.subject.short}</div>
                          <div className="opacity-90 rounded px-0.5 mt-0.5 inline-block"
                            style={{ backgroundColor: e.teacher.color ?? '#374151' }}>
                            P{e.period} · {e.teacher.short}
                          </div>
                        </div>
                      ))}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <AuthGuard allowedRoles={['ADMIN']}>
      <div className="flex h-screen bg-gray-100 print:bg-white">
        <Sidebar title="Admin Panel" subtitle="Wattaman" navItems={adminNav} accentColor="indigo" />
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-1 flex-wrap print:hidden">
            <button onClick={openWizard} className="tt-btn bg-indigo-600 text-white">New</button>
            <button onClick={() => setShowOpenModal(true)} className="tt-btn bg-gray-100 text-gray-700">Open</button>
            <button onClick={handleSave} disabled={!current} className="tt-btn bg-gray-100 text-gray-700 disabled:opacity-40">Save</button>
            <button onClick={() => window.print()} disabled={!current} className="tt-btn bg-gray-100 text-gray-700 disabled:opacity-40">Print</button>
            <button onClick={() => window.print()} disabled={!current} className="tt-btn bg-gray-100 text-gray-700 disabled:opacity-40">Print Preview</button>
            <div className="w-px h-6 bg-gray-300 mx-1" />
            <button onClick={() => router.push('/admin/timetable/subjects')} className="tt-btn bg-blue-50 text-blue-700">Subject</button>
            <button onClick={() => router.push('/admin/timetable/classes')} className="tt-btn bg-blue-50 text-blue-700">Class</button>
            <button onClick={() => router.push('/admin/timetable/classrooms')} className="tt-btn bg-blue-50 text-blue-700">Classrooms</button>
            <button onClick={() => router.push('/admin/timetable/teachers')} className="tt-btn bg-blue-50 text-blue-700">Teacher</button>
            <div className="w-px h-6 bg-gray-300 mx-1" />
            <button onClick={() => router.push('/admin/timetable/schedule')}
              className="tt-btn bg-emerald-700 text-white">
              Schedule ↗
            </button>
            <button onClick={handleGenerate} disabled={!current || generating}
              className="tt-btn bg-emerald-600 text-white disabled:opacity-40">
              {generating ? 'Generating…' : 'Test'}
            </button>
            <button onClick={() => current && handleDeleteTimetable(current.id, current.name)}
              disabled={!current}
              className="tt-btn bg-red-50 text-red-600 border border-red-200 disabled:opacity-40">
              Delete
            </button>
            {current && (
              <span className="ml-auto text-sm text-gray-500 truncate max-w-[220px]">
                {current.name} · {current.academicYear}
              </span>
            )}
          </div>
          {/* Content */}
          <div className="flex-1 overflow-auto p-4">
            {loading && <div className="flex items-center justify-center h-40 text-gray-400">Loading…</div>}
            {!loading && !current && (
              <div className="flex flex-col items-center justify-center h-64 gap-4 text-gray-400">
                <svg className="w-16 h-16 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-lg">No timetable open</p>
                <p className="text-sm">Click <strong>New</strong> to create or <strong>Open</strong> to load one.</p>
              </div>
            )}
            {!loading && current && <div className="overflow-auto">{buildGrid()}</div>}
          </div>
          {/* Footer zoom */}
          <div className="bg-white border-t border-gray-200 px-4 py-2 flex items-center gap-3 print:hidden">
            <span className="text-xs text-gray-500">Zoom</span>
            <button onClick={() => setZoom(z => Math.max(0.4, +(z - 0.1).toFixed(1)))}
              className="w-7 h-7 rounded border border-gray-300 text-gray-600 hover:bg-gray-100 flex items-center justify-center font-bold">−</button>
            <span className="text-xs w-12 text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom(z => Math.min(2, +(z + 0.1).toFixed(1)))}
              className="w-7 h-7 rounded border border-gray-300 text-gray-600 hover:bg-gray-100 flex items-center justify-center font-bold">+</button>
            <button onClick={() => setZoom(1)} className="text-xs text-indigo-600 hover:underline ml-1">Reset</button>
            {current && (
              <span className="ml-auto text-xs text-gray-400">
                {current.classes.length} classes · {current.entries.length} entries · {current.periodsPerDay} periods/day
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Open Modal */}
      {showOpenModal && (
        <ModalShell title="Open Timetable" onClose={() => setShowOpenModal(false)} width="max-w-lg">
          <div className="space-y-1 max-h-80 overflow-y-auto">
            {timetableList.length === 0 && <p className="text-gray-400 text-sm text-center py-8">No timetables saved yet.</p>}
            {timetableList.map(tt => (
              <div key={tt.id} className="flex items-center gap-2 rounded border border-transparent hover:border-indigo-200 hover:bg-indigo-50 px-3 py-2 transition-colors">
                <button className="flex-1 text-left"
                  onClick={async () => { await loadTimetable(tt.id); setShowOpenModal(false) }}>
                  <div className="font-medium text-gray-800">{tt.name}</div>
                  <div className="text-xs text-gray-500">{tt.academicYear} · {tt.status}</div>
                </button>
                <button
                  onClick={async () => { await handleDeleteTimetable(tt.id, tt.name); }}
                  className="shrink-0 px-2 py-1 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 rounded border border-transparent hover:border-red-200">
                  Delete
                </button>
              </div>
            ))}
          </div>
        </ModalShell>
      )}

      {/* 5-Step Wizard */}
      {showWizard && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200 bg-indigo-50 rounded-t-xl flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-indigo-800">New Timetable</h2>
                <p className="text-sm text-indigo-600 mt-0.5">Step {wizardStep + 1} of {WIZARD_STEPS.length} — {WIZARD_STEPS[wizardStep]}</p>
              </div>
              <div className="flex items-center gap-1.5">
                {WIZARD_STEPS.map((label, i) => (
                  <div key={i} className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors
                    ${i === wizardStep ? 'bg-indigo-600 text-white' : i < wizardStep ? 'bg-indigo-200 text-indigo-700' : 'bg-gray-200 text-gray-400'}`}>
                    {i < wizardStep ? '✓' : i + 1}
                  </div>
                ))}
              </div>
            </div>

            {/* Column labels for step 1 */}
            {wizardStep === 0 && (
              <div className="px-6 pt-3 pb-1">
                <div className="grid grid-cols-8 gap-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100 pb-1">
                  <div className="col-span-2">Name</div>
                  <div>Short</div>
                  <div>Time Off</div>
                  <div>Distribut.</div>
                  <div>Hmwk Prep</div>
                  <div>Max. On</div>
                  <div>Doc.</div>
                </div>
              </div>
            )}

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4">

              {/* STEP 1 */}
              {wizardStep === 0 && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className="label-sm">Name of School / Timetable</label>
                      <input className="input-field" value={wSchoolName} onChange={e => setWSchoolName(e.target.value)} placeholder="e.g. Wattaman School 2025" />
                    </div>
                    <div>
                      <label className="label-sm">Academic Year</label>
                      <input className="input-field" value={wAcademicYear} onChange={e => setWAcademicYear(e.target.value)} placeholder="2025-2026" />
                    </div>
                    <div>
                      <label className="label-sm">Periods per Day</label>
                      <input type="number" className="input-field" value={wPeriods} onChange={e => setWPeriods(+e.target.value)} min={1} max={20} />
                    </div>
                    <div>
                      <label className="label-sm">Number of Days</label>
                      <input type="number" className="input-field" value={wDays} onChange={e => setWDays(+e.target.value)} min={1} max={7} />
                    </div>
                    <div>
                      <label className="label-sm">Max. Lessons on One Day</label>
                      <input type="number" className="input-field" value={wMaxOn} onChange={e => setWMaxOn(e.target.value ? +e.target.value : '')} min={1} placeholder="Optional" />
                    </div>
                  </div>
                  <div>
                    <label className="label-sm">Weekend (non-teaching days)</label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {WEEKENDS.map(d => (
                        <button key={d} type="button"
                          onClick={() => setWWeekend(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])}
                          className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors
                            ${wWeekend.includes(d) ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 text-gray-600 hover:border-indigo-300'}`}>
                          {d.slice(0, 3)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="border-t pt-3 grid grid-cols-2 gap-3">
                    <div>
                      <label className="label-sm">Time Off Rules</label>
                      <input className="input-field" value={wTimeOff} onChange={e => setWTimeOff(e.target.value)} placeholder="e.g. No lesson 12:00-13:00" />
                    </div>
                    <div>
                      <label className="label-sm">Distribution</label>
                      <input className="input-field" value={wDistrib} onChange={e => setWDistrib(e.target.value)} placeholder="e.g. max 2 same subject/day" />
                    </div>
                    <div>
                      <label className="label-sm">Homework Preparation</label>
                      <input className="input-field" value={wHomework} onChange={e => setWHomework(e.target.value)} placeholder="Notes..." />
                    </div>
                    <div>
                      <label className="label-sm">Doc Notes</label>
                      <input className="input-field" value={wDoc} onChange={e => setWDoc(e.target.value)} placeholder="Additional notes..." />
                    </div>
                  </div>
                </div>
              )}

              {/* Loading state for steps 2-5 while timetable is being fetched */}
              {wizardStep >= 1 && !current && (
                <div className="flex flex-col items-center justify-center py-14 gap-3 text-gray-400">
                  <svg className="w-8 h-8 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  <span className="text-sm">Loading timetable data…</span>
                </div>
              )}

              {/* STEP 2: Subjects */}
              {wizardStep === 1 && current && (
                <WizardListStep
                  title="Subjects" addLabel="Enter Subject" items={current.subjects} onNew={() => openSubjectModal()}
                  columns={['Name', 'Short', 'Rooms', 'Color']}
                  renderRow={(s: TSubject) => [s.name, s.short, String(s.classroomCount), colorBadge(s.color, '  ')]}
                  onEdit={(s: TSubject) => openSubjectModal(s)} onRemove={(s: TSubject) => removeSubject(s.id, s.name)}
                />
              )}

              {/* STEP 3: Classes */}
              {wizardStep === 2 && current && (
                <WizardListStep
                  title="Classes" addLabel="Enter Class" items={current.classes} onNew={() => openClassModal()}
                  columns={['Name', 'Short', 'Color', 'Print Pic']}
                  renderRow={(c: TClass) => [c.name, c.short, colorBadge(c.color, '  '), c.printSubjectPicture ? '✓' : '—']}
                  onEdit={(c: TClass) => openClassModal(c)} onRemove={(c: TClass) => removeClass(c.id, c.name)}
                />
              )}

              {/* STEP 4: Classrooms */}
              {wizardStep === 3 && current && (
                <WizardListStep
                  title="Classrooms" addLabel="Enter Classroom" items={current.classrooms} onNew={() => openClassroomModal()}
                  columns={['Name', 'Short', 'Color']}
                  renderRow={(r: TClassroom) => [r.name, r.short, colorBadge(r.color, '  ')]}
                  onEdit={(r: TClassroom) => openClassroomModal(r)} onRemove={(r: TClassroom) => removeClassroom(r.id, r.name)}
                />
              )}

              {/* STEP 5: Teachers + Contracts */}
              {wizardStep === 4 && current && (
                <WizardListStep
                  title="Teachers" addLabel="Enter Teacher" items={current.teachers} onNew={() => openTeacherModal()}
                  columns={['Last Name', 'First Name', 'Short', 'Color', 'Class Teacher']}
                  renderRow={(t: TTeacher) => [t.lastName, t.firstName, t.short, colorBadge(t.color, '  '), t.classTeacher?.short ?? '—']}
                  onEdit={(t: TTeacher) => openTeacherModal(t)}
                  onRemove={(t: TTeacher) => removeTeacher(t.id, `${t.firstName} ${t.lastName}`.trim())}
                  extraAction={(t: TTeacher) => (
                    <button onClick={() => openContractPanel(t)} className="text-emerald-600 hover:underline mr-2 text-xs font-medium">Contract</button>
                  )}
                />
              )}
            </div>

            {/* Error message */}
            {wizardError && (
              <div className="mx-6 mb-1 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {wizardError}
              </div>
            )}

            {/* Footer */}
            <div className="px-6 py-3 border-t border-gray-200 flex items-center justify-between bg-gray-50 rounded-b-xl">
              <button onClick={() => setShowWizard(false)} className="tt-btn bg-white border border-gray-300 text-gray-700">Cancel</button>
              <div className="flex gap-2">
                {wizardStep > 0 && (
                  <button onClick={wizardPrev} className="tt-btn bg-gray-100 text-gray-700">← Previous</button>
                )}
                {wizardStep < WIZARD_STEPS.length - 1 ? (
                  <button onClick={wizardNext} disabled={wizardSaving} className="tt-btn bg-indigo-600 text-white disabled:opacity-50">
                    {wizardSaving ? 'Saving…' : 'Next →'}
                  </button>
                ) : (
                  <button onClick={wizardOk} className="tt-btn bg-emerald-600 text-white">OK ✓</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Contract Panel */}
      {showContractPanel && contractTeacher && current && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between bg-emerald-50 rounded-t-xl">
              <div>
                <h2 className="font-bold text-gray-800">Lesson Contracts</h2>
                <p className="text-sm text-gray-500">{contractTeacher.lastName} {contractTeacher.firstName}</p>
              </div>
              <button onClick={() => openLessonModal(undefined, contractTeacher)} className="tt-btn bg-emerald-600 text-white text-xs">+ New Lesson</button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-3">
              {current.lessons.filter(l => l.teacherId === contractTeacher.id).length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-10">No lesson contracts yet. Click + New Lesson.</p>
              ) : (
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-gray-50">
                      {['Subject','Class','Lessons/Week','Type',''].map(h => (
                        <th key={h} className="border-b border-gray-200 px-3 py-2 text-left font-semibold text-gray-600">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {current.lessons.filter(l => l.teacherId === contractTeacher.id).map(l => (
                      <tr key={l.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-3 py-2">{colorBadge(l.subject.color, l.subject.short)} {l.subject.name}</td>
                        <td className="px-3 py-2">{colorBadge(l.class.color, l.class.short)} {l.class.name}</td>
                        <td className="px-3 py-2 text-center font-medium">{l.perWeek}x/week</td>
                        <td className="px-3 py-2">{l.lessonType}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">
                          <button onClick={() => openLessonModal(l)} className="text-blue-600 hover:underline mr-3">Edit lesson</button>
                          <button onClick={() => removeLesson(l.id)} className="text-red-500 hover:underline">Remove</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="px-5 py-3 border-t border-gray-200 flex justify-end bg-gray-50 rounded-b-xl">
              <button onClick={() => setShowContractPanel(false)} className="tt-btn bg-gray-100 text-gray-700">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Subject Modal */}
      {showSubjectModal && (
        <ItemModal title={editingItem ? 'Edit Subject' : 'New Subject'} onOk={saveSubject} onCancel={() => setShowSubjectModal(false)}>
          <Field label="Name"><input className="input-field" value={fSubName} onChange={e => setFSubName(e.target.value)} placeholder="e.g. Mathematics" /></Field>
          <Field label="Short Name"><input className="input-field" value={fSubShort} onChange={e => setFSubShort(e.target.value)} maxLength={8} placeholder="e.g. Math" /></Field>
          <Field label="Custom Fields"><input className="input-field" value={fSubCustom} onChange={e => setFSubCustom(e.target.value)} placeholder="Optional notes" /></Field>
          <Field label="Classroom Count">
            <div className="flex items-center gap-2">
              <input type="number" className="input-field" style={{width:80}} value={fSubRooms} onChange={e => setFSubRooms(+e.target.value)} min={1} />
              <span className="text-xs text-gray-400">rooms needed</span>
            </div>
          </Field>
          <Field label="Color / Picture">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded border border-gray-300" style={{ backgroundColor: fSubColor }} />
              <button type="button" onClick={async () => { const c = await openColorPicker(fSubColor); setFSubColor(c) }}
                className="tt-btn bg-gray-100 text-gray-700 text-xs">Change</button>
              <span className="text-xs text-gray-500">{fSubColor}</span>
            </div>
          </Field>
          <Field label="Set for lessons of this subject">
            <p className="text-xs text-gray-400">Classroom count sets how many rooms this subject requires.</p>
          </Field>
        </ItemModal>
      )}

      {/* Class Modal */}
      {showClassModal && (
        <ItemModal title={editingItem ? 'Edit Class' : 'New Class'} onOk={saveClass} onCancel={() => setShowClassModal(false)}>
          <Field label="Class Name"><input className="input-field" value={fClsName} onChange={e => setFClsName(e.target.value)} placeholder="e.g. Grade 10A" /></Field>
          <Field label="Short Name"><input className="input-field" value={fClsShort} onChange={e => setFClsShort(e.target.value)} maxLength={8} placeholder="e.g. G10A" /></Field>
          <Field label="Custom Fields"><input className="input-field" value={fClsCustom} onChange={e => setFClsCustom(e.target.value)} placeholder="Optional notes" /></Field>
          <Field label="Color / Picture">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded border border-gray-300" style={{ backgroundColor: fClsColor }} />
              <button type="button" onClick={async () => { const c = await openColorPicker(fClsColor); setFClsColor(c) }}
                className="tt-btn bg-gray-100 text-gray-700 text-xs">Change</button>
            </div>
          </Field>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer mt-1">
            <input type="checkbox" checked={fClsPrint} onChange={e => setFClsPrint(e.target.checked)} className="rounded" />
            Print subject picture on timetable
          </label>
        </ItemModal>
      )}

      {/* Classroom Modal */}
      {showClassroomModal && (
        <ItemModal title={editingItem ? 'Edit Classroom' : 'New Classroom'} onOk={saveClassroom} onCancel={() => setShowClassroomModal(false)}>
          <Field label="Classroom Name"><input className="input-field" value={fRmName} onChange={e => setFRmName(e.target.value)} placeholder="e.g. Room 101" /></Field>
          <Field label="Short Name"><input className="input-field" value={fRmShort} onChange={e => setFRmShort(e.target.value)} maxLength={8} placeholder="e.g. R101" /></Field>
          <Field label="Custom Fields"><input className="input-field" value={fRmCustom} onChange={e => setFRmCustom(e.target.value)} placeholder="Optional notes" /></Field>
          <Field label="Color / Picture">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded border border-gray-300" style={{ backgroundColor: fRmColor }} />
              <button type="button" onClick={async () => { const c = await openColorPicker(fRmColor); setFRmColor(c) }}
                className="tt-btn bg-gray-100 text-gray-700 text-xs">Change</button>
            </div>
          </Field>
        </ItemModal>
      )}

      {/* Teacher Modal */}
      {showTeacherModal && (
        <ItemModal title={editingItem ? 'Edit Teacher' : 'New Teacher'} onOk={saveTeacher} onCancel={() => setShowTeacherModal(false)} width="max-w-lg">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Last Name"><input className="input-field" value={fTLast} onChange={e => setFTLast(e.target.value)} /></Field>
            <Field label="First Name"><input className="input-field" value={fTFirst} onChange={e => setFTFirst(e.target.value)} /></Field>
          </div>
          <Field label="Short Name"><input className="input-field" value={fTShort} onChange={e => setFTShort(e.target.value)} maxLength={8} /></Field>
          <Field label="Sex">
            <div className="flex gap-6 mt-1">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={fTSex === 'MALE'} onChange={() => setFTSex(fTSex === 'MALE' ? '' : 'MALE')} />
                Male
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={fTSex === 'FEMALE'} onChange={() => setFTSex(fTSex === 'FEMALE' ? '' : 'FEMALE')} />
                Female
              </label>
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="E-mail"><input type="email" className="input-field" value={fTEmail} onChange={e => setFTEmail(e.target.value)} /></Field>
            <Field label="Phone"><input className="input-field" value={fTPhone} onChange={e => setFTPhone(e.target.value)} /></Field>
          </div>
          <Field label="Class Teacher for (Class)">
            <div className="flex items-center gap-2">
              <select className="input-field" value={fTClassTeacher} onChange={e => setFTClassTeacher(e.target.value)}>
                <option value="">— None —</option>
                {current?.classes.map((c: TClass) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <button type="button" onClick={() => setFTClassTeacher('')} className="tt-btn bg-gray-100 text-gray-700 text-xs whitespace-nowrap">Clear</button>
            </div>
          </Field>
          <Field label="Color">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded border border-gray-300" style={{ backgroundColor: fTColor }} />
              <button type="button" onClick={async () => { const c = await openColorPicker(fTColor); setFTColor(c) }}
                className="tt-btn bg-gray-100 text-gray-700 text-xs">Change</button>
            </div>
          </Field>
        </ItemModal>
      )}

      {/* Lesson Modal */}
      {showLessonModal && (
        <ItemModal title={editingItem ? 'Edit Lesson' : 'New Lesson'} onOk={saveLesson} onCancel={() => setShowLessonModal(false)}>
          <Field label="Teacher">
            <select className="input-field" value={fLTeacher} onChange={e => setFLTeacher(e.target.value)}>
              <option value="">Select teacher</option>
              {current?.teachers.map((t: TTeacher) => <option key={t.id} value={t.id}>{t.lastName} {t.firstName}</option>)}
            </select>
          </Field>
          <Field label="Subject">
            <select className="input-field" value={fLSubject} onChange={e => setFLSubject(e.target.value)}>
              <option value="">Select subject</option>
              {current?.subjects.map((s: TSubject) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
          <Field label="Class">
            <select className="input-field" value={fLClass} onChange={e => setFLClass(e.target.value)}>
              <option value="">Select class</option>
              {current?.classes.map((c: TClass) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Lessons / Week">
            <select className="input-field" value={fLPerWeek} onChange={e => setFLPerWeek(+e.target.value)}>
              {[1,2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n} {n === 1 ? 'time' : 'times'} per week</option>)}
            </select>
          </Field>
          <Field label="Lesson Type">
            <select className="input-field" value={fLType} onChange={e => setFLType(e.target.value)}>
              <option value="SINGLE">Single (1 period)</option>
              <option value="DOUBLE">Double (2 periods)</option>
              <option value="TRIPLE">Triple (3 periods)</option>
            </select>
          </Field>
        </ItemModal>
      )}

      {/* Color Picker */}
      {showColorPicker && (
        <div className="fixed inset-0 bg-black/40 z-[70] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-72 p-5">
            <h3 className="font-bold text-gray-800 mb-3">Choose Color</h3>
            <div className="grid grid-cols-5 gap-2 mb-4">
              {COLOR_PALETTE.map(c => (
                <button key={c} type="button" onClick={() => resolveColorPicker(c)}
                  className="w-10 h-10 rounded-lg border-2 transition-transform hover:scale-110 border-transparent hover:border-gray-400"
                  style={{ backgroundColor: c }} />
              ))}
            </div>
            <div className="flex items-center gap-2 mb-4">
              <label className="text-sm text-gray-600">Custom:</label>
              <input type="color" value={colorPickerValue} onChange={e => setColorPickerValue(e.target.value)}
                className="w-10 h-10 rounded cursor-pointer border border-gray-300" />
              <span className="text-sm text-gray-500">{colorPickerValue}</span>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowColorPicker(false)} className="tt-btn bg-gray-100 text-gray-700">Cancel</button>
              <button onClick={() => resolveColorPicker(colorPickerValue)} className="tt-btn bg-indigo-600 text-white">OK</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast notifications */}
      <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id}
            className={`flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-white text-sm font-medium
              animate-[slideUp_.25s_ease-out]
              ${t.ok ? 'bg-emerald-600' : 'bg-red-600'}`}>
            <span>{t.ok ? '✓' : '✗'}</span>
            <span>{t.msg}</span>
          </div>
        ))}
      </div>

      <style jsx global>{`
        .tt-btn { padding: 4px 12px; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer; border: 1px solid transparent; transition: opacity .15s; }
        .tt-btn:hover { opacity: .85; }
        .label-sm { display: block; font-size: 11px; font-weight: 600; color: #4b5563; margin-bottom: 3px; }
        .input-field { width: 100%; border: 1px solid #d1d5db; border-radius: 8px; padding: 6px 10px; font-size: 13px; outline: none; background: #fff; }
        .input-field:focus { border-color: #6366f1; box-shadow: 0 0 0 2px rgba(99,102,241,.15); }
        @keyframes slideUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        @media print { .print\\:hidden { display: none !important; } .print\\:bg-white { background: white !important; } }
      `}</style>
    </AuthGuard>
  )
}

// ═══ Wizard List Step ════════════════════════════════════════════════════════

function WizardListStep({ title, addLabel, items, onNew, columns, renderRow, onEdit, onRemove, extraAction }: {
  title: string; addLabel: string; items: any[]; onNew: () => void
  columns: string[]; renderRow: (item: any) => any[]
  onEdit: (item: any) => void; onRemove: (item: any) => void
  extraAction?: (item: any) => React.ReactNode
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-700">{addLabel} <span className="text-gray-400 font-normal text-xs ml-2">({items.length})</span></h3>
        <button onClick={onNew} className="tt-btn bg-indigo-600 text-white text-xs">+ New</button>
      </div>
      {items.length === 0 ? (
        <div className="border-2 border-dashed border-gray-200 rounded-xl py-10 text-center text-gray-400 text-sm">
          No {title.toLowerCase()} added yet.<br/>
          <button onClick={onNew} className="mt-2 text-indigo-600 hover:underline text-sm font-medium">+ Add first</button>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {columns.map(c => (
                  <th key={c} className="px-3 py-2 text-left font-semibold text-gray-600">{c}</th>
                ))}
                <th className="px-3 py-2 text-right font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-gray-100 last:border-0 hover:bg-indigo-50/40">
                  {renderRow(item).map((cell, ci) => (
                    <td key={ci} className="px-3 py-2">{cell}</td>
                  ))}
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {extraAction?.(item)}
                    <button onClick={() => onEdit(item)} className="text-blue-600 hover:underline mr-2">Edit</button>
                    <button onClick={() => onRemove(item)} className="text-red-500 hover:underline">Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ═══ Item Modal ══════════════════════════════════════════════════════════════

function ItemModal({ title, onOk, onCancel, children, width = 'max-w-md' }: {
  title: string; onOk: () => void; onCancel: () => void
  children: React.ReactNode; width?: string
}) {
  return (
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
      <div className={`bg-white rounded-xl shadow-2xl w-full ${width} max-h-[85vh] flex flex-col`}>
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-bold text-gray-800">{title}</h2>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">x</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">{children}</div>
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2 bg-gray-50 rounded-b-xl">
          <button onClick={onCancel} className="tt-btn bg-white border border-gray-300 text-gray-700">Cancel</button>
          <button onClick={onOk} className="tt-btn bg-indigo-600 text-white">OK</button>
        </div>
      </div>
    </div>
  )
}

// ═══ Modal Shell ════════════════════════════════════════════════════════════

function ModalShell({ title, onClose, children, width = 'max-w-md' }: {
  title: string; onClose: () => void; children: React.ReactNode; width?: string
}) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className={`bg-white rounded-xl shadow-2xl w-full ${width} max-h-[85vh] flex flex-col`}>
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-bold text-gray-800">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl leading-none">x</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2 bg-gray-50 rounded-b-xl">
          <button onClick={onClose} className="tt-btn bg-gray-100 text-gray-700">Close</button>
        </div>
      </div>
    </div>
  )
}

// ═══ Field ═══════════════════════════════════════════════════════════════════

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label-sm">{label}</label>
      {children}
    </div>
  )
}
