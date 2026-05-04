'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Sidebar from '../../../components/Sidebar'
import AuthGuard from '../../../components/AuthGuard'
import { adminNav } from '../../../lib/admin-nav'
import { apiFetch } from '../../../lib/api'
import { useLanguage } from '../../../lib/i18n'

// ─── Types ──────────────────────────────────────────────────────────────────

interface Timetable {
  id: string
  name: string
  short: string | null
  academicYear: string
  periodsPerDay: number
  numberOfDays: number
  weekend: string[]
  timeOffRules?: string | null
  distribution?: string | null
  homeworkPrep?: string | null
  maxOnDay?: number | null
  docNotes?: string | null
  status: string
  subjects: TSubject[]
  classes: TClass[]
  classrooms: TClassroom[]
  teachers: TTeacher[]
  lessons: TLesson[]
  entries: TEntry[]
}

interface TSubject {
  id: string; name: string; short: string
  color: string | null; classroomCount: number; customFields: any
}
interface TClass {
  id: string; name: string; short: string
  color: string | null; printSubjectPicture: boolean; customFields: any
  classTeacher?: TTeacher | null
}
interface TClassroom {
  id: string; name: string; short: string; color: string | null; customFields: any
}
interface TTeacher {
  id: string; lastName: string; firstName: string; short: string
  sex: string | null; email: string | null; phone: string | null
  color: string | null; classTeacherId: string | null
  classTeacher?: TClass | null
}
interface TLesson {
  id: string; teacherId: string; subjectId: string; classId: string
  perWeek: number; lessonType: string
  teacher: TTeacher; subject: TSubject; class: TClass
}
interface TEntry {
  id: string; classId: string; teacherId: string; subjectId: string
  classroomId: string | null; day: number; period: number
  class: TClass; teacher: TTeacher; subject: TSubject
  classroom: TClassroom | null
}

