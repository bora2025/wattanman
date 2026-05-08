'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import Sidebar from '../../../components/Sidebar'
import AuthGuard from '../../../components/AuthGuard'
import { adminNav } from '../../../lib/admin-nav'
import { apiFetch } from '../../../lib/api'
import { useLanguage } from '../../../lib/i18n'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScoreSubject {
  id: string; name: string; maxScore: number; color: string; order: number; timetableSubjectId?: string | null
}
interface ScoreExamTab {
  id: string; label: string; type: string; order: number
}
interface ScoreSheetClass {
  id: string; classId: string
}
interface ScoreSheet {
  id: string; name: string; logoUrl: string | null; studyYearId: string | null
  classes: ScoreSheetClass[]; subjects: ScoreSubject[]; examTabs: ScoreExamTab[]
}
interface StudentRow {
  id: string; studentNumber: string; name: string; sex: string | null; classId: string | null; className: string | null
}
interface ClassOption {
  id: string; name: string; studyYearId: string | null
}
interface StudyYearOption {
  id: string; year: number; label: string | null; isCurrent: boolean
}
interface TimetableSubject {
  id: string; name: string; short: string; color: string | null
  timetable: { name: string; academicYear: string }
}
interface ScoreEntryData {
  studentId: string; subjectId: string; score: number | null; formula?: string | null
}

// ─── Formula Evaluator ────────────────────────────────────────────────────────

function isSafeFormula(expr: string): boolean {
  return /^[0-9A-Za-z\s\+\-\*\/\.\,\(\)\<\>\=\!\?:\s]+$/.test(expr)
}

function evalFormula(
  formula: string,
  rowScores: Record<string, number | null>,
  subjects: ScoreSubject[],
): number | null {
  const expr = formula.slice(1).trim()
  if (!isSafeFormula(expr)) return null

  // Replace column letters A,B,C... with numeric values from same-row subjects
  let js = expr
    .replace(/\bAVERAGE\b/gi, '__AVG__')
    .replace(/\bSUM\b/gi, '__SUM__')
    .replace(/\bIF\b/gi, '__IF__')

  // Replace subject names (full word match) with their scores
  for (const sub of subjects) {
    const safe = sub.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    js = js.replace(new RegExp(`\\b${safe}\\b`, 'gi'), String(rowScores[sub.id] ?? 0))
  }

  // Replace column refs A,B,C...
  js = js.replace(/\b([A-Z])\b/g, (_, col) => {
    const idx = col.charCodeAt(0) - 65
    const sub = subjects[idx]
    return sub ? String(rowScores[sub.id] ?? 0) : '0'
  })

  // Expand SUM(a,b,c) -> (a+b+c)
  js = js.replace(/__SUM__\(([^)]+)\)/g, (_: string, args: string) => `(${args.split(',').join('+')})`  )

  // Expand AVERAGE(a,b,c) -> ((a+b+c)/n)
  js = js.replace(/__AVG__\(([^)]+)\)/g, (_: string, args: string) => {
    const parts = args.split(',')
    return `((${parts.join('+')})/${parts.length})`
  })

  // IF(cond,t,f) -> (cond?t:f)
  js = js.replace(/__IF__\(([^,]+),([^,]+),([^)]+)\)/g, (_: string, c: string, t: string, f: string) => `((${c})?(${t}):(${f}))`)

  try {
    const fn = new Function(`"use strict"; return (${js})`)
    const result = fn()
    return typeof result === 'number' && isFinite(result) ? result : null
  } catch {
    return null
  }
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

