'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import Sidebar from '../../../components/Sidebar'
import AuthGuard from '../../../components/AuthGuard'
import { adminNav } from '../../../lib/admin-nav'
import { apiFetch } from '../../../lib/api'
import { useLanguage } from '../../../lib/i18n'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScoreSubject {
  id: string
  name: string
  maxScore: number
  color: string
  order: number
}

interface ScoreExamTab {
  id: string
  label: string
  type: string
  order: number
}

interface ScoreSheet {
  id: string
  name: string
  logoUrl: string | null
  classId: string | null
  studyYearId: string | null
  subjects: ScoreSubject[]
  examTabs: ScoreExamTab[]
}

interface StudentRow {
  id: string
  studentNumber: string
  name: string
  sex: string | null
}

interface ClassOption {
  id: string
  name: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ToolBtn({
  icon, label, onClick, danger, disabled,
}: {
  icon: React.ReactNode
  label: string
  onClick: () => void
  danger?: boolean
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded text-xs font-medium transition-colors disabled:opacity-40
        ${danger ? 'text-red-600 hover:bg-red-50' : 'text-gray-700 hover:bg-gray-100'}`}
    >
      <span className="text-base leading-none select-none">{icon}</span>
      <span className="whitespace-nowrap">{label}</span>
    </button>
  )
}

function Divider() {
  return <div className="w-px h-8 bg-gray-200 mx-0.5 self-center" />
}

function Modal({ title, onClose, children, wide }: {
  title: string
  onClose: () => void
  children: React.ReactNode
  wide?: boolean
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className={`bg-white rounded-xl shadow-2xl w-full ${wide ? 'max-w-2xl' : 'max-w-lg'}`}>
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-semibold text-gray-800">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none w-6 h-6 flex items-center justify-center">×</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type WizardStep = 'school' | 'class' | 'subject' | 'month'
const WIZARD_STEPS: WizardStep[] = ['school', 'class', 'subject', 'month']

export default function ScoringPage() {
  const { t } = useLanguage()
  const tableRef = useRef<HTMLDivElement>(null)

  // Sheet state
  const [sheets, setSheets] = useState<ScoreSheet[]>([])
  const [activeSheet, setActiveSheet] = useState<ScoreSheet | null>(null)
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [students, setStudents] = useState<StudentRow[]>([])
  const [scores, setScores] = useState<Record<string, Record<string, number | null>>>({})
  const [dirtyScores, setDirtyScores] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [autoSaveLabel, setAutoSaveLabel] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [zoom, setZoom] = useState(1)
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Modal visibility
  const [showOpenModal, setShowOpenModal] = useState(false)
  const [showNewWizard, setShowNewWizard] = useState(false)
  const [showSubjectModal, setShowSubjectModal] = useState(false)
  const [showMonthModal, setShowMonthModal] = useState(false)
  const [showClassModal, setShowClassModal] = useState(false)
  const [showDeleteSheetConfirm, setShowDeleteSheetConfirm] = useState(false)
  const [showAddMenu, setShowAddMenu] = useState(false)

  // Wizard state
  const [wizardStep, setWizardStep] = useState<WizardStep>('school')
  const [wSchoolName, setWSchoolName] = useState('')
  const [wLogoUrl, setWLogoUrl] = useState('')
  const [wClassId, setWClassId] = useState('')
  const [creatingSheet, setCreatingSheet] = useState<ScoreSheet | null>(null)

  // Subject form
  const [editSubject, setEditSubject] = useState<ScoreSubject | null>(null)
  const [subjectName, setSubjectName] = useState('')
  const [subjectMax, setSubjectMax] = useState(100)
  const [subjectColor, setSubjectColor] = useState('#000000')

  // Exam tab form
  const [tabLabel, setTabLabel] = useState('')
  const [tabType, setTabType] = useState('MONTHLY')

  // Class picker for current sheet
  const [selectedClassId, setSelectedClassId] = useState('')

  // ─── Data fetching ────────────────────────────────────────────────────────

  const fetchSheets = useCallback(async () => {
    const res = await apiFetch('/api/scoring/sheets')
    if (res.ok) setSheets(await res.json())
  }, [])

  const fetchClasses = useCallback(async () => {
    const res = await apiFetch('/api/classes')
    if (res.ok) {
      const data: Array<{ id: string; name: string }> = await res.json()
      setClasses(data.map(c => ({ id: c.id, name: c.name })))
    }
  }, [])

  useEffect(() => { fetchSheets(); fetchClasses() }, [fetchSheets, fetchClasses])

  useEffect(() => {
    if (!activeTabId || !activeSheet) { setStudents([]); setScores({}); return }
    const classId = activeSheet.classId
    const url = `/api/scoring/exam-tabs/${activeTabId}/scores${classId ? `?classId=${classId}` : ''}`
    apiFetch(url).then(async res => {
      if (!res.ok) return
      const data: {
        entries: Array<{ studentId: string; subjectId: string; score: number | null }>
        students: Array<{ id: string; studentNumber: string; user: { name: string }; sex: string | null }>
      } = await res.json()
      setStudents(data.students.map(s => ({ id: s.id, studentNumber: s.studentNumber || '', name: s.user?.name || '', sex: s.sex })))
      const scoreMap: Record<string, Record<string, number | null>> = {}
      for (const e of data.entries) {
        if (!scoreMap[e.studentId]) scoreMap[e.studentId] = {}
        scoreMap[e.studentId][e.subjectId] = e.score
      }
      setScores(scoreMap)
      setDirtyScores(new Set())
    })
  }, [activeTabId, activeSheet])

  // ─── Auto-save ────────────────────────────────────────────────────────────

  const performSave = useCallback(async (tabId: string, dirty: Set<string>, currentScores: Record<string, Record<string, number | null>>) => {
    if (dirty.size === 0) return
    const entries = Array.from(dirty).map((key: string) => {
      const [studentId, subjectId] = key.split(':')
      return { examTabId: tabId, subjectId, studentId, score: currentScores[studentId]?.[subjectId] ?? null }
    })
    const res = await apiFetch('/api/scoring/entries/bulk', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries }),
    })
    if (res.ok) {
      setDirtyScores(new Set())
      setAutoSaveLabel(t('scoring.autoSaved'))
      setTimeout(() => setAutoSaveLabel(null), 2500)
    }
  }, [t])

  // ─── Helpers ─────────────────────────────────────────────────────────────

  const showToast = (msg: string, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  const refreshSheet = async (id: string): Promise<ScoreSheet | null> => {
    const res = await apiFetch(`/api/scoring/sheets/${id}`)
    if (!res.ok) return null
    const fresh: ScoreSheet = await res.json()
    setSheets(prev => prev.map(s => s.id === id ? fresh : s))
    return fresh
  }

  const openSheet = (sheet: ScoreSheet) => {
    setActiveSheet(sheet)
    setActiveTabId(sheet.examTabs[0]?.id ?? null)
    setShowOpenModal(false)
  }

  // ─── Wizard ───────────────────────────────────────────────────────────────

  const startWizard = () => {
    setWizardStep('school'); setWSchoolName(''); setWLogoUrl(''); setWClassId('')
    setCreatingSheet(null); setShowNewWizard(true)
  }

  const wizardIndex = WIZARD_STEPS.indexOf(wizardStep)

  const handleWizardNext = async () => {
    if (wizardStep === 'school') {
      if (!wSchoolName.trim()) return
      const res = await apiFetch('/api/scoring/sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: wSchoolName.trim(), logoUrl: wLogoUrl || undefined }),
      })
      if (res.ok) {
        const sheet: ScoreSheet = await res.json()
        setCreatingSheet(sheet)
        setSheets(prev => [sheet, ...prev])
        setWizardStep('class')
      }
    } else if (wizardStep === 'class') {
      // Update classId on the sheet if a class was selected
      if (creatingSheet && wClassId) {
        const res = await apiFetch(`/api/scoring/sheets/${creatingSheet.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ classId: wClassId }),
        })
        if (res.ok) {
          const updated: ScoreSheet = await res.json()
          setCreatingSheet(updated)
          setSheets(prev => prev.map(s => s.id === updated.id ? updated : s))
        }
      }
      setWizardStep('subject')
    } else if (wizardStep === 'subject') {
      setWizardStep('month')
    } else {
      // Finish
      if (creatingSheet) {
        const fresh = await refreshSheet(creatingSheet.id)
        if (fresh) openSheet(fresh)
      }
      setShowNewWizard(false)
      setCreatingSheet(null)
    }
  }

  const handleWizardBack = () => {
    const idx = wizardIndex
    if (idx === 0) { setShowNewWizard(false); return }
    setWizardStep(WIZARD_STEPS[idx - 1])
  }

  // ─── Subject CRUD ─────────────────────────────────────────────────────────

  const resetSubjectForm = () => { setEditSubject(null); setSubjectName(''); setSubjectMax(100); setSubjectColor('#000000') }
  const openEditSubject = (s: ScoreSubject) => { setEditSubject(s); setSubjectName(s.name); setSubjectMax(s.maxScore); setSubjectColor(s.color) }

  const currentSheet = showNewWizard ? creatingSheet : activeSheet

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
      if (fresh) {
        if (activeSheet?.id === sheetId) setActiveSheet(fresh)
        if (creatingSheet?.id === sheetId) setCreatingSheet(fresh)
      }
      resetSubjectForm()
    }
  }

  const deleteSubject = async (s: ScoreSubject) => {
    if (!confirm(t('scoring.deleteSubjectConfirm'))) return
    const sheetId = currentSheet?.id
    if (!sheetId) return
    const res = await apiFetch(`/api/scoring/subjects/${s.id}`, { method: 'DELETE' })
    if (res.ok) {
      const fresh = await refreshSheet(sheetId)
      if (fresh) {
        if (activeSheet?.id === sheetId) setActiveSheet(fresh)
        if (creatingSheet?.id === sheetId) setCreatingSheet(fresh)
      }
    }
  }

  // ─── Exam Tab CRUD ────────────────────────────────────────────────────────

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
        if (activeSheet?.id === sheetId) {
          setActiveSheet(fresh)
          if (!activeTabId) setActiveTabId(fresh.examTabs[0]?.id ?? null)
        }
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
        if (activeSheet?.id === sheetId) {
          setActiveSheet(fresh)
          if (activeTabId === tabId) setActiveTabId(fresh.examTabs[0]?.id ?? null)
        }
        if (creatingSheet?.id === sheetId) setCreatingSheet(fresh)
      }
    }
  }

  // ─── Scoring ─────────────────────────────────────────────────────────────

  const handleScoreChange = (studentId: string, subjectId: string, val: string) => {
    const num = val === '' ? null : parseFloat(val)
    setScores(prev => ({ ...prev, [studentId]: { ...(prev[studentId] ?? {}), [subjectId]: num } }))
    setDirtyScores(prev => { const s = new Set(prev); s.add(`${studentId}:${subjectId}`); return s })

    // Debounced auto-save
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(() => {
      setDirtyScores(dirty => {
        setScores(sc => {
          if (activeTabId && dirty.size > 0) performSave(activeTabId, dirty, sc)
          return sc
        })
        return dirty
      })
    }, 2500)
  }

  const saveScores = async () => {
    if (!activeTabId || dirtyScores.size === 0) return
    setSaving(true)
    try {
      const entries = Array.from(dirtyScores).map((key: string) => {
        const [studentId, subjectId] = key.split(':')
        return { examTabId: activeTabId, subjectId, studentId, score: scores[studentId]?.[subjectId] ?? null }
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

  // ─── Computed ────────────────────────────────────────────────────────────

  const getTotal = (studentId: string): number => {
    if (!activeSheet) return 0
    return activeSheet.subjects.reduce((sum: number, sub: ScoreSubject) => sum + (scores[studentId]?.[sub.id] ?? 0), 0)
  }

  const getAverage = (studentId: string): number => {
    if (!activeSheet || activeSheet.subjects.length === 0) return 0
    return getTotal(studentId) / activeSheet.subjects.length
  }

  const rankings: Record<string, number> = (() => {
    if (!activeSheet || !activeTabId) return {}
    const sorted = [...students].sort((a, b) => getTotal(b.id) - getTotal(a.id))
    const map: Record<string, number> = {}
    sorted.forEach((s, i) => { map[s.id] = i + 1 })
    return map
  })()

  const deleteSheet = async () => {
    if (!activeSheet) return
    const res = await apiFetch(`/api/scoring/sheets/${activeSheet.id}`, { method: 'DELETE' })
    if (res.ok) {
      setActiveSheet(null); setActiveTabId(null); setStudents([]); setScores({})
      await fetchSheets(); setShowDeleteSheetConfirm(false)
    }
  }

  // Change class for active sheet
  const changeClass = async () => {
    if (!activeSheet) return
    const res = await apiFetch(`/api/scoring/sheets/${activeSheet.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ classId: selectedClassId || null }),
    })
    if (res.ok) {
      const fresh = await refreshSheet(activeSheet.id)
      if (fresh) { setActiveSheet(fresh) }
      setShowClassModal(false)
      // Reload students for current tab
      setActiveTabId(t => t)
    }
  }

  const scrollToTable = () => {
    tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  // ─── Sub-panels ───────────────────────────────────────────────────────────

  function SubjectFormPanel() {
    return (
      <div className="space-y-3">
        <div className="flex gap-2">
          <input
            className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            value={subjectName}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSubjectName(e.target.value)}
            placeholder={t('scoring.subjectName')}
          />
          <input
            type="number" min={0}
            className="w-20 border rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            value={subjectMax}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSubjectMax(Number(e.target.value))}
            title={t('scoring.maxScore')}
          />
          <input
            type="color"
            className="w-10 h-[38px] border rounded-lg cursor-pointer"
            value={subjectColor}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSubjectColor(e.target.value)}
          />
          <button
            onClick={saveSubject} disabled={!subjectName.trim()}
            className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
          >
            {editSubject ? '✓' : '+'}
          </button>
          {editSubject && (
            <button onClick={resetSubjectForm} className="px-3 py-2 border rounded-lg text-sm hover:bg-gray-50">✕</button>
          )}
        </div>
        <div className="space-y-1 max-h-52 overflow-y-auto">
          {(currentSheet?.subjects ?? []).length === 0 && (
            <p className="text-xs text-gray-400 text-center py-3">{t('scoring.noSubjects')}</p>
          )}
          {(currentSheet?.subjects ?? []).map(s => (
            <div key={s.id} className="flex items-center justify-between bg-gray-50 rounded px-3 py-1.5">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: s.color }} />
                <span className="text-sm">{s.name}</span>
                <span className="text-xs text-gray-400">/{s.maxScore}</span>
              </div>
              <div className="flex gap-1 ml-2">
                <button onClick={() => openEditSubject(s)} className="text-indigo-600 hover:text-indigo-800 text-xs px-1.5 py-0.5 rounded hover:bg-indigo-50">Edit</button>
                <button onClick={() => deleteSubject(s)} className="text-red-500 hover:text-red-700 text-xs px-1.5 py-0.5 rounded hover:bg-red-50">Del</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  function MonthFormPanel() {
    return (
      <div className="space-y-3">
        <div className="flex gap-2">
          <input
            className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            value={tabLabel}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTabLabel(e.target.value)}
            placeholder="January / Q1 / Semester 1"
          />
          <select
            className="border rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            value={tabType}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setTabType(e.target.value)}
          >
            <option value="MONTHLY">{t('scoring.monthly')}</option>
            <option value="QUARTERLY">{t('scoring.quarterly')}</option>
            <option value="SEMESTER">{t('scoring.semester')}</option>
          </select>
          <button
            onClick={saveTab} disabled={!tabLabel.trim()}
            className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
          >+</button>
        </div>
        <div className="space-y-1 max-h-52 overflow-y-auto">
          {(currentSheet?.examTabs ?? []).length === 0 && (
            <p className="text-xs text-gray-400 text-center py-3">{t('scoring.noTabs')}</p>
          )}
          {(currentSheet?.examTabs ?? []).map(tab => (
            <div key={tab.id} className="flex items-center justify-between bg-gray-50 rounded px-3 py-1.5">
              <span className="text-sm">{tab.label} <span className="text-xs text-gray-400">({tab.type})</span></span>
              <button onClick={() => deleteTab(tab.id)} className="text-red-500 hover:text-red-700 text-xs px-1.5 py-0.5 rounded hover:bg-red-50">Del</button>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <AuthGuard allowedRoles={['ADMIN', 'TEACHER']}>
      <div className="flex h-screen bg-gray-50 overflow-hidden" onClick={() => setShowAddMenu(false)}>
        <Sidebar title="Wattaman" subtitle="Admin" navItems={adminNav} accentColor="indigo" />

        {/* Toast */}
        {toast && (
          <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg text-white text-sm shadow-lg transition-all
            ${toast.ok ? 'bg-green-600' : 'bg-red-600'}`}>{toast.msg}</div>
        )}

        <main className="flex-1 flex flex-col overflow-hidden min-w-0">

          {/* ── Toolbar ── */}
          <div className="bg-white border-b shadow-sm print:hidden flex-shrink-0">
            <div className="px-4 pt-2.5 pb-1.5 border-b flex items-center gap-3">
              <div>
                <h1 className="text-sm font-semibold text-gray-800">{t('scoring.title')}</h1>
                {activeSheet && <p className="text-xs text-gray-400">{activeSheet.name}{activeSheet.classId && classes.length > 0 ? ` · ${classes.find(c => c.id === activeSheet.classId)?.name ?? ''}` : ''}</p>}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-0.5 px-2 py-1">
              {/* Group 1: File */}
              <ToolBtn icon="📄" label={t('scoring.new')} onClick={startWizard} />
              <ToolBtn icon="📂" label={t('scoring.open')} onClick={() => setShowOpenModal(true)} />
              <ToolBtn icon={saving ? '⏳' : '💾'} label={saving ? t('scoring.saving') : t('scoring.save')} onClick={saveScores} disabled={dirtyScores.size === 0 || !activeTabId} />
              <Divider />
              {/* Group 2: Print */}
              <ToolBtn icon="🖨️" label={t('scoring.print')} onClick={() => window.print()} />
              <Divider />
              {/* Group 3: Manage */}
              <ToolBtn icon="📚" label={t('scoring.subject')} onClick={() => { resetSubjectForm(); setShowSubjectModal(true) }} disabled={!activeSheet} />
              <ToolBtn icon="🏫" label={t('scoring.class')} onClick={() => { setSelectedClassId(activeSheet?.classId ?? ''); setShowClassModal(true) }} disabled={!activeSheet} />
              <ToolBtn icon="📅" label={t('scoring.month')} onClick={() => setShowMonthModal(true)} disabled={!activeSheet} />
              <Divider />
              {/* Group 4: Scoring */}
              <ToolBtn icon="📊" label={t('scoring.scoring')} onClick={scrollToTable} disabled={!activeSheet} />
              <Divider />
              {/* Group 5: Danger */}
              <ToolBtn icon="🗑️" label={t('scoring.delete')} onClick={() => activeSheet && setShowDeleteSheetConfirm(true)} disabled={!activeSheet} danger />
            </div>
          </div>

          {/* ── Body ── */}
          <div className="flex-1 overflow-auto">
            {!activeSheet ? (
              /* Empty state */
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

                {/* Exam tabs bar */}
                <div className="flex items-center gap-0.5 px-4 pt-2 pb-0 bg-white border-b overflow-x-auto print:hidden flex-shrink-0">
                  {activeSheet.examTabs.map(tab => (
                    <button key={tab.id} onClick={() => setActiveTabId(tab.id)}
                      title={tab.type}
                      className={`px-4 py-2 text-xs font-medium rounded-t-lg border-b-2 whitespace-nowrap transition-colors
                        ${activeTabId === tab.id
                          ? 'border-indigo-600 text-indigo-700 bg-indigo-50'
                          : 'border-transparent text-gray-600 hover:bg-gray-50'}`}>
                      {tab.label}
                      <span className="ml-1 text-[10px] opacity-50">
                        {tab.type === 'MONTHLY' ? 'M' : tab.type === 'QUARTERLY' ? 'Q' : 'S'}
                      </span>
                    </button>
                  ))}
                  <button
                    onClick={() => setShowMonthModal(true)}
                    className="px-3 py-2 text-xs text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-t ml-1">
                    + {t('scoring.month')}
                  </button>
                </div>

                {/* Score table */}
                <div className="flex-1 overflow-auto p-4" ref={tableRef}>
                  {!activeTabId ? (
                    <div className="text-center py-16 text-gray-400 text-sm">{t('scoring.noTabs')}</div>
                  ) : activeSheet.subjects.length === 0 ? (
                    <div className="text-center py-16 text-gray-400 text-sm">
                      <p>{t('scoring.noSubjects')}</p>
                      <button onClick={() => { resetSubjectForm(); setShowSubjectModal(true) }}
                        className="mt-3 text-sm text-indigo-600 underline">{t('scoring.addSubjectBtn')}</button>
                    </div>
                  ) : (
                    <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
                      {/* Print header */}
                      <div className="hidden print:flex items-center gap-4 mb-6">
                        {activeSheet.logoUrl && <img src={activeSheet.logoUrl} alt="logo" className="h-14 object-contain" />}
                        <div>
                          <h1 className="text-xl font-bold">{activeSheet.name}</h1>
                          <p className="text-sm text-gray-600">
                            {activeSheet.examTabs.find(tab => tab.id === activeTabId)?.label}
                            {activeSheet.classId && classes.find(c => c.id === activeSheet.classId)
                              ? ` · ${classes.find(c => c.id === activeSheet.classId)?.name}`
                              : ''}
                          </p>
                        </div>
                      </div>

                      {/* Table */}
                      <table className="border-collapse bg-white shadow-sm text-xs min-w-max print:shadow-none">
                        <thead>
                          <tr className="bg-indigo-700 text-white">
                            <th className="border border-indigo-600 px-3 py-2 text-left font-semibold w-10 sticky left-0 bg-indigo-700">{t('scoring.no')}</th>
                            <th className="border border-indigo-600 px-3 py-2 text-left font-semibold min-w-[160px] sticky left-10 bg-indigo-700">{t('scoring.studentName')}</th>
                            <th className="border border-indigo-600 px-2 py-2 text-center font-semibold w-12">{t('scoring.gender')}</th>
                            {activeSheet.subjects.map((sub: ScoreSubject) => (
                              <th key={sub.id} className="border border-indigo-600 px-2 py-1 text-center font-semibold min-w-[64px]">
                                <div className="flex flex-col items-center leading-tight">
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
                          {students.length === 0 ? (
                            <tr>
                              <td colSpan={4 + activeSheet.subjects.length} className="text-center py-10 text-gray-400">{t('scoring.noStudents')}</td>
                            </tr>
                          ) : students.map((student, idx) => {
                            const total = getTotal(student.id)
                            const avg = getAverage(student.id)
                            const rank = rankings[student.id] ?? '-'
                            const isDirty = activeSheet.subjects.some(sub => dirtyScores.has(`${student.id}:${sub.id}`))
                            return (
                              <tr key={student.id} className={`${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'} ${isDirty ? 'ring-1 ring-inset ring-amber-300' : ''}`}>
                                <td className="border border-gray-200 px-3 py-1 text-center text-gray-500 sticky left-0 bg-inherit">{idx + 1}</td>
                                <td className="border border-gray-200 px-3 py-1 font-medium text-gray-800 sticky left-10 bg-inherit">{student.name}</td>
                                <td className="border border-gray-200 px-2 py-1 text-center text-gray-500">
                                  {student.sex === 'FEMALE' ? '♀' : student.sex === 'MALE' ? '♂' : '—'}
                                </td>
                                {activeSheet.subjects.map((sub: ScoreSubject) => (
                                  <td key={sub.id} className="border border-gray-200 p-0">
                                    <input
                                      type="number" min={0} max={sub.maxScore} step={0.5}
                                      className="w-full px-2 py-1.5 text-center bg-transparent focus:bg-yellow-50 focus:outline-none focus:ring-1 focus:ring-inset focus:ring-indigo-400 text-xs"
                                      value={scores[student.id]?.[sub.id] ?? ''}
                                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleScoreChange(student.id, sub.id, e.target.value)}
                                    />
                                  </td>
                                ))}
                                <td className="border border-gray-200 px-2 py-1 text-center font-semibold text-indigo-700 bg-indigo-50">{total.toFixed(1)}</td>
                                <td className="border border-gray-200 px-2 py-1 text-center text-gray-700 bg-indigo-50">{avg.toFixed(1)}</td>
                                <td className="border border-gray-200 px-2 py-1 text-center font-bold text-indigo-800 bg-indigo-50">{rank}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── Footer ── */}
          <div className="bg-white border-t px-4 py-2 flex items-center justify-between text-xs text-gray-500 print:hidden flex-shrink-0">
            {/* Left: zoom */}
            <div className="flex items-center gap-2">
              <button onClick={() => setZoom(z => parseFloat(Math.max(0.5, z - 0.1).toFixed(1)))} className="px-2 py-1 rounded hover:bg-gray-100 font-mono">−</button>
              <span className="w-12 text-center">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom(z => parseFloat(Math.min(2, z + 0.1).toFixed(1)))} className="px-2 py-1 rounded hover:bg-gray-100 font-mono">+</button>
              <button onClick={() => setZoom(1)} className="px-2 py-1 rounded hover:bg-gray-100 text-indigo-500">Reset</button>
            </div>

            {/* Center: auto-save label */}
            {autoSaveLabel && <span className="text-green-600 text-xs">{autoSaveLabel}</span>}

            {/* Right: add + unsaved */}
            <div className="flex items-center gap-3">
              {/* "+ Add" dropdown */}
              <div className="relative">
                <button
                  onClick={e => { e.stopPropagation(); setShowAddMenu(v => !v) }}
                  disabled={!activeSheet}
                  className="flex items-center gap-1 px-3 py-1 rounded border text-xs hover:bg-gray-50 disabled:opacity-40"
                >
                  + {t('common.add') || 'Add'}
                  <span className="text-[10px] opacity-60">▾</span>
                </button>
                {showAddMenu && (
                  <div className="absolute bottom-8 right-0 bg-white border rounded-lg shadow-lg z-20 w-52" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => { setShowAddMenu(false); resetSubjectForm(); setShowSubjectModal(true) }}
                      className="w-full text-left px-4 py-2.5 text-xs hover:bg-indigo-50 text-gray-700 flex items-center gap-2"
                    >
                      <span>📚</span> {t('scoring.addColumn')}
                    </button>
                    <button
                      onClick={() => {
                        setShowAddMenu(false)
                        alert(t('scoring.addRowHint'))
                      }}
                      className="w-full text-left px-4 py-2.5 text-xs hover:bg-indigo-50 text-gray-700 flex items-center gap-2"
                    >
                      <span>👤</span> {t('scoring.addRow')}
                    </button>
                    <div className="border-t mx-2" />
                    <button
                      onClick={() => { setShowAddMenu(false); setShowMonthModal(true) }}
                      className="w-full text-left px-4 py-2.5 text-xs hover:bg-indigo-50 text-gray-700 flex items-center gap-2"
                    >
                      <span>📅</span> {t('scoring.addTabBtn')}
                    </button>
                  </div>
                )}
              </div>

              {/* Unsaved indicator */}
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

        {/* ═══ Wizard Modal ═══ */}
        {showNewWizard && (
          <Modal
            title={`${t('scoring.wizard')} · ${t('scoring.step')} ${wizardIndex + 1} ${t('scoring.of')} ${WIZARD_STEPS.length}`}
            onClose={() => setShowNewWizard(false)}
          >
            {/* Progress bar */}
            <div className="flex gap-1 mb-6">
              {WIZARD_STEPS.map((s, i) => (
                <div key={s} className={`h-1.5 flex-1 rounded-full transition-colors ${i <= wizardIndex ? 'bg-indigo-600' : 'bg-gray-200'}`} />
              ))}
            </div>

            {/* Step labels */}
            <div className="flex justify-between text-[10px] text-gray-400 mb-5 -mt-4">
              {WIZARD_STEPS.map((s, i) => (
                <span key={s} className={i === wizardIndex ? 'text-indigo-600 font-semibold' : ''}>
                  {s === 'school' ? t('scoring.schoolSetup')
                    : s === 'class' ? t('scoring.classStep')
                    : s === 'subject' ? t('scoring.addSubject')
                    : t('scoring.addMonth')}
                </span>
              ))}
            </div>

            {/* Step 1: School */}
            {wizardStep === 'school' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('scoring.schoolName')} *</label>
                  <input
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    value={wSchoolName}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWSchoolName(e.target.value)}
                    placeholder={t('scoring.schoolName')}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('scoring.schoolLogo')}</label>
                  <input
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    value={wLogoUrl}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWLogoUrl(e.target.value)}
                    placeholder="https://..."
                  />
                  {wLogoUrl && <img src={wLogoUrl} alt="preview" className="mt-2 h-10 object-contain rounded" onError={e => (e.currentTarget.style.display = 'none')} />}
                </div>
              </div>
            )}

            {/* Step 2: Class */}
            {wizardStep === 'class' && (
              <div className="space-y-3">
                <p className="text-sm text-gray-500">{t('scoring.classStepHint')}</p>
                <select
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  value={wClassId}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setWClassId(e.target.value)}
                >
                  <option value="">{t('scoring.selectClassOptional')}</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {wClassId && (
                  <div className="bg-indigo-50 rounded-lg px-3 py-2 text-xs text-indigo-700">
                    ✓ Students from <strong>{classes.find(c => c.id === wClassId)?.name}</strong> will be loaded into the score table.
                  </div>
                )}
              </div>
            )}

            {/* Step 3: Subjects */}
            {wizardStep === 'subject' && (
              <div className="space-y-3">
                <p className="text-sm text-gray-500">{t('scoring.addSubject')}</p>
                <SubjectFormPanel />
              </div>
            )}

            {/* Step 4: Months */}
            {wizardStep === 'month' && (
              <div className="space-y-3">
                <p className="text-sm text-gray-500">{t('scoring.addMonth')}</p>
                <MonthFormPanel />
              </div>
            )}

            <div className="flex justify-between pt-6">
              <button onClick={handleWizardBack} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50">
                {wizardIndex === 0 ? (t('common.cancel') || 'Cancel') : t('scoring.back')}
              </button>
              <button
                onClick={handleWizardNext}
                disabled={wizardStep === 'school' && !wSchoolName.trim()}
                className="px-5 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {wizardIndex === WIZARD_STEPS.length - 1 ? t('scoring.finish') : t('scoring.next')}
              </button>
            </div>
          </Modal>
        )}

        {/* ═══ Open Modal ═══ */}
        {showOpenModal && (
          <Modal title={t('scoring.openSheet')} onClose={() => setShowOpenModal(false)}>
            {sheets.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-6">{t('scoring.noSheets')}</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {sheets.map(sheet => (
                  <button key={sheet.id} onClick={() => openSheet(sheet)}
                    className="w-full text-left px-4 py-3 rounded-lg border hover:border-indigo-400 hover:bg-indigo-50 transition-colors">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-gray-800 text-sm">{sheet.name}</p>
                      {sheet.classId && classes.find(c => c.id === sheet.classId) && (
                        <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                          {classes.find(c => c.id === sheet.classId)?.name}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{sheet.subjects.length} subjects · {sheet.examTabs.length} tabs</p>
                  </button>
                ))}
              </div>
            )}
          </Modal>
        )}

        {/* ═══ Subject Modal ═══ */}
        {showSubjectModal && !showNewWizard && (
          <Modal title={t('scoring.manageSubjects')} onClose={() => setShowSubjectModal(false)}>
            <SubjectFormPanel />
            <div className="flex justify-end pt-4">
              <button onClick={() => setShowSubjectModal(false)} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50">{t('common.close') || 'Close'}</button>
            </div>
          </Modal>
        )}

        {/* ═══ Month Modal ═══ */}
        {showMonthModal && !showNewWizard && (
          <Modal title={t('scoring.manageMonths')} onClose={() => setShowMonthModal(false)}>
            <MonthFormPanel />
            <div className="flex justify-end pt-4">
              <button onClick={() => setShowMonthModal(false)} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50">{t('common.close') || 'Close'}</button>
            </div>
          </Modal>
        )}

        {/* ═══ Class Modal ═══ */}
        {showClassModal && (
          <Modal title={t('scoring.changeClass')} onClose={() => setShowClassModal(false)}>
            <p className="text-sm text-gray-500 mb-4">{t('scoring.classStepHint')}</p>
            <select
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 mb-4"
              value={selectedClassId}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedClassId(e.target.value)}
            >
              <option value="">{t('scoring.selectClassOptional')}</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowClassModal(false)} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50">{t('common.cancel') || 'Cancel'}</button>
              <button onClick={changeClass} className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">{t('common.save') || 'Save'}</button>
            </div>
          </Modal>
        )}

        {/* ═══ Delete Confirm ═══ */}
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