interface TimetableListItem {
  id: string; name: string; short: string | null
  academicYear: string; status: string; createdAt: string
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const LESSON_TYPES = ['SINGLE', 'DOUBLE', 'TRIPLE']
const WEEKENDS = ['MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY','SUNDAY']

// Wizard step titles
const WIZARD_STEPS = [
  'School Info',
  'Subjects',
  'Classes',
  'Classrooms',
  'Teachers & Contracts',
  'Review Lessons',
  'Generate Timetable',
]

// ─── Colour palette for quick selection ────────────────────────────────────
const COLOR_PALETTE = [
  '#ef4444','#f97316','#f59e0b','#eab308','#84cc16',
  '#22c55e','#14b8a6','#06b6d4','#3b82f6','#6366f1',
  '#8b5cf6','#a855f7','#ec4899','#64748b','#374151',
]

// ─── Helpers ────────────────────────────────────────────────────────────────

function colorBadge(color: string | null, text: string) {
  const bg = color ?? '#6366f1'
  return (
    <span
      className="inline-block rounded px-1.5 py-0.5 text-xs font-semibold text-white"
      style={{ backgroundColor: bg }}
    >
      {text}
    </span>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function TimetablePage() {
  const { t } = useLanguage()
  const router = useRouter()

  const [timetableList, setTimetableList] = useState<TimetableListItem[]>([])
  const [current, setCurrent] = useState<Timetable | null>(null)
  const [zoom, setZoom] = useState(1)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)

  // Wizard
  const [showWizard, setShowWizard] = useState(false)
  const [wizardStep, setWizardStep] = useState(0)
  const [wizardTimetableId, setWizardTimetableId] = useState<string | null>(null)

  // Step 1 form
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

  // Open file modal
  const [showOpenModal, setShowOpenModal] = useState(false)

  // Sub-item modals (Subject, Class, Classroom, Teacher, Lesson)
  const [showSubjectModal, setShowSubjectModal] = useState(false)
  const [showClassModal, setShowClassModal] = useState(false)
  const [showClassroomModal, setShowClassroomModal] = useState(false)
  const [showTeacherModal, setShowTeacherModal] = useState(false)
  const [showLessonModal, setShowLessonModal] = useState(false)
  const [editingItem, setEditingItem] = useState<any>(null)

  // Subject form
  const [fSubjectName, setFSubjectName] = useState('')
  const [fSubjectShort, setFSubjectShort] = useState('')
  const [fSubjectColor, setFSubjectColor] = useState('#6366f1')
  const [fSubjectRooms, setFSubjectRooms] = useState(1)

  // Class form
  const [fClassName, setFClassName] = useState('')
  const [fClassShort, setFClassShort] = useState('')
  const [fClassColor, setFClassColor] = useState('#3b82f6')
  const [fClassPrint, setFClassPrint] = useState(false)

  // Classroom form
  const [fRoomName, setFRoomName] = useState('')
  const [fRoomShort, setFRoomShort] = useState('')
  const [fRoomColor, setFRoomColor] = useState('#14b8a6')

  // Teacher form
  const [fTLastName, setFTLastName] = useState('')
  const [fTFirstName, setFTFirstName] = useState('')
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

  // ─── Data loading ──────────────────────────────────────────────────

  const fetchList = useCallback(async () => {
    const res = await apiFetch('/api/timetable')
    if (res.ok) setTimetableList(await res.json())
  }, [])

  const loadTimetable = useCallback(async (id: string) => {
    setLoading(true)
    const res = await apiFetch(`/api/timetable/${id}`)
    if (res.ok) setCurrent(await res.json())
    setLoading(false)
  }, [])

  useEffect(() => { fetchList() }, [fetchList])

  // ─── Wizard helpers ────────────────────────────────────────────────

  function openWizard() {
    setWizardStep(0)
    setWizardTimetableId(null)
    setWSchoolName(''); setWAcademicYear('2025-2026')
    setWPeriods(8); setWDays(5); setWWeekend(['SATURDAY','SUNDAY'])
    setWTimeOff(''); setWDistrib(''); setWHomework(''); setWMaxOn(''); setWDoc('')
    setShowWizard(true)
  }

  async function wizardNext() {
    if (wizardStep === 0) {
      // Create timetable document on step 1 → Next
      const res = await apiFetch('/api/timetable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: wSchoolName || 'New Timetable',
          academicYear: wAcademicYear,
          periodsPerDay: wPeriods,
          numberOfDays: wDays,
          weekend: wWeekend,
          timeOffRules: wTimeOff || null,
          distribution: wDistrib || null,
          homeworkPrep: wHomework || null,
          maxOnDay: wMaxOn || null,
          docNotes: wDoc || null,
        }),
      })
      if (res.ok) {
        const tt = await res.json()
        setWizardTimetableId(tt.id)
        await loadTimetable(tt.id)
        await fetchList()
      }
    }
    if (wizardStep < WIZARD_STEPS.length - 1) setWizardStep(s => s + 1)
  }

  function wizardPrev() {
    if (wizardStep > 0) setWizardStep(s => s - 1)
  }

  function wizardCancel() {
    setShowWizard(false)
  }

  async function wizardOk() {
    setShowWizard(false)
    if (wizardTimetableId) loadTimetable(wizardTimetableId)
  }

  // ─── CRUD helpers ──────────────────────────────────────────────────

  const ttId = () => wizardTimetableId ?? current?.id ?? ''

  async function saveSubject() {
    const id = ttId(); if (!id) return
    const url = editingItem
      ? `/api/timetable/subjects/${editingItem.id}`
      : `/api/timetable/${id}/subjects`
    const method = editingItem ? 'PUT' : 'POST'
    await apiFetch(url, {
      method, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: fSubjectName, short: fSubjectShort, color: fSubjectColor, classroomCount: fSubjectRooms }),
    })
    await loadTimetable(id)
    setShowSubjectModal(false)
  }

  async function removeSubject(subId: string) {
    const id = ttId(); if (!id) return
    await apiFetch(`/api/timetable/subjects/${subId}`, { method: 'DELETE' })
    await loadTimetable(id)
  }

  async function saveClass() {
    const id = ttId(); if (!id) return
    const url = editingItem ? `/api/timetable/classes/${editingItem.id}` : `/api/timetable/${id}/classes`
    const method = editingItem ? 'PUT' : 'POST'
    await apiFetch(url, {
      method, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: fClassName, short: fClassShort, color: fClassColor, printSubjectPicture: fClassPrint }),
    })
    await loadTimetable(id)
    setShowClassModal(false)
  }

  async function removeClass(clsId: string) {
    const id = ttId(); if (!id) return
    await apiFetch(`/api/timetable/classes/${clsId}`, { method: 'DELETE' })
    await loadTimetable(id)
  }

  async function saveClassroom() {
    const id = ttId(); if (!id) return
    const url = editingItem ? `/api/timetable/classrooms/${editingItem.id}` : `/api/timetable/${id}/classrooms`
    const method = editingItem ? 'PUT' : 'POST'
    await apiFetch(url, {
      method, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: fRoomName, short: fRoomShort, color: fRoomColor }),
    })
    await loadTimetable(id)
    setShowClassroomModal(false)
  }

  async function removeClassroom(rmId: string) {
    const id = ttId(); if (!id) return
    await apiFetch(`/api/timetable/classrooms/${rmId}`, { method: 'DELETE' })
    await loadTimetable(id)
  }

  async function saveTeacher() {
    const id = ttId(); if (!id) return
    const url = editingItem ? `/api/timetable/teachers/${editingItem.id}` : `/api/timetable/${id}/teachers`
    const method = editingItem ? 'PUT' : 'POST'
    await apiFetch(url, {
      method, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lastName: fTLastName, firstName: fTFirstName, short: fTShort,
        sex: fTSex || null, email: fTEmail || null, phone: fTPhone || null,
        color: fTColor, classTeacherId: fTClassTeacher || null,
      }),
    })
    await loadTimetable(id)
    setShowTeacherModal(false)
  }

  async function removeTeacher(tchId: string) {
    const id = ttId(); if (!id) return
    await apiFetch(`/api/timetable/teachers/${tchId}`, { method: 'DELETE' })
    await loadTimetable(id)
  }

  async function saveLesson() {
    const id = ttId(); if (!id) return
    const url = editingItem ? `/api/timetable/lessons/${editingItem.id}` : `/api/timetable/${id}/lessons`
    const method = editingItem ? 'PUT' : 'POST'
    await apiFetch(url, {
      method, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teacherId: fLTeacher, subjectId: fLSubject, classId: fLClass, perWeek: fLPerWeek, lessonType: fLType }),
    })
    await loadTimetable(id)
    setShowLessonModal(false)
  }

  async function removeLesson(lsnId: string) {
    const id = ttId(); if (!id) return
    await apiFetch(`/api/timetable/lessons/${lsnId}`, { method: 'DELETE' })
    await loadTimetable(id)
  }

  async function handleGenerate() {
    const id = current?.id; if (!id) return
    setGenerating(true)
    const res = await apiFetch(`/api/timetable/${id}/generate`, { method: 'POST' })
    if (res.ok) await loadTimetable(id)
    setGenerating(false)
  }

  async function handleSave() {
    if (!current) return
    await apiFetch(`/api/timetable/${current.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: current.status }),
    })
  }

  function handlePrint() { window.print() }

  // ─── Open item in edit modal ───────────────────────────────────────

  function openSubjectModal(item?: TSubject) {
    setEditingItem(item ?? null)
    setFSubjectName(item?.name ?? '')
    setFSubjectShort(item?.short ?? '')
    setFSubjectColor(item?.color ?? '#6366f1')
    setFSubjectRooms(item?.classroomCount ?? 1)
    setShowSubjectModal(true)
  }

  function openClassModal(item?: TClass) {
    setEditingItem(item ?? null)
    setFClassName(item?.name ?? '')
    setFClassShort(item?.short ?? '')
    setFClassColor(item?.color ?? '#3b82f6')
    setFClassPrint(item?.printSubjectPicture ?? false)
    setShowClassModal(true)
  }

  function openClassroomModal(item?: TClassroom) {
    setEditingItem(item ?? null)
    setFRoomName(item?.name ?? '')
    setFRoomShort(item?.short ?? '')
    setFRoomColor(item?.color ?? '#14b8a6')
    setShowClassroomModal(true)
  }

  function openTeacherModal(item?: TTeacher) {
    setEditingItem(item ?? null)
    setFTLastName(item?.lastName ?? '')
    setFTFirstName(item?.firstName ?? '')
    setFTShort(item?.short ?? '')
    setFTSex(item?.sex ?? '')
    setFTEmail(item?.email ?? '')
    setFTPhone(item?.phone ?? '')
    setFTColor(item?.color ?? '#22c55e')
    setFTClassTeacher(item?.classTeacherId ?? '')
    setShowTeacherModal(true)
  }

  function openLessonModal(item?: TLesson) {
    setEditingItem(item ?? null)
    setFLTeacher(item?.teacherId ?? '')
    setFLSubject(item?.subjectId ?? '')
    setFLClass(item?.classId ?? '')
    setFLPerWeek(item?.perWeek ?? 2)
    setFLType(item?.lessonType ?? 'SINGLE')
    setShowLessonModal(true)
  }

  // ─── Grid builder ─────────────────────────────────────────────────

  function buildGrid() {
    if (!current) return null
    const { classes, entries, periodsPerDay, numberOfDays } = current
    const periods = Array.from({ length: periodsPerDay }, (_, i) => i + 1)
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
                {/* Class label cell */}
                <td className="border border-gray-300 px-2 py-1 font-semibold align-top whitespace-nowrap">
                  {colorBadge(cls.color, cls.short)}
                  <div className="text-gray-500 text-[10px] mt-0.5">{cls.name}</div>
                </td>
                {/* Day cells */}
                {days.map(day => {
                  const cells = entries.filter(e => e.classId === cls.id && e.day === day)
                  const sorted = cells.sort((a, b) => a.period - b.period)
                  return (
                    <td key={day} className="border border-gray-300 align-top p-0.5 min-h-[60px]">
                      {sorted.map(e => (
                        <div
                          key={e.id}
                          className="rounded mb-0.5 px-1 py-0.5 text-white text-[10px] leading-tight"
                          style={{ backgroundColor: e.subject.color ?? '#6366f1' }}
                        >
                          <div className="font-semibold">{e.subject.short}</div>
                          <div
                            className="opacity-90 rounded px-0.5 mt-0.5 inline-block"
                            style={{ backgroundColor: e.teacher.color ?? '#374151' }}
                          >
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

  // ─── Render ────────────────────────────────────────────────────────

  return (
    <AuthGuard allowedRoles={['ADMIN']}>
      <div className="flex h-screen bg-gray-100 print:bg-white">
        <Sidebar title="Admin Panel" subtitle="Wattaman" navItems={adminNav} accentColor="indigo" />

        <div className="flex-1 flex flex-col overflow-hidden">
          {/* ── Header toolbar ── */}
          <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-1 flex-wrap print:hidden">
            {/* File ops */}
            <button onClick={openWizard} className="tt-btn bg-indigo-600 text-white">
              New
            </button>
            <button onClick={() => setShowOpenModal(true)} className="tt-btn bg-gray-100 text-gray-700">
              Open
            </button>
            <button onClick={handleSave} disabled={!current} className="tt-btn bg-gray-100 text-gray-700 disabled:opacity-40">
              Save
            </button>
            <button onClick={handlePrint} disabled={!current} className="tt-btn bg-gray-100 text-gray-700 disabled:opacity-40">
              Print
            </button>
            <button onClick={handlePrint} disabled={!current} className="tt-btn bg-gray-100 text-gray-700 disabled:opacity-40">
              Print Preview
            </button>
            <div className="w-px h-6 bg-gray-300 mx-1" />
            {/* Nav shortcuts */}
            <button onClick={() => router.push('/admin/timetable/subjects')} className="tt-btn bg-blue-50 text-blue-700">
              Subject
            </button>
            <button onClick={() => router.push('/admin/timetable/classes')} className="tt-btn bg-blue-50 text-blue-700">
              Class
            </button>
            <button onClick={() => router.push('/admin/timetable/classrooms')} className="tt-btn bg-blue-50 text-blue-700">
              Classrooms
            </button>
            <button onClick={() => router.push('/admin/timetable/teachers')} className="tt-btn bg-blue-50 text-blue-700">
              Teacher
            </button>
            <div className="w-px h-6 bg-gray-300 mx-1" />
            {/* Generate */}
            <button
              onClick={handleGenerate}
              disabled={!current || generating}
              className="tt-btn bg-emerald-600 text-white disabled:opacity-40"
            >
              {generating ? 'Generating…' : 'Test'}
            </button>

            {/* Current doc label */}
            {current && (
              <span className="ml-auto text-sm text-gray-500 truncate max-w-[200px]">
                {current.name} · {current.academicYear}
              </span>
            )}
          </div>

          {/* ── Main content ── */}
          <div className="flex-1 overflow-auto p-4">
            {loading && (
              <div className="flex items-center justify-center h-40 text-gray-400">Loading…</div>
            )}
            {!loading && !current && (
              <div className="flex flex-col items-center justify-center h-64 gap-4 text-gray-400">
                <svg className="w-16 h-16 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-lg">No timetable open</p>
                <p className="text-sm">Click <strong>New</strong> to create one or <strong>Open</strong> to load an existing one.</p>
              </div>
            )}
            {!loading && current && (
              <div className="overflow-auto">
                {buildGrid()}
              </div>
            )}
          </div>

          {/* ── Footer zoom ── */}
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

      {/* ═══ Open Modal ═══════════════════════════════════════════════════════ */}
      {showOpenModal && (
        <ModalShell title="Open Timetable" onClose={() => setShowOpenModal(false)} width="max-w-lg">
          <div className="space-y-1 max-h-80 overflow-y-auto">
            {timetableList.length === 0 && <p className="text-gray-400 text-sm text-center py-8">No timetables saved yet.</p>}
            {timetableList.map(tt => (
              <button key={tt.id}
                className="w-full text-left px-3 py-2 rounded hover:bg-indigo-50 border border-transparent hover:border-indigo-200 transition-colors"
                onClick={async () => { await loadTimetable(tt.id); setShowOpenModal(false) }}
              >
                <div className="font-medium text-gray-800">{tt.name}</div>
                <div className="text-xs text-gray-500">{tt.academicYear} · {tt.status}</div>
              </button>
            ))}
          </div>
        </ModalShell>
      )}

      {/* ═══ Wizard ════════════════════════════════════════════════════════════ */}
      {showWizard && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            {/* Wizard header */}
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-gray-800">New Timetable</h2>
                <p className="text-sm text-gray-500">Step {wizardStep + 1} of {WIZARD_STEPS.length}: {WIZARD_STEPS[wizardStep]}</p>
              </div>
              {/* Step dots */}
              <div className="flex gap-1.5">
                {WIZARD_STEPS.map((_, i) => (
                  <div key={i} className={`w-2.5 h-2.5 rounded-full transition-colors ${i === wizardStep ? 'bg-indigo-600' : i < wizardStep ? 'bg-indigo-300' : 'bg-gray-200'}`} />
                ))}
              </div>
            </div>

            {/* Wizard body */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              {wizardStep === 0 && <WizardStep1
                schoolName={wSchoolName} setSchoolName={setWSchoolName}
                academicYear={wAcademicYear} setAcademicYear={setWAcademicYear}
                periods={wPeriods} setPeriods={setWPeriods}
                days={wDays} setDays={setWDays}
                weekend={wWeekend} setWeekend={setWWeekend}
                timeOff={wTimeOff} setTimeOff={setWTimeOff}
                distrib={wDistrib} setDistrib={setWDistrib}
                homework={wHomework} setHomework={setWHomework}
                maxOn={wMaxOn} setMaxOn={setWMaxOn}
                doc={wDoc} setDoc={setWDoc}
              />}
              {wizardStep === 1 && current && <WizardSubjectStep
                timetable={current}
                onNew={() => openSubjectModal()}
                onEdit={openSubjectModal}
                onRemove={removeSubject}
              />}
              {wizardStep === 2 && current && <WizardClassStep
                timetable={current}
                onNew={() => openClassModal()}
                onEdit={openClassModal}
                onRemove={removeClass}
              />}
              {wizardStep === 3 && current && <WizardClassroomStep
                timetable={current}
                onNew={() => openClassroomModal()}
                onEdit={openClassroomModal}
                onRemove={removeClassroom}
              />}
              {wizardStep === 4 && current && <WizardTeacherStep
                timetable={current}
                onNew={() => openTeacherModal()}
                onEdit={openTeacherModal}
                onRemove={removeTeacher}
                onNewLesson={() => openLessonModal()}
                onEditLesson={openLessonModal}
                onRemoveLesson={removeLesson}
              />}
              {wizardStep === 5 && current && <WizardLessonReview timetable={current} />}
              {wizardStep === 6 && current && <WizardGenerateStep
                timetable={current}
                generating={generating}
                onGenerate={handleGenerate}
              />}
            </div>

            {/* Wizard footer */}
            <div className="px-6 py-3 border-t border-gray-200 flex justify-between">
              <button onClick={wizardCancel} className="tt-btn bg-gray-100 text-gray-700">Cancel</button>
              <div className="flex gap-2">
                {wizardStep > 0 && (
                  <button onClick={wizardPrev} className="tt-btn bg-gray-100 text-gray-700">← Previous</button>
                )}
                {wizardStep < WIZARD_STEPS.length - 1 ? (
                  <button onClick={wizardNext} className="tt-btn bg-indigo-600 text-white">Next →</button>
                ) : (
                  <button onClick={wizardOk} className="tt-btn bg-emerald-600 text-white">OK ✓</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Sub-item Modals ═══════════════════════════════════════════════════ */}

      {showSubjectModal && (
        <ModalShell title={editingItem ? 'Edit Subject' : 'New Subject'} onClose={() => setShowSubjectModal(false)}>
          <SubjectForm
            name={fSubjectName} setName={setFSubjectName}
            short={fSubjectShort} setShort={setFSubjectShort}
            color={fSubjectColor} setColor={setFSubjectColor}
            classroomCount={fSubjectRooms} setClassroomCount={setFSubjectRooms}
          />
          <ModalFooter onOk={saveSubject} onCancel={() => setShowSubjectModal(false)} />
        </ModalShell>
      )}

      {showClassModal && (
        <ModalShell title={editingItem ? 'Edit Class' : 'New Class'} onClose={() => setShowClassModal(false)}>
          <ClassForm
            name={fClassName} setName={setFClassName}
            short={fClassShort} setShort={setFClassShort}
            color={fClassColor} setColor={setFClassColor}
            printSubjectPicture={fClassPrint} setPrintSubjectPicture={setFClassPrint}
          />
          <ModalFooter onOk={saveClass} onCancel={() => setShowClassModal(false)} />
        </ModalShell>
      )}

      {showClassroomModal && (
        <ModalShell title={editingItem ? 'Edit Classroom' : 'New Classroom'} onClose={() => setShowClassroomModal(false)}>
          <ClassroomForm
            name={fRoomName} setName={setFRoomName}
            short={fRoomShort} setShort={setFRoomShort}
            color={fRoomColor} setColor={setFRoomColor}
          />
          <ModalFooter onOk={saveClassroom} onCancel={() => setShowClassroomModal(false)} />
        </ModalShell>
      )}

      {showTeacherModal && (
        <ModalShell title={editingItem ? 'Edit Teacher' : 'New Teacher'} onClose={() => setShowTeacherModal(false)} width="max-w-lg">
          <TeacherForm
            lastName={fTLastName} setLastName={setFTLastName}
            firstName={fTFirstName} setFirstName={setFTFirstName}
            short={fTShort} setShort={setFTShort}
            sex={fTSex} setSex={setFTSex}
            email={fTEmail} setEmail={setFTEmail}
            phone={fTPhone} setPhone={setFTPhone}
            color={fTColor} setColor={setFTColor}
            classTeacherId={fTClassTeacher} setClassTeacherId={setFTClassTeacher}
            classes={current?.classes ?? []}
          />
          <ModalFooter onOk={saveTeacher} onCancel={() => setShowTeacherModal(false)} />
        </ModalShell>
      )}

      {showLessonModal && (
        <ModalShell title={editingItem ? 'Edit Lesson' : 'New Lesson'} onClose={() => setShowLessonModal(false)}>
          <LessonForm
            teacherId={fLTeacher} setTeacherId={setFLTeacher}
            subjectId={fLSubject} setSubjectId={setFLSubject}
            classId={fLClass} setClassId={setFLClass}
            perWeek={fLPerWeek} setPerWeek={setFLPerWeek}
            lessonType={fLType} setLessonType={setFLType}
            teachers={current?.teachers ?? []}
            subjects={current?.subjects ?? []}
            classes={current?.classes ?? []}
          />
          <ModalFooter onOk={saveLesson} onCancel={() => setShowLessonModal(false)} />
        </ModalShell>
      )}

      {/* Print styles */}
      <style jsx global>{`
        .tt-btn { padding: 4px 12px; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer; border: 1px solid transparent; transition: opacity .15s; }
        .tt-btn:hover { opacity: .85; }
        @media print {
          .print\\:hidden { display: none !important; }
          .print\\:bg-white { background: white !important; }
        }
      `}</style>
    </AuthGuard>
  )
}

// ═══ Wizard Step Components ══════════════════════════════════════════════════

function WizardStep1({ schoolName, setSchoolName, academicYear, setAcademicYear,
  periods, setPeriods, days, setDays, weekend, setWeekend,
  timeOff, setTimeOff, distrib, setDistrib, homework, setHomework,
  maxOn, setMaxOn, doc, setDoc }: any) {
  function toggleWeekend(day: string) {
    setWeekend((prev: string[]) =>
      prev.includes(day) ? prev.filter((d: string) => d !== day) : [...prev, day]
    )
  }
  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-gray-700">School & Schedule Settings</h3>
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="label-sm">Name of School</label>
          <input className="input-field" value={schoolName} onChange={e => setSchoolName(e.target.value)} placeholder="e.g. Wattaman School" />
        </div>
        <div>
          <label className="label-sm">Academic Year</label>
          <input className="input-field" value={academicYear} onChange={e => setAcademicYear(e.target.value)} placeholder="2025-2026" />
        </div>
        <div>
          <label className="label-sm">Periods per Day</label>
          <input type="number" className="input-field" value={periods} onChange={e => setPeriods(+e.target.value)} min={1} max={20} />
        </div>
        <div>
          <label className="label-sm">Number of Days</label>
          <input type="number" className="input-field" value={days} onChange={e => setDays(+e.target.value)} min={1} max={7} />
        </div>
        <div>
          <label className="label-sm">Max Lessons on One Day</label>
          <input type="number" className="input-field" value={maxOn} onChange={e => setMaxOn(e.target.value ? +e.target.value : '')} min={1} placeholder="Optional" />
        </div>
      </div>
      <div>
        <label className="label-sm">Weekend Days (non-teaching)</label>
        <div className="flex flex-wrap gap-2 mt-1">
          {WEEKENDS.map(d => (
            <button key={d} type="button"
              onClick={() => toggleWeekend(d)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${weekend.includes(d) ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 text-gray-600 hover:border-indigo-300'}`}>
              {d.slice(0, 3)}
            </button>
          ))}
        </div>
      </div>
      {/* Advanced fields */}
      <div className="border-t pt-3 grid grid-cols-1 gap-3">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Advanced</h4>
        <div>
          <label className="label-sm">Time Off Rules</label>
          <input className="input-field" value={timeOff} onChange={e => setTimeOff(e.target.value)} placeholder="e.g. No lesson 12:00-13:00" />
        </div>
        <div>
          <label className="label-sm">Distribution</label>
          <input className="input-field" value={distrib} onChange={e => setDistrib(e.target.value)} placeholder="e.g. max 2 same subject per day" />
        </div>
        <div>
          <label className="label-sm">Homework Preparation</label>
          <input className="input-field" value={homework} onChange={e => setHomework(e.target.value)} placeholder="Notes…" />
        </div>
        <div>
          <label className="label-sm">Doc Notes</label>
          <textarea className="input-field resize-none" rows={2} value={doc} onChange={e => setDoc(e.target.value)} />
        </div>
      </div>
    </div>
  )
}