function ToolBtn({ icon, label, onClick, danger, disabled }: {
  icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean; disabled?: boolean
}) {
  return (
    <button onClick={onClick} disabled={disabled} title={label}
      className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded text-xs font-medium transition-colors disabled:opacity-40
        ${danger ? 'text-red-600 hover:bg-red-50' : 'text-gray-700 hover:bg-gray-100'}`}>
      <span className="text-base leading-none select-none">{icon}</span>
      <span className="whitespace-nowrap">{label}</span>
    </button>
  )
}

function Divider() { return <div className="w-px h-8 bg-gray-200 mx-0.5 self-center" /> }

function Modal({ title, onClose, children, wide }: {
  title: string; onClose: () => void; children: React.ReactNode; wide?: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className={`bg-white rounded-xl shadow-2xl w-full flex flex-col max-h-[90vh] ${wide ? 'max-w-2xl' : 'max-w-lg'}`}>
        <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
          <h2 className="font-semibold text-gray-800">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 w-6 h-6 flex items-center justify-center">×</button>
        </div>
        <div className="p-6 overflow-y-auto">{children}</div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

type WizardStep = 'year' | 'classes' | 'subject' | 'month'
const WIZARD_STEPS: WizardStep[] = ['year', 'classes', 'subject', 'month']

export default function ScoringPage() {
  const { t } = useLanguage()
  const tableRef = useRef<HTMLDivElement>(null)
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Sheet state
  const [sheets, setSheets] = useState<ScoreSheet[]>([])
  const [activeSheet, setActiveSheet] = useState<ScoreSheet | null>(null)
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [students, setStudents] = useState<StudentRow[]>([])
  const [scores, setScores] = useState<Record<string, Record<string, number | null>>>({})
  const [formulas, setFormulas] = useState<Record<string, Record<string, string>>>({})
  const [editingCell, setEditingCell] = useState<{ sId: string; subId: string } | null>(null)
  const [dirtyScores, setDirtyScores] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [autoSaveLabel, setAutoSaveLabel] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [filterClassId, setFilterClassId] = useState<string>('ALL')
  const [zoom, setZoom] = useState(1)

  // ── Reference data
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [studyYears, setStudyYears] = useState<StudyYearOption[]>([])
  const [timetableSubjects, setTimetableSubjects] = useState<TimetableSubject[]>([])
  const [selectedTimetableSubs, setSelectedTimetableSubs] = useState<Set<string>>(new Set())

  // ── Modals
  const [showOpenModal, setShowOpenModal] = useState(false)
  const [showNewWizard, setShowNewWizard] = useState(false)
  const [showSubjectModal, setShowSubjectModal] = useState(false)
  const [showMonthModal, setShowMonthModal] = useState(false)
  const [showClassModal, setShowClassModal] = useState(false)
  const [showDeleteSheetConfirm, setShowDeleteSheetConfirm] = useState(false)
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [subjectTab, setSubjectTab] = useState<'manual' | 'import'>('manual')

  // ── Wizard state
  const [wizardStep, setWizardStep] = useState<WizardStep>('year')
  const [wStudyYearId, setWStudyYearId] = useState('')
  const [wNewYearLabel, setWNewYearLabel] = useState('')
  const [wShowNewYear, setWShowNewYear] = useState(false)
  const [wClassIds, setWClassIds] = useState<Set<string>>(new Set())
  const [wLogoUrl, setWLogoUrl] = useState('')
  const [creatingSheet, setCreatingSheet] = useState<ScoreSheet | null>(null)

  // ── Subject form
  const [editSubject, setEditSubject] = useState<ScoreSubject | null>(null)
  const [subjectName, setSubjectName] = useState('')
  const [subjectMax, setSubjectMax] = useState(100)
  const [subjectColor, setSubjectColor] = useState('#000000')

  // ── Exam tab form
  const [tabLabel, setTabLabel] = useState('')
  const [tabType, setTabType] = useState('MONTHLY')

  // ── Class modal for active sheet
  const [editClassIds, setEditClassIds] = useState<Set<string>>(new Set())

  // ─── Data fetch ───────────────────────────────────────────────────────────

  const fetchSheets = useCallback(async () => {
    const res = await apiFetch('/api/scoring/sheets')
    if (res.ok) setSheets(await res.json())
  }, [])

  const fetchRefs = useCallback(async () => {
    const [r1, r2, r3] = await Promise.all([
      apiFetch('/api/classes'),
      apiFetch('/api/study-years'),
      apiFetch('/api/scoring/timetable-subjects'),
    ])
    if (r1.ok) setClasses(await r1.json())
    if (r2.ok) setStudyYears(await r2.json())
    if (r3.ok) setTimetableSubjects(await r3.json())
  }, [])

  useEffect(() => { fetchSheets(); fetchRefs() }, [fetchSheets, fetchRefs])

  useEffect(() => {
    if (!activeTabId || !activeSheet) { setStudents([]); setScores({}); setFormulas({}); return }
    const classIds = activeSheet.classes.map(c => c.classId)
    const q = classIds.length ? `?classIds=${classIds.join(',')}` : ''
    apiFetch(`/api/scoring/exam-tabs/${activeTabId}/scores${q}`).then(async res => {
      if (!res.ok) return
      const data: {
        entries: ScoreEntryData[]
        students: Array<{ id: string; studentNumber: string; user: { name: string }; sex: string | null; class: { id: string; name: string } | null }>
      } = await res.json()
      setStudents(data.students.map(s => ({
        id: s.id, studentNumber: s.studentNumber || '', name: s.user?.name || '',
        sex: s.sex, classId: s.class?.id ?? null, className: s.class?.name ?? null,
      })))
      const scoreMap: Record<string, Record<string, number | null>> = {}
      const formulaMap: Record<string, Record<string, string>> = {}
      for (const e of data.entries) {
        if (!scoreMap[e.studentId]) scoreMap[e.studentId] = {}
        scoreMap[e.studentId][e.subjectId] = e.score
        if (e.formula) {
          if (!formulaMap[e.studentId]) formulaMap[e.studentId] = {}
          formulaMap[e.studentId][e.subjectId] = e.formula
        }
      }
      setScores(scoreMap); setFormulas(formulaMap); setDirtyScores(new Set())
    })
  }, [activeTabId, activeSheet])

  // ─── Helpers ─────────────────────────────────────────────────────────────

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok }); setTimeout(() => setToast(null), 3000)
  }

  const refreshSheet = async (id: string): Promise<ScoreSheet | null> => {
    const res = await apiFetch(`/api/scoring/sheets/${id}`)
    if (!res.ok) return null
    const fresh: ScoreSheet = await res.json()
    setSheets(prev => prev.map(s => s.id === id ? fresh : s))
    return fresh
  }

  const openSheet = (sheet: ScoreSheet) => {
    setActiveSheet(sheet); setActiveTabId(sheet.examTabs[0]?.id ?? null)
    setFilterClassId('ALL'); setShowOpenModal(false)
  }

  const currentSheet = showNewWizard ? creatingSheet : activeSheet

  const yearLabel = (sy: StudyYearOption) => sy.label || `${sy.year}-${sy.year + 1}`

  // ─── Save / auto-save ─────────────────────────────────────────────────────

  const performSave = useCallback(async (
    tabId: string, dirty: Set<string>,
    sc: Record<string, Record<string, number | null>>,
    fm: Record<string, Record<string, string>>,
  ) => {
    if (!dirty.size) return
    const entries = Array.from(dirty).map((key: string) => {
      const [studentId, subjectId] = key.split(':')
      return { examTabId: tabId, subjectId, studentId, score: sc[studentId]?.[subjectId] ?? null, formula: fm[studentId]?.[subjectId] ?? null }
    })
    const res = await apiFetch('/api/scoring/entries/bulk', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries }),
    })
    if (res.ok) { setDirtyScores(new Set()); setAutoSaveLabel(t('scoring.autoSaved')); setTimeout(() => setAutoSaveLabel(null), 2500) }
  }, [t])

  const saveScores = async () => {
    if (!activeTabId || dirtyScores.size === 0) return
    setSaving(true)
    try {
      const entries = Array.from(dirtyScores).map((key: string) => {
        const [studentId, subjectId] = key.split(':')
        return { examTabId: activeTabId, subjectId, studentId, score: scores[studentId]?.[subjectId] ?? null, formula: formulas[studentId]?.[subjectId] ?? null }
      })
      const res = await apiFetch('/api/scoring/entries/bulk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entries }),
      })
      if (res.ok) { setDirtyScores(new Set()); showToast(t('scoring.saved')) }
      else showToast(t('scoring.saveFailed'), false)
    } catch { showToast(t('scoring.saveFailed'), false) }
    finally { setSaving(false) }
  }

  // ─── Wizard ───────────────────────────────────────────────────────────────

  const startWizard = () => {
    setWizardStep('year'); setWStudyYearId(''); setWNewYearLabel(''); setWShowNewYear(false)
    setWClassIds(new Set()); setWLogoUrl(''); setCreatingSheet(null); setShowNewWizard(true)
  }

  const wizardIndex = WIZARD_STEPS.indexOf(wizardStep)

  const handleWizardNext = async () => {
    if (wizardStep === 'year') {
      let syId = wStudyYearId
      if (wShowNewYear && wNewYearLabel.trim()) {
        // Create new study year
        const parts = wNewYearLabel.match(/(\d{4})/)
        const year = parts ? parseInt(parts[1]) : new Date().getFullYear()
        const res = await apiFetch('/api/study-years', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ year, label: wNewYearLabel.trim() }),
        })
        if (res.ok) { const sy: StudyYearOption = await res.json(); syId = sy.id; setStudyYears(prev => [sy, ...prev]); setWStudyYearId(sy.id) }
        else { showToast('Failed to create academic year', false); return }
      }
      if (!syId) return
      const label = studyYears.find(y => y.id === syId) ? yearLabel(studyYears.find(y => y.id === syId)!) : wNewYearLabel
      // Create sheet
      const res = await apiFetch('/api/scoring/sheets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: label, logoUrl: wLogoUrl || undefined, studyYearId: syId }),
      })
      if (res.ok) {
        const sheet: ScoreSheet = await res.json()
        setCreatingSheet(sheet); setSheets(prev => [sheet, ...prev]); setWizardStep('classes')
      }
    } else if (wizardStep === 'classes') {
      if (creatingSheet && wClassIds.size > 0) {
        const res = await apiFetch(`/api/scoring/sheets/${creatingSheet.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ classIds: Array.from(wClassIds) }),
        })
        if (res.ok) { const fresh: ScoreSheet = await res.json(); setCreatingSheet(fresh); setSheets(prev => prev.map(s => s.id === fresh.id ? fresh : s)) }
      }
      setWizardStep('subject')
    } else if (wizardStep === 'subject') {
      setWizardStep('month')
    } else {
      if (creatingSheet) { const fresh = await refreshSheet(creatingSheet.id); if (fresh) openSheet(fresh) }
      setShowNewWizard(false); setCreatingSheet(null)
    }
  }

  const handleWizardBack = () => {
    if (wizardIndex === 0) { setShowNewWizard(false); return }
    setWizardStep(WIZARD_STEPS[wizardIndex - 1])
  }

  // ─── Subjects ─────────────────────────────────────────────────────────────

  const resetSubjectForm = () => { setEditSubject(null); setSubjectName(''); setSubjectMax(100); setSubjectColor('#000000') }
  const openEditSubject = (s: ScoreSubject) => { setEditSubject(s); setSubjectName(s.name); setSubjectMax(s.maxScore); setSubjectColor(s.color) }

  const saveSubject = async () => {
    const sheetId = currentSheet?.id
    if (!sheetId || !subjectName.trim()) return
    let res: Response
    if (editSubject) {
      res = await apiFetch(`/api/scoring/subjects/${editSubject.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: subjectName, maxScore: subjectMax, color: subjectColor }),
      })
    } else {
      res = await apiFetch(`/api/scoring/sheets/${sheetId}/subjects`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: subjectName, maxScore: subjectMax, color: subjectColor }),
      })
    }
    if (res.ok) {
      const fresh = await refreshSheet(sheetId)
      if (fresh) { if (activeSheet?.id === sheetId) setActiveSheet(fresh); if (creatingSheet?.id === sheetId) setCreatingSheet(fresh) }
      resetSubjectForm()
    }
  }

  const importTimetableSubjects = async () => {
    const sheetId = currentSheet?.id
    if (!sheetId || !selectedTimetableSubs.size) return
    const toAdd = timetableSubjects.filter(s => selectedTimetableSubs.has(s.id))
    for (const s of toAdd) {
      await apiFetch(`/api/scoring/sheets/${sheetId}/subjects`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: s.name, color: s.color ?? '#000000', timetableSubjectId: s.id }),
      })
    }
    const fresh = await refreshSheet(sheetId)
    if (fresh) { if (activeSheet?.id === sheetId) setActiveSheet(fresh); if (creatingSheet?.id === sheetId) setCreatingSheet(fresh) }
    setSelectedTimetableSubs(new Set())
  }

  const deleteSubject = async (s: ScoreSubject) => {
    if (!confirm(t('scoring.deleteSubjectConfirm'))) return
    const sheetId = currentSheet?.id
    if (!sheetId) return
    const res = await apiFetch(`/api/scoring/subjects/${s.id}`, { method: 'DELETE' })
    if (res.ok) {
      const fresh = await refreshSheet(sheetId)
      if (fresh) { if (activeSheet?.id === sheetId) setActiveSheet(fresh); if (creatingSheet?.id === sheetId) setCreatingSheet(fresh) }
    }
  }

  // ─── Exam Tabs ────────────────────────────────────────────────────────────

  const saveTab = async () => {
    const sheetId = currentSheet?.id
    if (!sheetId || !tabLabel.trim()) return
    const res = await apiFetch(`/api/scoring/sheets/${sheetId}/exam-tabs`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: tabLabel, type: tabType }),
    })
    if (res.ok) {
      const fresh = await refreshSheet(sheetId)
      if (fresh) {
        if (activeSheet?.id === sheetId) { setActiveSheet(fresh); if (!activeTabId) setActiveTabId(fresh.examTabs[0]?.id ?? null) }
        if (creatingSheet?.id === sheetId) setCreatingSheet(fresh)
      }
      setTabLabel('')
    }
  }

  const deleteTab = async (tabId: string) => {
    if (!confirm(t('scoring.deleteTabConfirm'))) return
    const sheetId = currentSheet?.id
    if (!sheetId) return
    const res = await apiFetch(`/api/scoring/exam-tabs/${tabId}`, { method: 'DELETE' })
    if (res.ok) {
      const fresh = await refreshSheet(sheetId)
      if (fresh) {
        if (activeSheet?.id === sheetId) { setActiveSheet(fresh); if (activeTabId === tabId) setActiveTabId(fresh.examTabs[0]?.id ?? null) }
        if (creatingSheet?.id === sheetId) setCreatingSheet(fresh)
      }
    }
  }

  // ─── Score entry ──────────────────────────────────────────────────────────

  const handleScoreChange = (sId: string, subId: string, val: string) => {
    if (val.startsWith('=')) return // don't update while typing formula
    const num = val === '' ? null : parseFloat(val)
    setScores(prev => ({ ...prev, [sId]: { ...(prev[sId] ?? {}), [subId]: isNaN(num as number) ? null : num } }))
    setFormulas(prev => { const next = { ...prev }; if (next[sId]) delete next[sId][subId]; return next })
    setDirtyScores(prev => { const s = new Set(prev); s.add(`${sId}:${subId}`); return s })
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(() => {
      setDirtyScores(d => { setScores(sc => { setFormulas(fm => { if (activeTabId && d.size > 0) performSave(activeTabId, d, sc, fm); return fm }); return sc }); return d })
    }, 2500)
  }

  const handleCellBlur = (sId: string, subId: string, val: string) => {
    if (val.startsWith('=') && activeSheet) {
      const result = evalFormula(val, scores[sId] ?? {}, activeSheet.subjects)
      setScores(prev => ({ ...prev, [sId]: { ...(prev[sId] ?? {}), [subId]: result } }))
      setFormulas(prev => ({ ...prev, [sId]: { ...(prev[sId] ?? {}), [subId]: val } }))
      setDirtyScores(prev => { const s = new Set(prev); s.add(`${sId}:${subId}`); return s })
    }
    setEditingCell(null)
  }

  // ─── Classes modal for active sheet ──────────────────────────────────────

  const openClassModal = () => {
    if (!activeSheet) return
    setEditClassIds(new Set(activeSheet.classes.map(c => c.classId)))
    setShowClassModal(true)
  }

  const saveClasses = async () => {
    if (!activeSheet) return
    const res = await apiFetch(`/api/scoring/sheets/${activeSheet.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ classIds: Array.from(editClassIds) }),
    })
    if (res.ok) { const fresh: ScoreSheet = await res.json(); setActiveSheet(fresh); setSheets(prev => prev.map(s => s.id === fresh.id ? fresh : s)) }
    setShowClassModal(false)
    // Reload scores for new class selection
    setActiveTabId(id => id)
  }

  // ─── Delete sheet ─────────────────────────────────────────────────────────

  const deleteSheet = async () => {
    if (!activeSheet) return
    const res = await apiFetch(`/api/scoring/sheets/${activeSheet.id}`, { method: 'DELETE' })
    if (res.ok) { setActiveSheet(null); setActiveTabId(null); setStudents([]); setScores({}); await fetchSheets(); setShowDeleteSheetConfirm(false) }
  }

  // ─── Computed ─────────────────────────────────────────────────────────────

  const visibleStudents = filterClassId === 'ALL' ? students : students.filter(s => s.classId === filterClassId)

  const getTotal = (sId: string) => (activeSheet?.subjects ?? []).reduce((sum, sub) => sum + (scores[sId]?.[sub.id] ?? 0), 0)
  const getAverage = (sId: string) => { const n = activeSheet?.subjects.length ?? 0; return n ? getTotal(sId) / n : 0 }

  const rankings = (() => {
    const sorted = [...visibleStudents].sort((a, b) => getTotal(b.id) - getTotal(a.id))
    const map: Record<string, number> = {}; sorted.forEach((s, i) => { map[s.id] = i + 1 }); return map
  })()

  // ─── Selected cell formula bar ────────────────────────────────────────────

  const selectedFormula = editingCell ? (formulas[editingCell.sId]?.[editingCell.subId] ?? '') : ''

  // ─── Sub panels ───────────────────────────────────────────────────────────

  function SubjectFormPanel() {
    return (
      <div className="space-y-3">
        {/* Manual add */}
        <div className="flex gap-2">
          <input className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            value={subjectName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSubjectName(e.target.value)}
            placeholder={t('scoring.subjectName')} />
          <input type="number" min={0} className="w-20 border rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            value={subjectMax} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSubjectMax(Number(e.target.value))} title={t('scoring.maxScore')} />
          <input type="color" className="w-10 h-[38px] border rounded-lg cursor-pointer"
            value={subjectColor} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSubjectColor(e.target.value)} />
          <button onClick={saveSubject} disabled={!subjectName.trim()}
            className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50">{editSubject ? '✓' : '+'}</button>
          {editSubject && <button onClick={resetSubjectForm} className="px-3 py-2 border rounded-lg text-sm hover:bg-gray-50">✕</button>}
        </div>
        <div className="space-y-1 max-h-40 overflow-y-auto">
          {(currentSheet?.subjects ?? []).map(s => (
            <div key={s.id} className="flex items-center justify-between bg-gray-50 rounded px-3 py-1.5">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: s.color }} />
                <span className="text-sm">{s.name}</span>
                <span className="text-xs text-gray-400">/{s.maxScore}</span>
                {s.timetableSubjectId && <span className="text-[10px] bg-blue-100 text-blue-600 px-1 rounded">TT</span>}
              </div>
              <div className="flex gap-1">
                <button onClick={() => openEditSubject(s)} className="text-indigo-600 text-xs px-1.5 py-0.5 rounded hover:bg-indigo-50">Edit</button>
                <button onClick={() => deleteSubject(s)} className="text-red-500 text-xs px-1.5 py-0.5 rounded hover:bg-red-50">Del</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  function TimetableImportPanel() {
    return (
      <div className="space-y-3">
        <p className="text-xs text-gray-500">{t('scoring.importSubjectHint')}</p>
        <div className="max-h-56 overflow-y-auto space-y-1 border rounded-lg p-2">
          {timetableSubjects.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No timetable subjects found.</p>}
          {timetableSubjects.map(s => {
            const checked = selectedTimetableSubs.has(s.id)
            const alreadyAdded = (currentSheet?.subjects ?? []).some(sub => sub.timetableSubjectId === s.id)
            return (
              <label key={s.id} className={`flex items-center gap-3 px-3 py-2 rounded cursor-pointer ${alreadyAdded ? 'opacity-40' : 'hover:bg-indigo-50'}`}>
                <input type="checkbox" checked={checked} disabled={alreadyAdded}
                  onChange={e => setSelectedTimetableSubs(prev => { const n = new Set(prev); e.target.checked ? n.add(s.id) : n.delete(s.id); return n })} />
                {s.color && <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: s.color }} />}
                <span className="text-sm flex-1">{s.name}</span>
                <span className="text-xs text-gray-400">{s.timetable.academicYear}</span>
                {alreadyAdded && <span className="text-[10px] text-green-600">Added</span>}
              </label>
            )
          })}
        </div>
        <button onClick={importTimetableSubjects} disabled={!selectedTimetableSubs.size}
          className="w-full py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50">
          {t('scoring.importSelected')} ({selectedTimetableSubs.size})
        </button>
      </div>
    )
  }

  function MonthFormPanel() {
    return (
      <div className="space-y-3">
        <div className="flex gap-2">
          <input className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            value={tabLabel} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTabLabel(e.target.value)}
            placeholder="January / Q1 / Semester 1" />
          <select className="border rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            value={tabType} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setTabType(e.target.value)}>
            <option value="MONTHLY">{t('scoring.monthly')}</option>
            <option value="QUARTERLY">{t('scoring.quarterly')}</option>
            <option value="SEMESTER">{t('scoring.semester')}</option>
          </select>
          <button onClick={saveTab} disabled={!tabLabel.trim()}
            className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50">+</button>
        </div>
        <div className="space-y-1 max-h-44 overflow-y-auto">
          {(currentSheet?.examTabs ?? []).map(tab => (
            <div key={tab.id} className="flex items-center justify-between bg-gray-50 rounded px-3 py-1.5">
              <span className="text-sm">{tab.label} <span className="text-xs text-gray-400">({tab.type})</span></span>
              <button onClick={() => deleteTab(tab.id)} className="text-red-500 text-xs px-1.5 py-0.5 rounded hover:bg-red-50">Del</button>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  const sheetClassIds = activeSheet?.classes.map(c => c.classId) ?? []
  const sheetClasses = classes.filter(c => sheetClassIds.includes(c.id))
  const yearClasses = classes.filter(c => !wStudyYearId || c.studyYearId === wStudyYearId)

  return (
    <AuthGuard allowedRoles={['ADMIN', 'TEACHER']}>
      <div className="flex h-screen bg-gray-50 overflow-hidden" onClick={() => setShowAddMenu(false)}>
        <Sidebar title="Wattaman" subtitle="Admin" navItems={adminNav} accentColor="indigo" />

        {toast && (
          <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg text-white text-sm shadow-lg ${toast.ok ? 'bg-green-600' : 'bg-red-600'}`}>
            {toast.msg}
          </div>
        )}

        <main className="flex-1 flex flex-col overflow-hidden min-w-0">

          {/* ── Toolbar */}
          <div className="bg-white border-b shadow-sm print:hidden flex-shrink-0">
            <div className="px-4 pt-2.5 pb-1.5 border-b flex items-center gap-3">
              <div>
                <h1 className="text-sm font-semibold text-gray-800">{t('scoring.title')}</h1>
                {activeSheet && (
                  <p className="text-xs text-gray-400">
                    {activeSheet.name}
                    {sheetClasses.length > 0 && ` · ${sheetClasses.map(c => c.name).join(', ')}`}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-0.5 px-2 py-1">
              <ToolBtn icon="📄" label={t('scoring.new')} onClick={startWizard} />
              <ToolBtn icon="📂" label={t('scoring.open')} onClick={() => setShowOpenModal(true)} />
              <ToolBtn icon={saving ? '⏳' : '💾'} label={saving ? t('scoring.saving') : t('scoring.save')} onClick={saveScores} disabled={dirtyScores.size === 0 || !activeTabId} />
              <Divider />
              <ToolBtn icon="🖨️" label={t('scoring.print')} onClick={() => window.print()} />
              <Divider />
              <ToolBtn icon="📚" label={t('scoring.subject')} onClick={() => { resetSubjectForm(); setSubjectTab('manual'); setShowSubjectModal(true) }} disabled={!activeSheet} />
              <ToolBtn icon="🏫" label={t('scoring.class')} onClick={openClassModal} disabled={!activeSheet} />
              <ToolBtn icon="📅" label={t('scoring.month')} onClick={() => setShowMonthModal(true)} disabled={!activeSheet} />
              <Divider />
              <ToolBtn icon="📊" label={t('scoring.scoring')} onClick={() => tableRef.current?.scrollIntoView({ behavior: 'smooth' })} disabled={!activeSheet} />
              <Divider />
              <ToolBtn icon="🗑️" label={t('scoring.delete')} onClick={() => activeSheet && setShowDeleteSheetConfirm(true)} disabled={!activeSheet} danger />
            </div>
          </div>

          {/* ── Formula bar */}
          {activeSheet && editingCell && (
            <div className="bg-gray-50 border-b px-4 py-1.5 flex items-center gap-2 text-xs print:hidden flex-shrink-0">
              <span className="text-gray-400 font-mono">ƒx</span>
              <span className="flex-1 font-mono text-indigo-700 bg-white border rounded px-2 py-1">
                {selectedFormula || (scores[editingCell.sId]?.[editingCell.subId] !== null ? String(scores[editingCell.sId]?.[editingCell.subId] ?? '') : '')}
              </span>
              <span className="text-gray-400 text-[10px]">{t('scoring.formulaHint')}</span>
            </div>
          )}

          {/* ── Body */}
          <div className="flex-1 overflow-auto">
            {!activeSheet ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <div className="text-6xl mb-4">📊</div>
                <h2 className="text-xl font-semibold text-gray-700 mb-2">{t('scoring.noSheet')}</h2>
                <p className="text-gray-500 text-sm mb-6">{t('scoring.noSheetHint')}</p>
                <div className="flex gap-3">
                  <button onClick={startWizard} className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">{t('scoring.new')}</button>
                  <button onClick={() => setShowOpenModal(true)} className="px-5 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50">{t('scoring.open')}</button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col h-full">
                {/* Tabs bar */}
                <div className="flex items-center gap-0.5 px-4 pt-2 pb-0 bg-white border-b overflow-x-auto print:hidden flex-shrink-0">
                  {activeSheet.examTabs.map(tab => (
                    <button key={tab.id} onClick={() => setActiveTabId(tab.id)} title={tab.type}
                      className={`px-4 py-2 text-xs font-medium rounded-t-lg border-b-2 whitespace-nowrap transition-colors
                        ${activeTabId === tab.id ? 'border-indigo-600 text-indigo-700 bg-indigo-50' : 'border-transparent text-gray-600 hover:bg-gray-50'}`}>
                      {tab.label}
                      <span className="ml-1 text-[10px] opacity-50">{tab.type[0]}</span>
                    </button>
                  ))}
                  <button onClick={() => setShowMonthModal(true)} className="px-3 py-2 text-xs text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-t ml-1">
                    + {t('scoring.month')}
                  </button>
                  {/* Class filter */}
                  {sheetClasses.length > 1 && (
                    <div className="ml-auto flex items-center gap-1 pr-1">
                      <select className="text-xs border rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-300"
                        value={filterClassId} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setFilterClassId(e.target.value)}>
                        <option value="ALL">{t('scoring.allClasses')}</option>
                        {sheetClasses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                  )}
                </div>

                {/* Score table */}
                <div className="flex-1 overflow-auto p-4" ref={tableRef}>
                  {!activeTabId ? (
                    <div className="text-center py-16 text-gray-400 text-sm">{t('scoring.noTabs')}</div>
                  ) : activeSheet.subjects.length === 0 ? (
                    <div className="text-center py-16 text-gray-400 text-sm">
                      <p>{t('scoring.noSubjects')}</p>
                      <button onClick={() => { resetSubjectForm(); setSubjectTab('import'); setShowSubjectModal(true) }}
                        className="mt-3 text-sm text-indigo-600 underline">{t('scoring.importSubject')}</button>
                    </div>
                  ) : (
                    <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
                      {/* Print header */}
                      <div className="hidden print:flex items-center gap-4 mb-6">
                        {activeSheet.logoUrl && <img src={activeSheet.logoUrl} alt="logo" className="h-14 object-contain" />}
                        <div>
                          <h1 className="text-xl font-bold">{activeSheet.name}</h1>
                          <p className="text-sm text-gray-600">{activeSheet.examTabs.find(tab => tab.id === activeTabId)?.label}</p>
                        </div>
                      </div>

                      <table className="border-collapse bg-white shadow-sm text-xs min-w-max print:shadow-none">
                        <thead>
                          <tr className="bg-indigo-700 text-white">
                            <th className="border border-indigo-600 px-3 py-2 text-left font-semibold w-10 sticky left-0 bg-indigo-700">{t('scoring.no')}</th>
                            <th className="border border-indigo-600 px-3 py-2 text-left font-semibold min-w-[160px] sticky left-10 bg-indigo-700">{t('scoring.studentName')}</th>
                            <th className="border border-indigo-600 px-2 py-2 text-center font-semibold w-10">{t('scoring.gender')}</th>
                            {sheetClasses.length > 1 && filterClassId === 'ALL' && (
                              <th className="border border-indigo-600 px-2 py-2 text-center font-semibold">{t('scoring.classGroup')}</th>
                            )}
                            {activeSheet.subjects.map((sub, subIdx) => (
                              <th key={sub.id} className="border border-indigo-600 px-2 py-1 text-center font-semibold min-w-[64px]">
                                <div className="flex flex-col items-center leading-tight">
                                  <span className="text-[10px] text-indigo-300 font-normal">{String.fromCharCode(65 + subIdx)}</span>
                                  <span style={{ color: sub.color === '#000000' ? 'white' : sub.color }}>{sub.name}</span>
                                  <span className="text-indigo-300 font-normal text-[10px]">/{sub.maxScore}</span>
                                </div>
                              </th>
                            ))}
                            <th className="border border-indigo-600 px-2 py-2 text-center font-semibold w-16 bg-indigo-800">{t('scoring.total')}</th>
                            <th className="border border-indigo-600 px-2 py-2 text-center font-semibold w-16 bg-indigo-800">{t('scoring.average')}</th>
                            <th className="border border-indigo-600 px-2 py-2 text-center font-semibold w-12 bg-indigo-800">{t('scoring.ranking')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleStudents.length === 0 ? (
                            <tr><td colSpan={5 + activeSheet.subjects.length} className="text-center py-10 text-gray-400">{t('scoring.noStudents')}</td></tr>
                          ) : (() => {
                            const rows: React.ReactNode[] = []
                            let lastClassName: string | null = null
                            visibleStudents.forEach((student, idx) => {
                              const showClassHeader = sheetClasses.length > 1 && filterClassId === 'ALL' && student.className !== lastClassName
                              if (showClassHeader) {
                                lastClassName = student.className
                                rows.push(
                                  <tr key={`cls-${student.classId}`} className="print:break-before-page">
                                    <td colSpan={5 + activeSheet.subjects.length}
                                      className="bg-indigo-50 border border-indigo-200 px-4 py-1.5 font-semibold text-indigo-700 text-xs">
                                      {t('scoring.classGroup')}: {student.className}
                                    </td>
                                  </tr>
                                )
                              }
                              const total = getTotal(student.id)
                              const avg = getAverage(student.id)
                              const rank = rankings[student.id] ?? '-'
                              const isDirty = activeSheet.subjects.some(sub => dirtyScores.has(`${student.id}:${sub.id}`))
                              rows.push(
                                <tr key={student.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} ${isDirty ? 'ring-1 ring-inset ring-amber-200' : ''}`}>
                                  <td className="border border-gray-200 px-3 py-1 text-center text-gray-500 sticky left-0 bg-inherit">{idx + 1}</td>
                                  <td className="border border-gray-200 px-3 py-1 font-medium text-gray-800 sticky left-10 bg-inherit">{student.name}</td>
                                  <td className="border border-gray-200 px-2 py-1 text-center text-gray-500">
                                    {student.sex === 'FEMALE' ? '♀' : student.sex === 'MALE' ? '♂' : '—'}
                                  </td>
                                  {sheetClasses.length > 1 && filterClassId === 'ALL' && (
                                    <td className="border border-gray-200 px-2 py-1 text-center text-gray-500 text-[10px]">{student.className}</td>
                                  )}
                                  {activeSheet.subjects.map(sub => {
                                    const isEditing = editingCell?.sId === student.id && editingCell?.subId === sub.id
                                    const formula = formulas[student.id]?.[sub.id]
                                    const scoreVal = scores[student.id]?.[sub.id]
                                    return (
                                      <td key={sub.id} className="border border-gray-200 p-0">
                                        <input
                                          type="text"
                                          className={`w-full px-2 py-1.5 text-center bg-transparent focus:outline-none text-xs
                                            ${isEditing ? 'bg-yellow-50 ring-1 ring-inset ring-indigo-400' : ''}
                                            ${formula && !isEditing ? 'text-blue-700 font-mono' : ''}`}
                                          value={isEditing
                                            ? (formula ?? (scoreVal !== null ? String(scoreVal) : ''))
                                            : (scoreVal !== null ? String(Number(scoreVal.toFixed(2))) : '')}
                                          title={formula ?? undefined}
                                          onFocus={() => setEditingCell({ sId: student.id, subId: sub.id })}
                                          onBlur={(e: React.FocusEvent<HTMLInputElement>) => handleCellBlur(student.id, sub.id, e.target.value)}
                                          onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleScoreChange(student.id, sub.id, e.target.value)}
                                          placeholder={isEditing ? `=SUM(A,B)` : ''}
                                        />
                                      </td>
                                    )
                                  })}
                                  <td className="border border-gray-200 px-2 py-1 text-center font-semibold text-indigo-700 bg-indigo-50">{total.toFixed(1)}</td>
                                  <td className="border border-gray-200 px-2 py-1 text-center text-gray-700 bg-indigo-50">{avg.toFixed(1)}</td>
                                  <td className="border border-gray-200 px-2 py-1 text-center font-bold text-indigo-800 bg-indigo-50">{rank}</td>
                                </tr>
                              )
                            })
                            return rows
                          })()}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── Footer */}
          <div className="bg-white border-t px-4 py-2 flex items-center justify-between text-xs text-gray-500 print:hidden flex-shrink-0">
            <div className="flex items-center gap-2">
              <button onClick={() => setZoom(z => parseFloat(Math.max(0.5, z - 0.1).toFixed(1)))} className="px-2 py-1 rounded hover:bg-gray-100 font-mono">−</button>
              <span className="w-12 text-center">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom(z => parseFloat(Math.min(2, z + 0.1).toFixed(1)))} className="px-2 py-1 rounded hover:bg-gray-100 font-mono">+</button>
              <button onClick={() => setZoom(1)} className="px-2 py-1 rounded hover:bg-gray-100 text-indigo-500">Reset</button>
            </div>
            {autoSaveLabel && <span className="text-green-600 text-xs">{autoSaveLabel}</span>}
            <div className="flex items-center gap-3">
              <div className="relative">
                <button onClick={e => { e.stopPropagation(); setShowAddMenu(v => !v) }} disabled={!activeSheet}
                  className="flex items-center gap-1 px-3 py-1 rounded border text-xs hover:bg-gray-50 disabled:opacity-40">
                  + Add ▾
                </button>
                {showAddMenu && (
                  <div className="absolute bottom-8 right-0 bg-white border rounded-lg shadow-lg z-20 w-52" onClick={e => e.stopPropagation()}>
                    <button onClick={() => { setShowAddMenu(false); resetSubjectForm(); setSubjectTab('manual'); setShowSubjectModal(true) }}
                      className="w-full text-left px-4 py-2.5 text-xs hover:bg-indigo-50 text-gray-700 flex items-center gap-2">
                      <span>📚</span> {t('scoring.addColumn')}
                    </button>
                    <button onClick={() => { setShowAddMenu(false); resetSubjectForm(); setSubjectTab('import'); setShowSubjectModal(true) }}
                      className="w-full text-left px-4 py-2.5 text-xs hover:bg-indigo-50 text-gray-700 flex items-center gap-2">
                      <span>🔗</span> {t('scoring.importSubject')}
                    </button>
                    <div className="border-t mx-2" />
                    <button onClick={() => { setShowAddMenu(false); setShowMonthModal(true) }}
                      className="w-full text-left px-4 py-2.5 text-xs hover:bg-indigo-50 text-gray-700 flex items-center gap-2">
                      <span>📅</span> {t('scoring.addTabBtn')}
                    </button>
                  </div>
                )}
              </div>
              {dirtyScores.size > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-amber-600">{dirtyScores.size} unsaved</span>
                  <button onClick={saveScores} disabled={saving}
                    className="px-3 py-1 bg-indigo-600 text-white rounded text-xs hover:bg-indigo-700 disabled:opacity-50">
                    {saving ? t('scoring.saving') : t('scoring.save')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </main>

        {/* ══ Wizard Modal ══ */}
        {showNewWizard && (
          <Modal title={`${t('scoring.wizard')} · ${t('scoring.step')} ${wizardIndex + 1} ${t('scoring.of')} ${WIZARD_STEPS.length}`} onClose={() => setShowNewWizard(false)}>
            <div className="flex gap-1 mb-4">
              {WIZARD_STEPS.map((s, i) => (
                <div key={s} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= wizardIndex ? 'bg-indigo-600' : 'bg-gray-200'}`} />
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-gray-400 mb-5 -mt-3">
              {[t('scoring.academyYear'), t('scoring.multiClass'), t('scoring.addSubject'), t('scoring.addMonth')].map((lbl, i) => (
                <span key={i} className={i === wizardIndex ? 'text-indigo-600 font-semibold' : ''}>{lbl}</span>
              ))}
            </div>

            {/* Step 1: Academy Year */}
            {wizardStep === 'year' && (
              <div className="space-y-4">
                <p className="text-sm text-gray-500">{t('scoring.academyYearHint')}</p>
                {!wShowNewYear ? (
                  <>
                    <select className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      value={wStudyYearId} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setWStudyYearId(e.target.value)}>
                      <option value="">{t('scoring.selectYear')}</option>
                      {studyYears.map(y => (
                        <option key={y.id} value={y.id}>{yearLabel(y)}{y.isCurrent ? ' ★' : ''}</option>
                      ))}
                    </select>
                    <button onClick={() => setWShowNewYear(true)} className="text-sm text-indigo-600 underline">+ {t('scoring.createNewYear')}</button>
                  </>
                ) : (
                  <>
                    <input className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      value={wNewYearLabel} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWNewYearLabel(e.target.value)}
                      placeholder="2026-2027" autoFocus />
                    <button onClick={() => { setWShowNewYear(false); setWNewYearLabel('') }} className="text-sm text-gray-400 underline">← Back to list</button>
                  </>
                )}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">{t('scoring.schoolLogo')}</label>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    value={wLogoUrl} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWLogoUrl(e.target.value)} placeholder="https://..." />
                  {wLogoUrl && <img src={wLogoUrl} alt="preview" className="mt-2 h-10 object-contain rounded" onError={e => (e.currentTarget.style.display = 'none')} />}
                </div>
              </div>
            )}

            {/* Step 2: Classes */}
            {wizardStep === 'classes' && (
              <div className="space-y-3">
                <p className="text-sm text-gray-500">{t('scoring.multiClassHint')}</p>
                <div className="max-h-60 overflow-y-auto border rounded-lg divide-y">
                  {yearClasses.length === 0 && <p className="text-xs text-gray-400 text-center py-4">{t('scoring.noClassInYear')}</p>}
                  {yearClasses.map(c => (
                    <label key={c.id} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-indigo-50">
                      <input type="checkbox" checked={wClassIds.has(c.id)}
                        onChange={e => setWClassIds(prev => { const n = new Set(prev); e.target.checked ? n.add(c.id) : n.delete(c.id); return n })} />
                      <span className="text-sm">{c.name}</span>
                    </label>
                  ))}
                </div>
                {wClassIds.size > 0 && <p className="text-xs text-indigo-600">{wClassIds.size} class(es) selected</p>}
              </div>
            )}

            {/* Step 3: Subjects */}
            {wizardStep === 'subject' && (
              <div className="space-y-3">
                <div className="flex gap-2 border-b pb-2">
                  <button onClick={() => setSubjectTab('manual')}
                    className={`text-xs px-3 py-1 rounded-lg font-medium ${subjectTab === 'manual' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                    {t('scoring.manualAdd')}
                  </button>
                  <button onClick={() => setSubjectTab('import')}
                    className={`text-xs px-3 py-1 rounded-lg font-medium ${subjectTab === 'import' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                    {t('scoring.importSubject')}
                  </button>
                </div>
                {subjectTab === 'manual' ? <SubjectFormPanel /> : <TimetableImportPanel />}
              </div>
            )}

            {/* Step 4: Months */}
            {wizardStep === 'month' && (
              <div className="space-y-3">
                <p className="text-sm text-gray-500">{t('scoring.addMonth')}</p>
                <MonthFormPanel />
              </div>
            )}

            <div className="flex justify-between pt-5">
              <button onClick={handleWizardBack} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50">
                {wizardIndex === 0 ? (t('common.cancel') || 'Cancel') : t('scoring.back')}
              </button>
              <button onClick={handleWizardNext}
                disabled={(wizardStep === 'year' && !wStudyYearId && !wNewYearLabel.trim())}
                className="px-5 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
                {wizardIndex === WIZARD_STEPS.length - 1 ? t('scoring.finish') : t('scoring.next')}
              </button>
            </div>
          </Modal>
        )}

        {/* ══ Open Modal ══ */}
        {showOpenModal && (
          <Modal title={t('scoring.openSheet')} onClose={() => setShowOpenModal(false)}>
            {sheets.length === 0 ? <p className="text-gray-500 text-sm text-center py-6">{t('scoring.noSheets')}</p> : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {sheets.map(sheet => {
                  const sc = classes.filter(c => sheet.classes.some(x => x.classId === c.id))
                  const sy = studyYears.find(y => y.id === sheet.studyYearId)
                  return (
                    <button key={sheet.id} onClick={() => openSheet(sheet)}
                      className="w-full text-left px-4 py-3 rounded-lg border hover:border-indigo-400 hover:bg-indigo-50 transition-colors">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-gray-800 text-sm">{sheet.name}</p>
                        {sy && <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">{yearLabel(sy)}</span>}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{sc.map(c => c.name).join(', ') || 'No classes'} · {sheet.subjects.length} subjects · {sheet.examTabs.length} tabs</p>
                    </button>
                  )
                })}
              </div>
            )}
          </Modal>
        )}

        {/* ══ Subject Modal ══ */}
        {showSubjectModal && !showNewWizard && (
          <Modal title={t('scoring.manageSubjects')} onClose={() => setShowSubjectModal(false)} wide>
            <div className="flex gap-2 border-b pb-3 mb-4">
              <button onClick={() => setSubjectTab('manual')}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium ${subjectTab === 'manual' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                {t('scoring.manualAdd')}
              </button>
              <button onClick={() => setSubjectTab('import')}
                className={`text-xs px-3 py-1.5 rounded-lg font-medium ${subjectTab === 'import' ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                {t('scoring.importSubject')}
              </button>
            </div>
            {subjectTab === 'manual' ? <SubjectFormPanel /> : <TimetableImportPanel />}
            <div className="flex justify-end pt-4">
              <button onClick={() => setShowSubjectModal(false)} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50">{t('common.close') || 'Close'}</button>
            </div>
          </Modal>
        )}

        {/* ══ Month Modal ══ */}
        {showMonthModal && !showNewWizard && (
          <Modal title={t('scoring.manageMonths')} onClose={() => setShowMonthModal(false)}>
            <MonthFormPanel />
            <div className="flex justify-end pt-4">
              <button onClick={() => setShowMonthModal(false)} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50">{t('common.close') || 'Close'}</button>
            </div>
          </Modal>
        )}

        {/* ══ Class Modal ══ */}
        {showClassModal && (
          <Modal title={t('scoring.multiClass')} onClose={() => setShowClassModal(false)}>
            <p className="text-sm text-gray-500 mb-3">{t('scoring.multiClassHint')}</p>
            <div className="max-h-64 overflow-y-auto border rounded-lg divide-y mb-4">
              {classes.map(c => (
                <label key={c.id} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-indigo-50">
                  <input type="checkbox" checked={editClassIds.has(c.id)}
                    onChange={e => setEditClassIds(prev => { const n = new Set(prev); e.target.checked ? n.add(c.id) : n.delete(c.id); return n })} />
                  <span className="text-sm">{c.name}</span>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowClassModal(false)} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50">{t('common.cancel') || 'Cancel'}</button>
              <button onClick={saveClasses} className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">{t('common.save') || 'Save'}</button>
            </div>
          </Modal>
        )}

        {/* ══ Delete Confirm ══ */}
        {showDeleteSheetConfirm && (
          <Modal title={t('scoring.delete')} onClose={() => setShowDeleteSheetConfirm(false)}>
            <p className="text-sm text-gray-600 mb-6">{t('scoring.deleteSheetConfirm')}</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowDeleteSheetConfirm(false)} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50">{t('common.cancel') || 'Cancel'}</button>
              <button onClick={deleteSheet} className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700">{t('scoring.delete')}</button>
            </div>
          </Modal>
        )}
      </div>
    </AuthGuard>
  )
}
