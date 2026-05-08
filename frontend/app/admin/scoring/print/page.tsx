'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { apiFetch } from '../../../../lib/api'
import { useLanguage } from '../../../../lib/i18n'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SubjectInfo {
  id: string
  name: string
  maxScore: number
  color: string
}

interface ClassInfo {
  id: string
  name: string
}

interface StudentRow {
  id: string
  studentNumber: string
  name: string
  sex: string | null
  classId: string | null
  className: string | null
}

interface ScoreEntryData {
  studentId: string
  subjectId: string
  score: number | null
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTotal(subjects: SubjectInfo[], scores: Record<string, Record<string, number | null>>, studentId: string) {
  return subjects.reduce((sum, sub) => sum + (scores[studentId]?.[sub.id] ?? 0), 0)
}

function getAverage(subjects: SubjectInfo[], scores: Record<string, Record<string, number | null>>, studentId: string) {
  const n = subjects.length
  return n ? getTotal(subjects, scores, studentId) / n : 0
}

function buildRankings(students: StudentRow[], subjects: SubjectInfo[], scores: Record<string, Record<string, number | null>>) {
  const groups: Record<string, StudentRow[]> = {}
  students.forEach(s => {
    const key = s.classId ?? '__none__'
    if (!groups[key]) groups[key] = []
    groups[key].push(s)
  })
  const map: Record<string, number> = {}
  Object.values(groups).forEach(group => {
    const sorted = [...group].sort((a, b) => getTotal(subjects, scores, b.id) - getTotal(subjects, scores, a.id))
    sorted.forEach((s, i) => { map[s.id] = i + 1 })
  })
  return map
}

// ─── Page wrapper (Suspense required for useSearchParams) ─────────────────────

export default function ScoringPrintPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <ScoringPrintContent />
    </Suspense>
  )
}