function WizardSubjectStep({ timetable, onNew, onEdit, onRemove }: {
  timetable: Timetable; onNew: () => void
  onEdit: (s: TSubject) => void; onRemove: (id: string) => void
}) {
  return (
    <WizardListStep
      title="Subjects"
      items={timetable.subjects}
      onNew={onNew}
      columns={['Name', 'Short', 'Rooms', 'Color']}
      renderRow={(s: TSubject) => [
        s.name,
        s.short,
        String(s.classroomCount),
        colorBadge(s.color, '  '),
      ]}
      onEdit={(s: TSubject) => onEdit(s)}
      onRemove={(s: TSubject) => onRemove(s.id)}
    />
  )
}

function WizardClassStep({ timetable, onNew, onEdit, onRemove }: {
  timetable: Timetable; onNew: () => void
  onEdit: (c: TClass) => void; onRemove: (id: string) => void
}) {
  return (
    <WizardListStep
      title="Classes"
      items={timetable.classes}
      onNew={onNew}
      columns={['Name', 'Short', 'Color', 'Print Pic']}
      renderRow={(c: TClass) => [c.name, c.short, colorBadge(c.color, '  '), c.printSubjectPicture ? '✓' : '—']}
      onEdit={(c: TClass) => onEdit(c)}
      onRemove={(c: TClass) => onRemove(c.id)}
    />
  )
}

