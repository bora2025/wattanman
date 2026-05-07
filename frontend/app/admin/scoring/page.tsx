'use client'

import React, { useState, useEffect, useCallback } from 'react'
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

// ─── Toolbar Button ───────────────────────────────────────────────────────────

function ToolBtn({ icon, label, onClick, danger }: { icon: string; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-0.5 px-3 py-1.5 rounded text-xs font-medium transition-colors
        ${danger ? 'text-red-600 hover:bg-red-50' : 'text-gray-700 hover:bg-gray-100'}`}
    >
      <span className="text-lg leading-none">{icon}</span>
      <span>{label}</span>
    </button>
  )
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-semibold text-gray-800">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">x</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type WizardStep = 'school' | 'subject' | 'month'

export default function ScoringPage() {
  const { t } = useLanguage()

  const [sheets, setSheets] = useState<ScoreSheet[]>([])
  const [activeSheet, setActiveSheet] = useState<ScoreSheet | null>(null)
  const [activeTabId, setActiveTabId] = useState<string | null>(null)
  const [students, setStudents] = useState<StudentRow[]>([])
  const [scores, setScores] = useState<Record<string, Record<string, number | null>>>({})
  const [dirtyScores, setDirtyScores] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [zoom, setZoom] = useState(1)

  const [showOpenModal, setShowOpenModal] = useState(false)
  const [showNewWizard, setShowNewWizard] = useState(false)
  const [showSubjectModal, setShowSubjectModal] = useState(false)
  const [showMonthModal, setShowMonthModal] = useState(false)
  const [showDeleteSheetConfirm, setShowDeleteSheetConfirm] = useState(false)

  const [wizardStep, setWizardStep] = useState<WizardStep>('school')
  const [wSchoolName, setWSchoolName] = useState('')
  const [wLogoUrl, setWLogoUrl] = useState('')
  const [wClassId, setWClassId] = useState('')
  const [creatingSheet, setCreatingSheet] = useState<ScoreSheet | null>(null)

  const [editSubject, setEditSubject] = useState<ScoreSubject | null>(null)
  const [subjectName, setSubjectName] = useState('')
  const [subjectMax, setSubjectMax] = useState(100)
  const [subjectColor, setSubjectColor] = useState('#000000')
  const [tabLabel, setTabLabel] = useState('')
  const [tabType, setTabType] = useState('MONTHLY')

  // ─── Data fetching ───────────────────────────────────────────────────────

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

  // ─── Helpers ────────────────────────────────────────────────────────────

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

  // ─── Wizard ─────────────────────────────────────────────────────────────

  const startWizard = () => {
    setWizardStep('school'); setWSchoolName(''); setWLogoUrl(''); setWClassId('')
    setCreatingSheet(null); setShowNewWizard(true)
  }

  const wizardSteps: WizardStep[] = ['school', 'subject', 'month']
  const wizardIndex = wizardSteps.indexOf(wizardStep)

  const handleWizardNext = async () => {
    if (wizardStep === 'school') {
      if (!wSchoolName.trim()) return
      const res = await apiFetch('/api/scoring/sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: wSchoolName.trim(), logoUrl: wLogoUrl || undefined, classId: wClassId || undefined }),
      })
      if (res.ok) { const sheet: ScoreSheet = await res.json(); setCreatingSheet(sheet); setSheets(prev => [sheet, ...prev]); setWizardStep('subject') }
    } else if (wizardStep === 'subject') {
      setWizardStep('month')
    } else {
      if (creatingSheet) { const fresh = await refreshSheet(creatingSheet.id); if (fresh) openSheet(fresh) }
      setShowNewWizard(false); setCreatingSheet(null)
    }
  }

  // ─── Subjects ───────────────────────────────────────────────────────────

  const resetSubjectForm = () => { setEditSubject(null); setSubjectName(''); setSubjectMax(100); setSubjectColor('#000000') }

  const openEditSubject = (s: ScoreSubject) => { setEditSubject(s); setSubjectName(s.name); setSubjectMax(s.maxScore); setSubjectColor(s.color) }

  const saveSubject = async () => {
    const sheetId = showNewWizard ? creatingSheet?.id : activeSheet?.id
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

  const deleteSubject = async (s: ScoreSubject) => {
    if (!confirm(t('scoring.deleteSubjectConfirm'))) return
    const sheetId = showNewWizard ? creatingSheet?.id : activeSheet?.id
    if (!sheetId) return
    const res = await apiFetch(`/api/scoring/subjects/${s.id}`, { method: 'DELETE' })
    if (res.ok) {
      const fresh = await refreshSheet(sheetId)
      if (fresh) { if (activeSheet?.id === sheetId) setActiveSheet(fresh); if (creatingSheet?.id === sheetId) setCreatingSheet(fresh) }
    }
  }

  // ─── Exam Tabs ──────────────────────────────────────────────────────────

  const saveTab = async () => {
    const sheetId = showNewWizard ? creatingSheet?.id : activeSheet?.id
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
    const sheetId = showNewWizard ? creatingSheet?.id : activeSheet?.id
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

  // ─── Scoring ────────────────────────────────────────────────────────────

  const handleScoreChange = (studentId: string, subjectId: string, val: string) => {
    const num = val === '' ? null : parseFloat(val)
    setScores(prev => ({ ...prev, [studentId]: { ...(prev[studentId] ?? {}), [subjectId]: num } }))
    setDirtyScores(prev => { const s = new Set(prev); s.add(`${studentId}:${subjectId}`); return s })
  }

  const saveScores = async () => {
    if (!activeTabId || dirtyScores.size === 0) return
    setSaving(true)
    try {
      const entries = Array.from(dirtyScores).map(key => {
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

  // ─── Computed ───────────────────────────────────────────────────────────

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

  // ─── Sub-components ─────────────────────────────────────────────────────

  const currentSheet = showNewWizard ? creatingSheet : activeSheet

  function SubjectFormPanel() {
    return (
      <div className="space-y-3">
        <div className="flex gap-2">
          <input className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            value={subjectName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSubjectName(e.target.value)}
            placeholder={t('scoring.subjectName')} />
          <input type="number" min={0} className="w-20 border rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            value={subjectMax} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSubjectMax(Number(e.target.value))}
            title={t('scoring.maxScore')} />
          <input type="color" className="w-10 h-[38px] border rounded-lg cursor-pointer"
            value={subjectColor} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSubjectColor(e.target.value)} />
          <button onClick={saveSubject} disabled={!subjectName.trim()}
            className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50">
            {editSubject ? 'ok' : '+'}
          </button>
          {editSubject && (
            <button onClick={resetSubjectForm} className="px-3 py-2 border rounded-lg text-sm hover:bg-gray-50">x</button>
          )}
        </div>
        <div className="space-y-1 max-h-44 overflow-y-auto">
          {(currentSheet?.subjects ?? []).map(s => (
            <div key={s.id} className="flex items-center justify-between bg-gray-50 rounded px-3 py-1.5">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: s.color }} />
                <span className="text-sm">{s.name}</span>
                <span className="text-xs text-gray-400">/{s.maxScore}</span>
              </div>
              <div className="flex gap-1 ml-2">
                <button onClick={() => openEditSubject(s)} className="text-indigo-600 hover:text-indigo-800 text-xs px-1">Edit</button>
                <button onClick={() => deleteSubject(s)} className="text-red-500 hover:text-red-700 text-xs px-1">Del</button>
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
              <button onClick={() => deleteTab(tab.id)} className="text-red-500 hover:text-red-700 text-xs px-1">Del</button>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <AuthGuard allowedRoles={['ADMIN', 'TEACHER']}>
      <div className="flex h-screen bg-gray-50 overflow-hidden">
        <Sidebar title="Wattaman" subtitle="Admin" navItems={adminNav} accentColor="indigo" />

        {toast && (
          <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded-lg text-white text-sm shadow-lg
            ${toast.ok ? 'bg-green-600' : 'bg-red-600'}`}>{toast.msg}</div>
        )}

        <main className="flex-1 flex flex-col overflow-hidden min-w-0">
          {/* Toolbar */}
          <div className="bg-white border-b shadow-sm print:hidden">
            <div className="px-4 pt-3 pb-1 border-b">
              <h1 className="text-base font-semibold text-gray-800">{t('scoring.title')}</h1>
              {activeSheet && <p className="text-xs text-gray-400">{activeSheet.name}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-1 px-2 py-1">
              <ToolBtn icon="D" label={t('scoring.new')} onClick={startWizard} />
              <ToolBtn icon="O" label={t('scoring.open')} onClick={() => setShowOpenModal(true)} />
              <ToolBtn icon="S" label={saving ? t('scoring.saving') : t('scoring.save')} onClick={saveScores} />
              <div className="w-px h-8 bg-gray-200 mx-1" />
              <ToolBtn icon="P" label={t('scoring.print')} onClick={() => window.print()} />
              <div className="w-px h-8 bg-gray-200 mx-1" />
              <ToolBtn icon="Sb" label={t('scoring.subject')} onClick={() => { resetSubjectForm(); setShowSubjectModal(true) }} />
              <ToolBtn icon="M" label={t('scoring.month')} onClick={() => setShowMonthModal(true)} />
              <div className="w-px h-8 bg-gray-200 mx-1" />
              <ToolBtn icon="X" label={t('scoring.delete')} onClick={() => activeSheet && setShowDeleteSheetConfirm(true)} danger />
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-auto">
            {!activeSheet ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-8">
                <div className="text-5xl mb-4">S</div>
                <h2 className="text-xl font-semibold text-gray-700 mb-2">{t('scoring.noSheet')}</h2>
                <p className="text-gray-500 text-sm mb-6">{t('scoring.noSheetHint')}</p>
                <div className="flex gap-3">
                  <button onClick={startWizard} className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">{t('scoring.new')}</button>
                  <button onClick={() => setShowOpenModal(true)} className="px-5 py-2 border rounded-lg text-sm hover:bg-gray-50">{t('scoring.open')}</button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col h-full">
                {/* Exam tabs */}
                <div className="flex items-center gap-1 px-4 pt-3 pb-0 bg-white border-b overflow-x-auto print:hidden">
                  {activeSheet.examTabs.map(tab => (
                    <button key={tab.id} onClick={() => setActiveTabId(tab.id)}
                      className={`px-4 py-2 text-xs font-medium rounded-t-lg border-b-2 whitespace-nowrap transition-colors
                        ${activeTabId === tab.id ? 'border-indigo-600 text-indigo-700 bg-indigo-50' : 'border-transparent text-gray-600 hover:bg-gray-50'}`}>
                      {tab.label}
                    </button>
                  ))}
                  <button onClick={() => setShowMonthModal(true)} className="px-3 py-2 text-xs text-gray-400 hover:text-indigo-600">
                    {t('scoring.addTabBtn')}
                  </button>
                </div>

                {/* Score table */}
                <div className="flex-1 overflow-auto p-4">
                  {!activeTabId ? (
                    <div className="text-center py-16 text-gray-400">{t('scoring.noTabs')}</div>
                  ) : activeSheet.subjects.length === 0 ? (
                    <div className="text-center py-16 text-gray-400">
                      <p>{t('scoring.noSubjects')}</p>
                      <button onClick={() => { resetSubjectForm(); setShowSubjectModal(true) }}
                        className="mt-3 text-sm text-indigo-600 underline">{t('scoring.addSubjectBtn')}</button>
                    </div>
                  ) : (
                    <div style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', minHeight: 200 }}>
                      <div className="hidden print:flex items-center gap-4 mb-4">
                        {activeSheet.logoUrl && <img src={activeSheet.logoUrl} alt="logo" className="h-12 object-contain" />}
                        <div>
                          <h1 className="text-lg font-bold">{activeSheet.name}</h1>
                          <p className="text-sm text-gray-600">{activeSheet.examTabs.find(tab => tab.id === activeTabId)?.label}</p>
                        </div>
                      </div>
                      <table className="border-collapse bg-white shadow-sm text-xs min-w-max print:shadow-none">
                        <thead>
                          <tr className="bg-indigo-700 text-white">
                            <th className="border border-indigo-600 px-3 py-2 text-left font-semibold w-10">{t('scoring.no')}</th>
                            <th className="border border-indigo-600 px-3 py-2 text-left font-semibold min-w-40">{t('scoring.studentName')}</th>
                            <th className="border border-indigo-600 px-3 py-2 text-center font-semibold w-12">{t('scoring.gender')}</th>
                            {activeSheet.subjects.map((sub: ScoreSubject) => (
                              <th key={sub.id} className="border border-indigo-600 px-2 py-1 text-center font-semibold min-w-16">
                                <div className="flex flex-col items-center">
                                  <span style={{ color: sub.color === '#000000' ? 'white' : sub.color }}>{sub.name}</span>
                                  <span className="text-indigo-200 font-normal text-[10px]">/{sub.maxScore}</span>
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
                            <tr><td colSpan={4 + activeSheet.subjects.length} className="text-center py-8 text-gray-400">{t('scoring.noStudents')}</td></tr>
                          ) : students.map((student, idx) => {
                            const total = getTotal(student.id)
                            const avg = getAverage(student.id)
                            const rank = rankings[student.id] ?? '-'
                            return (
                              <tr key={student.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                <td className="border border-gray-200 px-3 py-1.5 text-center text-gray-500">{idx + 1}</td>
                                <td className="border border-gray-200 px-3 py-1.5 font-medium text-gray-800">{student.name}</td>
                                <td className="border border-gray-200 px-2 py-1.5 text-center text-gray-500">
                                  {student.sex === 'FEMALE' ? 'F' : student.sex === 'MALE' ? 'M' : '-'}
                                </td>
                                {activeSheet.subjects.map((sub: ScoreSubject) => (
                                  <td key={sub.id} className="border border-gray-200 p-0">
                                    <input type="number" min={0} max={sub.maxScore} step={0.5}
                                      className="w-full px-2 py-1.5 text-center bg-transparent focus:bg-yellow-50 focus:outline-none focus:ring-1 focus:ring-inset focus:ring-indigo-400"
                                      value={scores[student.id]?.[sub.id] ?? ''}
                                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => handleScoreChange(student.id, sub.id, e.target.value)} />
                                  </td>
                                ))}
                                <td className="border border-gray-200 px-2 py-1.5 text-center font-semibold text-indigo-700 bg-indigo-50">{total.toFixed(1)}</td>
                                <td className="border border-gray-200 px-2 py-1.5 text-center text-gray-700 bg-indigo-50">{avg.toFixed(1)}</td>
                                <td className="border border-gray-200 px-2 py-1.5 text-center font-bold text-indigo-800 bg-indigo-50">{rank}</td>
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

          {/* Footer */}
          <div className="bg-white border-t px-4 py-2 flex items-center justify-between text-xs text-gray-500 print:hidden">
            <div className="flex items-center gap-3">
              <button onClick={() => setZoom(z => Math.max(0.5, parseFloat((z - 0.1).toFixed(1))))} className="px-2 py-1 rounded hover:bg-gray-100">- {t('scoring.zoomOut')}</button>
              <span>{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom(z => Math.min(2, parseFloat((z + 0.1).toFixed(1))))} className="px-2 py-1 rounded hover:bg-gray-100">+ {t('scoring.zoomIn')}</button>
              <button onClick={() => setZoom(1)} className="px-2 py-1 rounded hover:bg-gray-100 text-indigo-500">Reset</button>
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
        </main>

        {/* New Wizard */}
        {showNewWizard && (
          <Modal title={`${t('scoring.wizard')} - ${t('scoring.step')} ${wizardIndex + 1} ${t('scoring.of')} ${wizardSteps.length}`} onClose={() => setShowNewWizard(false)}>
            <div className="flex gap-1 mb-6">
              {wizardSteps.map((s, i) => (
                <div key={s} className={`h-1.5 flex-1 rounded-full ${i <= wizardIndex ? 'bg-indigo-600' : 'bg-gray-200'}`} />
              ))}
            </div>
            {wizardStep === 'school' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('scoring.schoolName')} *</label>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    value={wSchoolName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWSchoolName(e.target.value)}
                    placeholder={t('scoring.schoolName')} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('scoring.schoolLogo')}</label>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    value={wLogoUrl} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setWLogoUrl(e.target.value)}
                    placeholder="https://..." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('scoring.addClass')}</label>
                  <select className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    value={wClassId} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setWClassId(e.target.value)}>
                    <option value="">{t('scoring.selectClassOptional')}</option>
                    {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
            )}
            {wizardStep === 'subject' && <div className="space-y-3"><p className="text-sm text-gray-500">{t('scoring.addSubject')}</p><SubjectFormPanel /></div>}
            {wizardStep === 'month' && <div className="space-y-3"><p className="text-sm text-gray-500">{t('scoring.addMonth')}</p><MonthFormPanel /></div>}
            <div className="flex justify-between pt-6">
              <button onClick={() => { if (wizardIndex === 0) setShowNewWizard(false); else setWizardStep(wizardSteps[wizardIndex - 1]) }}
                className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50">
                {wizardIndex === 0 ? t('common.cancel') : t('scoring.back')}
              </button>
              <button onClick={handleWizardNext} disabled={wizardStep === 'school' && !wSchoolName.trim()}
                className="px-5 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
                {wizardIndex === wizardSteps.length - 1 ? t('scoring.finish') : t('scoring.next')}
              </button>
            </div>
          </Modal>
        )}

        {/* Open Modal */}
        {showOpenModal && (
          <Modal title={t('scoring.openSheet')} onClose={() => setShowOpenModal(false)}>
            {sheets.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-6">{t('scoring.noSheets')}</p>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {sheets.map(sheet => (
                  <button key={sheet.id} onClick={() => openSheet(sheet)}
                    className="w-full text-left px-4 py-3 rounded-lg border hover:border-indigo-400 hover:bg-indigo-50 transition-colors">
                    <p className="font-medium text-gray-800 text-sm">{sheet.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{sheet.subjects.length} subjects - {sheet.examTabs.length} tabs</p>
                  </button>
                ))}
              </div>
            )}
          </Modal>
        )}

        {/* Subject Modal */}
        {showSubjectModal && !showNewWizard && (
          <Modal title={editSubject ? `${t('common.edit')} ${t('scoring.subject')}` : t('scoring.addSubject')} onClose={() => setShowSubjectModal(false)}>
            <SubjectFormPanel />
            <div className="flex justify-end pt-4">
              <button onClick={() => setShowSubjectModal(false)} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50">{t('common.close')}</button>
            </div>
          </Modal>
        )}

        {/* Month Modal */}
        {showMonthModal && !showNewWizard && (
          <Modal title={t('scoring.addMonth')} onClose={() => setShowMonthModal(false)}>
            <MonthFormPanel />
            <div className="flex justify-end pt-4">
              <button onClick={() => setShowMonthModal(false)} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50">{t('common.close')}</button>
            </div>
          </Modal>
        )}

        {/* Delete Confirm */}
        {showDeleteSheetConfirm && (
          <Modal title={t('scoring.delete')} onClose={() => setShowDeleteSheetConfirm(false)}>
            <p className="text-sm text-gray-600 mb-6">{t('scoring.deleteSheetConfirm')}</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowDeleteSheetConfirm(false)} className="px-4 py-2 text-sm rounded-lg border hover:bg-gray-50">{t('common.cancel')}</button>
              <button onClick={deleteSheet} className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white hover:bg-red-700">{t('scoring.delete')}</button>
            </div>
          </Modal>
        )}
      </div>
    </AuthGuard>
  )
}