function ScoringPrintContent() {
  const { t } = useLanguage()
  const searchParams = useSearchParams()

  const tabId = searchParams.get('tabId') || ''
  const classId = searchParams.get('classId') || 'ALL'
  const sheetName = searchParams.get('sheetName') || ''
  const tabLabel = searchParams.get('tabLabel') || ''
  const logoUrl = searchParams.get('logoUrl') || ''

  const subjects: SubjectInfo[] = (() => {
    try { return JSON.parse(searchParams.get('subjects') || '[]') } catch { return [] }
  })()

  const sheetClasses: ClassInfo[] = (() => {
    try { return JSON.parse(searchParams.get('sheetClasses') || '[]') } catch { return [] }
  })()

  const headerLines: string[] = (() => {
    try { return JSON.parse(searchParams.get('headerLines') || '[]') } catch { return [] }
  })()

  const signers: string[] = (() => {
    try { return JSON.parse(searchParams.get('signers') || '["Teacher","Admin"]') } catch { return ['Teacher', 'Admin'] }
  })()

  // ─── Data ─────────────────────────────────────────────────────────────────

  const [students, setStudents] = useState<StudentRow[]>([])
  const [scores, setScores] = useState<Record<string, Record<string, number | null>>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!tabId) { setError('Missing tab ID'); setLoading(false); return }
    const classIds = classId === 'ALL'
      ? sheetClasses.map(c => c.id)
      : [classId]
    const q = classIds.length ? `?classIds=${classIds.join(',')}` : ''
    apiFetch(`/api/scoring/exam-tabs/${tabId}/scores${q}`).then(async res => {
      if (!res.ok) { setError('Failed to load scores'); setLoading(false); return }
      const data: {
        entries: ScoreEntryData[]
        students: Array<{ id: string; studentNumber: string; user: { name: string }; sex: string | null; class: { id: string; name: string } | null }>
      } = await res.json()
      setStudents(data.students.map(s => ({
        id: s.id,
        studentNumber: s.studentNumber || '',
        name: s.user?.name || '',
        sex: s.sex,
        classId: s.class?.id ?? null,
        className: s.class?.name ?? null,
      })))
      const scoreMap: Record<string, Record<string, number | null>> = {}
      for (const e of data.entries) {
        if (!scoreMap[e.studentId]) scoreMap[e.studentId] = {}
        scoreMap[e.studentId][e.subjectId] = e.score
      }
      setScores(scoreMap)
      setLoading(false)
    }).catch(() => { setError('Failed to connect'); setLoading(false) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId, classId])

  // ─── Derived ──────────────────────────────────────────────────────────────

  const rankings = buildRankings(students, subjects, scores)

  // When printing all classes with multiple classes, group them
  const isMultiClass = sheetClasses.length > 1 && classId === 'ALL'

  // Selected class name (for single-class print)
  const selectedClassName = classId === 'ALL'
    ? sheetClasses.map(c => c.name).join(', ')
    : sheetClasses.find(c => c.id === classId)?.name ?? classId

  // ─── UI states ────────────────────────────────────────────────────────────

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  if (error) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <p className="text-red-600 font-medium">{error}</p>
        <button onClick={() => window.close()} className="mt-4 px-4 py-2 bg-slate-200 rounded-lg text-sm">
          {t('common.close')}
        </button>
      </div>
    </div>
  )

  // ─── Render table for a list of students ──────────────────────────────────

  function ScoreTable({ rows, showClass }: { rows: StudentRow[]; showClass: boolean }) {
    let classRowIdx = 0
    let lastClassName: string | null = null

    return (
      <table className="w-full border-collapse text-xs table-fixed">
        <colgroup>
          <col style={{ width: '28px' }} />       {/* No. */}
          <col />                                  {/* Name — takes remaining space */}
          <col style={{ width: '36px' }} />        {/* Gender */}
          {showClass && <col style={{ width: '80px' }} />}
          {subjects.map(sub => <col key={sub.id} style={{ width: '60px' }} />)}
          <col style={{ width: '52px' }} />        {/* Total */}
          <col style={{ width: '52px' }} />        {/* Average */}
          <col style={{ width: '36px' }} />        {/* Rank */}
        </colgroup>
        <thead>
          <tr className="bg-slate-800 text-white">
            <th className="border border-slate-600 px-1 py-2 text-center font-semibold">{t('scoring.no')}</th>
            <th className="border border-slate-600 px-2 py-2 text-left font-semibold">{t('scoring.studentName')}</th>
            <th className="border border-slate-600 px-1 py-2 text-center font-semibold">{t('scoring.gender')}</th>
            {showClass && (
              <th className="border border-slate-600 px-1 py-2 text-center font-semibold">{t('scoring.classGroup')}</th>
            )}
            {subjects.map((sub, subIdx) => (
              <th key={sub.id} className="border border-slate-600 px-1 py-1 text-center font-semibold">
                <div className="flex flex-col items-center leading-tight">
                  <span className="text-[9px] text-slate-300 font-normal">{String.fromCharCode(65 + subIdx)}</span>
                  <span className="truncate w-full text-center" style={{ color: sub.color === '#000000' ? 'white' : sub.color }}>{sub.name}</span>
                  <span className="text-slate-400 font-normal text-[9px]">/{sub.maxScore}</span>
                </div>
              </th>
            ))}
            <th className="border border-slate-600 px-1 py-2 text-center font-semibold bg-slate-900">{t('scoring.total')}</th>
            <th className="border border-slate-600 px-1 py-2 text-center font-semibold bg-slate-900">{t('scoring.average')}</th>
            <th className="border border-slate-600 px-1 py-2 text-center font-semibold bg-slate-900">{t('scoring.ranking')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((student, idx) => {
            const showClassHeader = isMultiClass && student.className !== lastClassName
            if (showClassHeader) {
              lastClassName = student.className
              classRowIdx = 0
            }
            classRowIdx++
            const rowNum = isMultiClass ? classRowIdx : idx + 1
            const total = getTotal(subjects, scores, student.id)
            const avg = getAverage(subjects, scores, student.id)
            const rank = rankings[student.id] ?? '-'

            return (
              <>
                {showClassHeader && (
                  <tr key={`cls-${student.classId}`}>
                    <td
                      colSpan={4 + subjects.length + (showClass ? 1 : 0)}
                      className="bg-slate-100 border border-slate-300 px-3 py-1 font-semibold text-slate-700 text-xs"
                    >
                      {t('scoring.classGroup')}: {student.className}
                    </td>
                  </tr>
                )}
                <tr key={student.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  <td className="border border-slate-300 px-1 py-1.5 text-center text-slate-500 whitespace-nowrap">{rowNum}</td>
                  <td className="border border-slate-300 px-2 py-1.5 text-slate-800 truncate">{student.name}</td>
                  <td className="border border-slate-300 px-1 py-1.5 text-center text-slate-500 whitespace-nowrap">
                    {student.sex === 'FEMALE' ? '♀' : student.sex === 'MALE' ? '♂' : '—'}
                  </td>
                  {showClass && (
                    <td className="border border-slate-300 px-1 py-1.5 text-center text-slate-500 text-[10px] truncate">{student.className}</td>
                  )}
                  {subjects.map(sub => {
                    const val = scores[student.id]?.[sub.id]
                    return (
                      <td key={sub.id} className="border border-slate-300 px-1 py-1.5 text-center text-slate-700 whitespace-nowrap">
                        {val != null ? val.toFixed(1) : '—'}
                      </td>
                    )
                  })}
                  <td className="border border-slate-300 px-1 py-1.5 text-center font-semibold text-indigo-700 bg-indigo-50 whitespace-nowrap">{total.toFixed(1)}</td>
                  <td className="border border-slate-300 px-1 py-1.5 text-center text-slate-700 bg-indigo-50 whitespace-nowrap">{avg.toFixed(1)}</td>
                  <td className="border border-slate-300 px-1 py-1.5 text-center font-bold text-indigo-800 bg-indigo-50 whitespace-nowrap">{rank}</td>
                </tr>
              </>
            )
          })}
          {/* Totals row */}
          <tr className="bg-slate-200 font-semibold text-xs">
            <td colSpan={3 + (showClass ? 1 : 0)} className="border border-slate-400 px-1 py-2 text-center">
              {t('common.total')} ({rows.length})
            </td>
            {subjects.map(sub => (
              <td key={sub.id} className="border border-slate-400 px-1 py-1.5 text-center text-slate-600 whitespace-nowrap">
                {rows.reduce((s, st) => s + (scores[st.id]?.[sub.id] ?? 0), 0).toFixed(1)}
              </td>
            ))}
            <td className="border border-slate-400 px-1 py-1.5 text-center text-indigo-700 whitespace-nowrap">
              {rows.reduce((s, st) => s + getTotal(subjects, scores, st.id), 0).toFixed(1)}
            </td>
            <td className="border border-slate-400 px-1 py-1.5 text-center text-slate-600 whitespace-nowrap">
              {rows.length ? (rows.reduce((s, st) => s + getAverage(subjects, scores, st.id), 0) / rows.length).toFixed(1) : '—'}
            </td>
            <td className="border border-slate-400" />
          </tr>
        </tbody>
      </table>
    )
  }

  // Sort helper — rank ascending (1st = best)
  const sortByRank = (rows: StudentRow[]) =>
    [...rows].sort((a, b) => (rankings[a.id] ?? 9999) - (rankings[b.id] ?? 9999))

  // Group students by class for per-class-page printing (all classes mode)
  const classGroups: { classId: string; className: string; rows: StudentRow[] }[] = isMultiClass
    ? sheetClasses.map(cls => ({
        classId: cls.id,
        className: cls.name,
        rows: sortByRank(students.filter(s => s.classId === cls.id)),
      })).filter(g => g.rows.length > 0)
    : [{ classId: classId, className: selectedClassName, rows: sortByRank(students) }]

  const printDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <>
      <style jsx global>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 10mm 12mm;
          }
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print { display: none !important; }
          .print-page { page-break-after: always; }
          .print-page:last-child { page-break-after: avoid; }
        }
        @media screen {
          body { background: #f1f5f9; }
        }
      `}</style>

      {/* Screen-only toolbar */}
      <div className="no-print fixed top-0 left-0 right-0 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between z-50 shadow-sm gap-2">
        <button onClick={() => window.close()}
          className="flex-shrink-0 px-3 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200">
          ← {t('common.close')}
        </button>
        <div className="text-sm text-slate-500 truncate min-w-0 mx-2">
          {sheetName} — {tabLabel} — {selectedClassName}
        </div>
        <button onClick={() => window.print()}
          className="flex-shrink-0 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 shadow-sm">
          🖨️ {t('scoring.print')}
        </button>
      </div>

      {/* Print pages */}
      <div style={{ marginTop: '60px' }}>
        {classGroups.map((group, gIdx) => (
          <div key={group.classId} className={`print-page bg-white mx-auto p-8 mb-6 ${gIdx < classGroups.length - 1 ? 'print:mb-0' : ''}`}
            style={{ maxWidth: '297mm', minHeight: '210mm' }}>

            {/* Header */}
            <div className="mb-5 border-b-2 border-slate-800 pb-4">
              <div className="flex items-start gap-4">
                {logoUrl && (
                  <div className="flex-shrink-0 pt-1">
                    <img src={logoUrl} alt="logo" className="h-16 w-16 object-contain" />
                  </div>
                )}
                <div className="flex-1 text-center">
                  {headerLines.map((line, i) => (
                    <p key={i} className={i === 0 ? 'text-base font-bold text-slate-900' : 'text-sm font-semibold text-slate-700'}>{line}</p>
                  ))}
                </div>
                {logoUrl && <div className="w-16 flex-shrink-0" />}
              </div>
              <div className="text-center mt-3">
                <h2 className="text-lg font-semibold text-slate-700">{sheetName}</h2>
                <div className="mt-2 flex flex-wrap justify-center gap-x-8 gap-y-1 text-sm text-slate-600">
                  <span><strong>{t('scoring.month')}:</strong> {tabLabel}</span>
                  <span><strong>{t('common.class')}:</strong> {group.className}</span>
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              {ScoreTable({ rows: group.rows, showClass: isMultiClass })}
            </div>

            {/* Footer */}
            <div className="mt-6 flex justify-between items-end text-xs text-slate-400">
              <span>{t('reports.printDate')}: {printDate}</span>
              <span>{sheetName} — {tabLabel}</span>
            </div>

            {/* Signatures */}
            {signers.length > 0 && (
              <div className={`mt-10 flex ${signers.length <= 3 ? 'justify-between' : 'justify-around flex-wrap gap-y-8'} px-4`}>
                {signers.map((signer, i) => (
                  <div key={i} className="text-center">
                    <div className="border-b border-slate-400 w-32 mb-1" />
                    <p className="text-xs text-slate-500">{signer}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  )
}