function WizardClassroomStep({ timetable, onNew, onEdit, onRemove }: {
  timetable: Timetable; onNew: () => void
  onEdit: (r: TClassroom) => void; onRemove: (id: string) => void
}) {
  return (
    <WizardListStep
      title="Classrooms"
      items={timetable.classrooms}
      onNew={onNew}
      columns={['Name', 'Short', 'Color']}
      renderRow={(r: TClassroom) => [r.name, r.short, colorBadge(r.color, '  ')]}
      onEdit={(r: TClassroom) => onEdit(r)}
      onRemove={(r: TClassroom) => onRemove(r.id)}
    />
  )
}

function WizardTeacherStep({ timetable, onNew, onEdit, onRemove, onNewLesson, onEditLesson, onRemoveLesson }: {
  timetable: Timetable; onNew: () => void; onNewLesson: () => void
  onEdit: (t: TTeacher) => void; onRemove: (id: string) => void
  onEditLesson: (l: TLesson) => void; onRemoveLesson: (id: string) => void
}) {
  return (
    <div className="space-y-5">
      <WizardListStep
        title="Teachers"
        items={timetable.teachers}
        onNew={onNew}
        columns={['Last Name', 'First', 'Short', 'Color', 'Class Teacher']}
        renderRow={(t: TTeacher) => [
          t.lastName, t.firstName, t.short,
          colorBadge(t.color, '  '),
          t.classTeacher?.short ?? '—',
        ]}
        onEdit={(t: TTeacher) => onEdit(t)}
        onRemove={(t: TTeacher) => onRemove(t.id)}
      />
      <div className="border-t pt-4">
        <WizardListStep
          title="Lesson Contracts"
          items={timetable.lessons}
          onNew={onNewLesson}
          columns={['Teacher', 'Subject', 'Class', '/Week', 'Type']}
          renderRow={(l: TLesson) => [
            l.teacher.short, l.subject.short, l.class.short,
            String(l.perWeek), l.lessonType,
          ]}
          onEdit={(l: TLesson) => onEditLesson(l)}
          onRemove={(l: TLesson) => onRemoveLesson(l.id)}
        />
      </div>
    </div>
  )
}

