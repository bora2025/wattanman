"use client"

import { useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import AuthGuard from '../../../../../components/AuthGuard'
import Sidebar from '../../../../../components/Sidebar'
import { teacherNav } from '../../../../../lib/teacher-nav'
import { apiFetch } from '../../../../../lib/api'

interface ExamQuestion {
  id: string
  text: string
  type: string
  options: string[] | null
  answer: string | null
  marks: number
  order: number
}
interface Exam {
  id: string
  title: string
  totalMarks: number
  passMark: number
  questions: ExamQuestion[]
}
interface Attempt {
  id: string
  studentId: string
  status: string
  score: number | null
  grade: string | null
  submittedAt: string | null
  gradedAt: string | null
  answers: Record<string, string> | null
  manualMarks: Record<string, number> | null
  feedback: string | null
  student: { id: string; user: { name: string } }
}

const STATUS_COLOR: Record<string, string> = {
  IN_PROGRESS: 'bg-slate-100 text-slate-600',
  SUBMITTED: 'bg-amber-100 text-amber-700',
  GRADED: 'bg-emerald-100 text-emerald-700',
}

export default function ExamGradebookPage() {
  const params = useParams<{ id: string }>()
  const examId = params?.id
  const router = useRouter()
  const qc = useQueryClient()
  const [openAttemptId, setOpenAttemptId] = useState<string | null>(null)

  const { data: exam, isLoading: examLoading } = useQuery<Exam>({
    enabled: !!examId,
    queryKey: ['exam', examId],
    queryFn: async () => {
      const r = await apiFetch(`/api/exams/${examId}`)
      if (!r.ok) throw new Error('Failed to load exam')
      return r.json()
    },
  })

  const { data: attempts = [] as Attempt[], isLoading: attemptsLoading } = useQuery<Attempt[]>({
    enabled: !!examId,
    queryKey: ['exam-attempts', examId],
    queryFn: async () => {
      const r = await apiFetch(`/api/exams/${examId}/attempts`)
      if (!r.ok) throw new Error('Failed to load attempts')
      return r.json()
    },
  })

  const nonMcq = useMemo(() => exam?.questions.filter(q => q.type !== 'MCQ') ?? [], [exam])

  return (
    <AuthGuard requiredRole="TEACHER">
      <div className="flex min-h-screen bg-slate-50">
        <Sidebar title="Teacher" subtitle="Portal" navItems={teacherNav} accentColor="sky" />
        <main className="flex-1 p-6 max-w-5xl mx-auto">
          <div className="mb-6 flex items-center gap-3">
            <button onClick={() => router.push('/teacher/exams')} className="text-sm text-slate-500 hover:text-slate-800">← Back</button>
            <h1 className="text-2xl font-bold text-slate-800">
              📊 Gradebook {exam ? `· ${exam.title}` : ''}
            </h1>
          </div>

          {examLoading || attemptsLoading ? (
            <div className="text-slate-500">Loading…</div>
          ) : !exam ? (
            <div className="text-red-600">Exam not found.</div>
          ) : (
            <>
              <div className="bg-white border border-slate-100 rounded-xl p-4 mb-4 text-sm text-slate-600">
                <p>
                  Total marks: <strong>{exam.totalMarks}</strong> · Pass mark: <strong>{exam.passMark}</strong> ·
                  Questions: <strong>{exam.questions.length}</strong>
                  {nonMcq.length > 0 && (
                    <> · <span className="text-amber-700">{nonMcq.length} essay/short-answer requires manual grading</span></>
                  )}
                </p>
              </div>

              {attempts.length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm p-8 text-center text-slate-500 border border-slate-100">
                  No student has attempted this exam yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {attempts.map(att => (
                    <div key={att.id} className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                      <div className="p-4 flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-slate-800 truncate">{att.student.user.name}</p>
                          <p className="text-xs text-slate-500">
                            Submitted: {att.submittedAt ? new Date(att.submittedAt).toLocaleString() : '—'}
                            {att.gradedAt && <> · Graded: {new Date(att.gradedAt).toLocaleString()}</>}
                          </p>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold text-slate-800">
                            {att.score ?? 0} / {exam.totalMarks}
                            {att.grade && <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${att.grade === 'PASS' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{att.grade}</span>}
                          </div>
                          <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full font-semibold ${STATUS_COLOR[att.status] ?? 'bg-slate-100 text-slate-600'}`}>{att.status}</span>
                        </div>
                        <button
                          onClick={() => setOpenAttemptId(openAttemptId === att.id ? null : att.id)}
                          className="text-xs px-3 py-1.5 rounded-md border border-sky-200 text-sky-700 hover:bg-sky-50 font-medium"
                        >
                          {openAttemptId === att.id ? 'Close' : att.status === 'GRADED' ? 'Review' : 'Grade'}
                        </button>
                      </div>

                      {openAttemptId === att.id && (
                        <GradePanel
                          exam={exam}
                          attempt={att}
                          onSaved={() => {
                            qc.invalidateQueries({ queryKey: ['exam-attempts', examId] })
                            setOpenAttemptId(null)
                          }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </AuthGuard>
  )
}

function GradePanel({ exam, attempt, onSaved }: { exam: Exam; attempt: Attempt; onSaved: () => void }) {
  const answers = attempt.answers ?? {}
  const existingMarks = attempt.manualMarks ?? {}
  const [marks, setMarks] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const q of exam.questions) {
      if (q.type !== 'MCQ') {
        init[q.id] = existingMarks[q.id] !== undefined ? String(existingMarks[q.id]) : ''
      }
    }
    return init
  })
  const [feedback, setFeedback] = useState<string>(attempt.feedback ?? '')
  const [error, setError] = useState<string | null>(null)

  const saveMutation = useMutation({
    mutationFn: async () => {
      const perQuestionMarks: Record<string, number> = {}
      for (const [qid, v] of Object.entries(marks)) {
        const n = parseFloat(v)
        if (!isNaN(n)) perQuestionMarks[qid] = n
      }
      const r = await apiFetch(`/api/exams/attempts/${attempt.id}/grade`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ perQuestionMarks, feedback: feedback || undefined }),
      })
      if (!r.ok) {
        let msg = `Save failed (${r.status})`
        try { const j = await r.json(); if (j?.message) msg = Array.isArray(j.message) ? j.message.join(', ') : j.message } catch {}
        throw new Error(msg)
      }
      return r.json()
    },
    onSuccess: onSaved,
    onError: (e: any) => setError(e?.message || 'Failed to save'),
  })

  return (
    <div className="border-t border-slate-100 bg-slate-50/60 p-4 space-y-4">
      {exam.questions.map((q, idx) => {
        const studentAnswer = answers[q.id] ?? ''
        const isMcq = q.type === 'MCQ'
        const correctMcq = isMcq && q.answer && studentAnswer === q.answer
        return (
          <div key={q.id} className="bg-white rounded-lg border border-slate-200 p-3">
            <div className="flex items-start justify-between gap-3 mb-2">
              <p className="text-sm font-semibold text-slate-800">
                Q{idx + 1}. {q.text}
                <span className="ml-2 text-xs text-slate-400 font-normal">({q.type} · {q.marks} marks)</span>
              </p>
              {isMcq && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${correctMcq ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                  {correctMcq ? `+${q.marks}` : '0'} (auto)
                </span>
              )}
            </div>
            {isMcq && q.options && (
              <ul className="text-xs text-slate-600 space-y-0.5 mb-2 ml-4">
                {q.options.map((opt, i) => (
                  <li key={i} className={opt === q.answer ? 'text-emerald-700 font-semibold' : ''}>
                    {String.fromCharCode(65 + i)}. {opt}
                  </li>
                ))}
              </ul>
            )}
            <div className="text-xs text-slate-500 mb-1">Student answer:</div>
            <div className="text-sm bg-slate-50 border border-slate-200 rounded p-2 whitespace-pre-wrap">
              {studentAnswer || <span className="text-slate-400 italic">(no answer)</span>}
            </div>
            {!isMcq && (
              <div className="mt-2 flex items-center gap-2">
                <label className="text-xs text-slate-600">Marks:</label>
                <input
                  type="number"
                  min={0}
                  max={q.marks}
                  step="0.5"
                  value={marks[q.id] ?? ''}
                  onChange={e => setMarks({ ...marks, [q.id]: e.target.value })}
                  className="w-24 text-sm border border-slate-300 rounded-md px-2 py-1"
                  placeholder="0"
                />
                <span className="text-xs text-slate-400">/ {q.marks}</span>
              </div>
            )}
          </div>
        )
      })}

      <div>
        <label className="text-xs text-slate-600 font-medium block mb-1">Overall feedback (optional)</label>
        <textarea
          value={feedback}
          onChange={e => setFeedback(e.target.value)}
          rows={3}
          className="w-full text-sm border border-slate-300 rounded-md px-2 py-1.5"
          placeholder="Comments for the student…"
        />
      </div>

      {error && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</div>}

      <div className="flex justify-end gap-2">
        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="bg-emerald-600 text-white text-sm font-medium px-4 py-1.5 rounded-md hover:bg-emerald-700 disabled:opacity-60"
        >
          {saveMutation.isPending ? 'Saving…' : 'Save & Finalize Grade'}
        </button>
      </div>
    </div>
  )
}