function WizardLessonReview({ timetable }: { timetable: Timetable }) {
  const total = timetable.lessons.reduce((s, l) => s + l.perWeek, 0)
  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-gray-700">Lesson Summary</h3>
      <p className="text-sm text-gray-500">{timetable.lessons.length} lesson contracts · {total} periods/week total</p>
      <div className="overflow-auto max-h-64">
        <table className="w-full text-xs border-collapse">
          <thead><tr className="bg-gray-100">
            {['Teacher','Subject','Class','/Week','Type'].map(h => (
              <th key={h} className="border border-gray-200 px-2 py-1 text-left font-semibold text-gray-600">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {timetable.lessons.map(l => (
              <tr key={l.id} className="hover:bg-gray-50">
                <td className="border border-gray-200 px-2 py-1">{l.teacher.lastName} {l.teacher.firstName}</td>
                <td className="border border-gray-200 px-2 py-1">{l.subject.name}</td>
                <td className="border border-gray-200 px-2 py-1">{l.class.name}</td>
                <td className="border border-gray-200 px-2 py-1 text-center">{l.perWeek}</td>
                <td className="border border-gray-200 px-2 py-1">{l.lessonType}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function WizardGenerateStep({ timetable, generating, onGenerate }: {
  timetable: Timetable; generating: boolean; onGenerate: () => void
}) {
  return (
    <div className="space-y-4 text-center py-4">
      <div className="text-5xl">📅</div>
      <h3 className="font-bold text-gray-800 text-lg">Ready to Generate</h3>
      <p className="text-gray-500 text-sm">
        {timetable.classes.length} classes · {timetable.lessons.length} lesson contracts ·{' '}
        {timetable.periodsPerDay} periods/day · {timetable.numberOfDays} days
      </p>
      <p className="text-gray-400 text-xs">
        The generator will fill the timetable grid automatically using a greedy algorithm.<br/>
        You can manually adjust cells after generation.
      </p>
      <button
        onClick={onGenerate}
        disabled={generating}
        className="mt-4 px-8 py-3 bg-emerald-600 text-white rounded-lg font-semibold hover:bg-emerald-700 disabled:opacity-40 transition-colors"
      >
        {generating ? 'Generating…' : '🚀 Generate Timetable'}
      </button>
      {timetable.entries.length > 0 && (
        <p className="text-emerald-600 text-sm font-medium">✓ {timetable.entries.length} entries generated</p>
      )}
    </div>
  )
}

// ═══ Generic Wizard List Step ════════════════════════════════════════════════

function WizardListStep({ title, items, onNew, columns, renderRow, onEdit, onRemove }: {
  title: string; items: any[]; onNew: () => void
  columns: string[]; renderRow: (item: any) => any[]
  onEdit: (item: any) => void; onRemove: (item: any) => void
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-700">{title} <span className="text-gray-400 font-normal text-sm">({items.length})</span></h3>
        <button onClick={onNew} className="tt-btn bg-indigo-600 text-white text-xs">+ New</button>
      </div>
      {items.length === 0 ? (
        <p className="text-gray-400 text-sm text-center py-6 border border-dashed rounded-lg">No {title.toLowerCase()} added yet. Click + New to add one.</p>
      ) : (
        <div className="overflow-auto max-h-48 rounded-lg border border-gray-200">
          <table className="w-full text-xs border-collapse">
            <thead><tr className="bg-gray-50 sticky top-0">
              {columns.map(c => (
                <th key={c} className="border-b border-gray-200 px-2 py-1.5 text-left font-semibold text-gray-600">{c}</th>
              ))}
              <th className="border-b border-gray-200 px-2 py-1.5 text-right font-semibold text-gray-600">Actions</th>
            </tr></thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={item.id} className="hover:bg-gray-50 even:bg-gray-50/50">
                  {renderRow(item).map((cell, ci) => (
                    <td key={ci} className="border-b border-gray-100 px-2 py-1">{cell}</td>
                  ))}
                  <td className="border-b border-gray-100 px-2 py-1 text-right whitespace-nowrap">
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

// ═══ Form Components ═════════════════════════════════════════════════════════

function SubjectForm({ name, setName, short, setShort, color, setColor, classroomCount, setClassroomCount }: any) {
  return (
    <div className="space-y-3">
      <Field label="Name"><input className="input-field" value={name} onChange={e => setName(e.target.value)} /></Field>
      <Field label="Short Name"><input className="input-field" value={short} onChange={e => setShort(e.target.value)} maxLength={8} /></Field>
      <Field label="Classroom Count"><input type="number" className="input-field" value={classroomCount} onChange={e => setClassroomCount(+e.target.value)} min={1} /></Field>
      <Field label="Color"><ColorPicker value={color} onChange={setColor} /></Field>
    </div>
  )
}

function ClassForm({ name, setName, short, setShort, color, setColor, printSubjectPicture, setPrintSubjectPicture }: any) {
  return (
    <div className="space-y-3">
      <Field label="Class Name"><input className="input-field" value={name} onChange={e => setName(e.target.value)} /></Field>
      <Field label="Short Name"><input className="input-field" value={short} onChange={e => setShort(e.target.value)} maxLength={8} /></Field>
      <Field label="Color"><ColorPicker value={color} onChange={setColor} /></Field>
      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
        <input type="checkbox" checked={printSubjectPicture} onChange={e => setPrintSubjectPicture(e.target.checked)} className="rounded" />
        Print subject picture on timetable
      </label>
    </div>
  )
}

function ClassroomForm({ name, setName, short, setShort, color, setColor }: any) {
  return (
    <div className="space-y-3">
      <Field label="Classroom Name"><input className="input-field" value={name} onChange={e => setName(e.target.value)} /></Field>
      <Field label="Short Name"><input className="input-field" value={short} onChange={e => setShort(e.target.value)} maxLength={8} /></Field>
      <Field label="Color"><ColorPicker value={color} onChange={setColor} /></Field>
    </div>
  )
}

function TeacherForm({ lastName, setLastName, firstName, setFirstName, short, setShort,
  sex, setSex, email, setEmail, phone, setPhone, color, setColor,
  classTeacherId, setClassTeacherId, classes }: any) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Last Name"><input className="input-field" value={lastName} onChange={e => setLastName(e.target.value)} /></Field>
        <Field label="First Name"><input className="input-field" value={firstName} onChange={e => setFirstName(e.target.value)} /></Field>
      </div>
      <Field label="Short Name"><input className="input-field" value={short} onChange={e => setShort(e.target.value)} maxLength={8} /></Field>
      <Field label="Sex">
        <div className="flex gap-4">
          <label className="flex items-center gap-1.5 text-sm cursor-pointer">
            <input type="radio" name="sex" value="MALE" checked={sex === 'MALE'} onChange={() => setSex('MALE')} /> Male
          </label>
          <label className="flex items-center gap-1.5 text-sm cursor-pointer">
            <input type="radio" name="sex" value="FEMALE" checked={sex === 'FEMALE'} onChange={() => setSex('FEMALE')} /> Female
          </label>
        </div>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="E-mail"><input type="email" className="input-field" value={email} onChange={e => setEmail(e.target.value)} /></Field>
        <Field label="Phone"><input className="input-field" value={phone} onChange={e => setPhone(e.target.value)} /></Field>
      </div>
      <Field label="Class Teacher for">
        <select className="input-field" value={classTeacherId} onChange={e => setClassTeacherId(e.target.value)}>
          <option value="">— None —</option>
          {classes.map((c: TClass) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field label="Color"><ColorPicker value={color} onChange={setColor} /></Field>
    </div>
  )
}

function LessonForm({ teacherId, setTeacherId, subjectId, setSubjectId, classId, setClassId,
  perWeek, setPerWeek, lessonType, setLessonType, teachers, subjects, classes }: any) {
  return (
    <div className="space-y-3">
      <Field label="Teacher">
        <select className="input-field" value={teacherId} onChange={e => setTeacherId(e.target.value)}>
          <option value="">Select teacher</option>
          {teachers.map((t: TTeacher) => <option key={t.id} value={t.id}>{t.lastName} {t.firstName}</option>)}
        </select>
      </Field>
      <Field label="Subject">
        <select className="input-field" value={subjectId} onChange={e => setSubjectId(e.target.value)}>
          <option value="">Select subject</option>
          {subjects.map((s: TSubject) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </Field>
      <Field label="Class">
        <select className="input-field" value={classId} onChange={e => setClassId(e.target.value)}>
          <option value="">Select class</option>
          {classes.map((c: TClass) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <Field label="Lessons / Week">
        <select className="input-field" value={perWeek} onChange={e => setPerWeek(+e.target.value)}>
          {[1,2,3,4,5,6,7,8,9,10].map(n => <option key={n} value={n}>{n} per week</option>)}
        </select>
      </Field>
      <Field label="Lesson Type">
        <select className="input-field" value={lessonType} onChange={e => setLessonType(e.target.value)}>
          {LESSON_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </Field>
    </div>
  )
}

// ═══ UI Primitives ══════════════════════════════════════════════════════════

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label-sm">{label}</label>
      {children}
    </div>
  )
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {COLOR_PALETTE.map(c => (
        <button key={c} type="button"
          onClick={() => onChange(c)}
          className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${value === c ? 'border-gray-800 scale-110' : 'border-transparent'}`}
          style={{ backgroundColor: c }}
        />
      ))}
      <input type="color" value={value} onChange={e => onChange(e.target.value)}
        className="w-8 h-8 rounded cursor-pointer border-0" title="Custom color" />
    </div>
  )
}

function ModalShell({ title, onClose, children, width = 'max-w-md' }: {
  title: string; onClose: () => void; children: React.ReactNode; width?: string
}) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className={`bg-white rounded-xl shadow-xl w-full ${width} max-h-[80vh] flex flex-col`}>
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-bold text-gray-800">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

function ModalFooter({ onOk, onCancel }: { onOk: () => void; onCancel: () => void }) {
  return (
    <div className="flex justify-end gap-2 pt-4 border-t border-gray-100 mt-4">
      <button onClick={onCancel} className="tt-btn bg-gray-100 text-gray-700">Cancel</button>
      <button onClick={onOk} className="tt-btn bg-indigo-600 text-white">OK</button>
    </div>
  )
}
