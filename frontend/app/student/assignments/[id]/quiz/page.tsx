"use client"

import { useEffect, useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import AuthGuard from '../../../../../components/AuthGuard'
import { apiFetch } from '../../../../../lib/api'

type QType = 'MCQ' | 'TF' | 'MATCHING' | 'ESSAY' | 'NUMERICAL'
interface Question {
  id: string; type: QType; prompt: string; points: number; order: number
  data: any
}
interface QuizPayload {
  assignment: { id: string; title: string; instructions: string | null; dueDate: string | null; totalMarks: number; maxAttempts: number; allowLate: boolean }
  questions: Question[]
  submission: { id: string; status: string; marks: number | null; attemptNumber: number; submittedAt: string; answers: Array<{ questionId: string; response: any; pointsAwarded: number | null }> } | null
}

export default function StudentQuizPage() {
  const params = useParams()
  const router = useRouter()
  const assignmentId = params?.id as string
  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [result, setResult] = useState<{ autoScore: number; adjustedAutoScore: number; hasManualGrading: boolean; latePenaltyApplied: number | null } | null>(null)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['student-quiz', assignmentId],
    queryFn: async () => { const r = await apiFetch(`/api/assignments/${assignmentId}/quiz`); if (!r.ok) throw new Error(); return r.json() as Promise<QuizPayload> },
    enabled: !!assignmentId,
  })

  // Seed answers from previous attempt so students can review/edit.
  useEffect(() => {
    if (data?.submission?.answers?.length) {
      const seed: Record<string, any> = {}
      for (const a of data.submission.answers) seed[a.questionId] = a.response
      setAnswers(seed)
    }
  }, [data?.submission?.id])

  const submitMutation = useMutation({
    mutationFn: async () => {
      const r = await apiFetch(`/api/assignments/${assignmentId}/submit-quiz`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: Object.entries(answers).map(([questionId, response]) => ({ questionId, response })) }),
      })
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e?.message || 'Submission failed') }
      return r.json()
    },
    onSuccess: (res: any) => { setResult(res); setSubmitError(null); refetch() },
    onError: (e: any) => setSubmitError(e?.message || 'Submission failed'),
  })

  function setAnswer(qId: string, value: any) { setAnswers(a => ({ ...a, [qId]: value })) }

  if (isLoading) {
    return <AuthGuard requiredRole="STUDENT"><div className="min-h-screen bg-slate-50 p-6"><div className="max-w-3xl mx-auto space-y-3">{[1,2,3].map(i => <div key={i} className="bg-white h-24 rounded-xl animate-pulse" />)}</div></div></AuthGuard>
  }
  if (isError || !data) {
    return <AuthGuard requiredRole="STUDENT"><div className="min-h-screen bg-slate-50 p-6"><div className="max-w-3xl mx-auto"><div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center"><p className="text-red-600 mb-2">Failed to load quiz</p><Link href="/student/assignments" className="text-sm text-sky-600 underline">Back to assignments</Link></div></div></div></AuthGuard>
  }

  const { assignment, questions, submission } = data
  const totalPoints = questions.reduce((s, q) => s + (q.points || 0), 0)
  const attemptsUsed = submission?.attemptNumber ?? 0
  const exhausted = assignment.maxAttempts > 0 && attemptsUsed >= assignment.maxAttempts
  const alreadyGraded = submission?.status === 'GRADED' && submission.marks !== null

  return (
    <AuthGuard requiredRole="STUDENT">
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-3xl mx-auto">
          <Link href="/student/assignments" className="text-sm text-sky-600 mb-4 block">← Back to my assignments</Link>
          <div className="bg-white rounded-xl shadow-sm p-5 border border-slate-100 mb-4">
            <h1 className="text-xl font-bold text-slate-800 mb-1">📝 {assignment.title}</h1>
            <p className="text-xs text-slate-500">{questions.length} question(s) · {totalPoints} points total{assignment.dueDate ? ` · Due ${new Date(assignment.dueDate).toLocaleString()}` : ''}</p>
            {assignment.instructions && <p className="text-sm text-slate-600 mt-3 whitespace-pre-wrap">{assignment.instructions}</p>}
            {assignment.maxAttempts > 1 && <p className="text-xs text-slate-400 mt-2">Attempts: {attemptsUsed}/{assignment.maxAttempts}</p>}
          </div>

          {(result || alreadyGraded) && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 mb-4">
              <p className="font-semibold text-emerald-800 mb-1">{alreadyGraded ? 'Graded' : 'Submitted'}</p>
              {result && (
                <p className="text-sm text-emerald-700">
                  Auto-graded score: {result.adjustedAutoScore.toFixed(2)} / {totalPoints}
                  {result.latePenaltyApplied ? ` (after −${result.latePenaltyApplied}% late penalty)` : ''}
                  {result.hasManualGrading ? ' — essay portion will be graded by your teacher.' : ''}
                </p>
              )}
              {alreadyGraded && submission?.marks != null && (
                <p className="text-sm text-emerald-700">Final score: {submission.marks} / {assignment.totalMarks}</p>
              )}
            </div>
          )}

          {submitError && <div className="mb-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{submitError}</div>}

          <div className="space-y-3">
            {questions.length === 0 && (
              <div className="bg-white rounded-xl p-12 text-center shadow-sm">
                <p className="text-4xl mb-3">⏳</p>
                <p className="text-slate-400">This quiz has no questions yet.</p>
              </div>
            )}
            {questions.map((q, i) => (
              <div key={q.id} className="bg-white rounded-xl shadow-sm p-5 border border-slate-100">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-semibold">Q{i + 1}</span>
                  <span className="text-[10px] uppercase px-2 py-0.5 rounded-full font-semibold bg-emerald-100 text-emerald-700">{q.points} pt</span>
                </div>
                <p className="text-sm text-slate-800 whitespace-pre-wrap mb-3">{q.prompt}</p>
                <QuestionInput q={q} value={answers[q.id]} onChange={(v) => setAnswer(q.id, v)} disabled={exhausted && !!submission} />
              </div>
            ))}
          </div>

          {questions.length > 0 && (
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                {exhausted ? 'No more attempts available.' : (submission ? 'Resubmitting replaces your previous answers.' : 'Submit when you are ready.')}
              </p>
              <button
                onClick={() => submitMutation.mutate()}
                disabled={submitMutation.isPending || (exhausted && !!submission)}
                className="bg-sky-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-sky-700 disabled:opacity-50">
                {submitMutation.isPending ? 'Submitting…' : (submission ? 'Resubmit Quiz' : 'Submit Quiz')}
              </button>
            </div>
          )}
        </div>
      </div>
    </AuthGuard>
  )
}

function QuestionInput({ q, value, onChange, disabled }: { q: Question; value: any; onChange: (v: any) => void; disabled?: boolean }) {
  switch (q.type) {
    case 'MCQ': {
      const choices: Array<{ id: string; text: string }> = q.data?.choices ?? []
      const multiple = !!q.data?.multiple
      const selected: string[] = Array.isArray(value) ? value : (value ? [value] : [])
      function toggle(id: string) {
        if (disabled) return
        if (multiple) {
          const next = selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]
          onChange(next)
        } else {
          onChange([id])
        }
      }
      return (
        <div className="space-y-2">
          {choices.map(c => (
            <label key={c.id} className={`flex items-center gap-2 text-sm cursor-pointer ${disabled ? 'opacity-60' : ''}`}>
              <input type={multiple ? 'checkbox' : 'radio'} name={q.id} checked={selected.includes(c.id)} onChange={() => toggle(c.id)} disabled={disabled} />
              {c.text}
            </label>
          ))}
        </div>
      )
    }
    case 'TF':
      return (
        <div className="flex items-center gap-6 text-sm">
          <label className={`flex items-center gap-1 cursor-pointer ${disabled ? 'opacity-60' : ''}`}>
            <input type="radio" name={q.id} checked={value === true} onChange={() => onChange(true)} disabled={disabled} /> True
          </label>
          <label className={`flex items-center gap-1 cursor-pointer ${disabled ? 'opacity-60' : ''}`}>
            <input type="radio" name={q.id} checked={value === false} onChange={() => onChange(false)} disabled={disabled} /> False
          </label>
        </div>
      )
    case 'NUMERICAL':
      return <input type="number" step="any" value={value ?? ''} onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))} disabled={disabled} className="w-full border rounded-lg px-3 py-2 text-sm" />
    case 'ESSAY': {
      const minWords = q.data?.minWords ?? 0
      const words = String(value || '').trim().split(/\s+/).filter(Boolean).length
      return (
        <div>
          <textarea value={value ?? ''} onChange={e => onChange(e.target.value)} disabled={disabled} rows={6} className="w-full border rounded-lg px-3 py-2 text-sm resize-none" placeholder="Write your answer here…" />
          {minWords > 0 && <p className={`text-[11px] mt-1 ${words >= minWords ? 'text-emerald-600' : 'text-slate-400'}`}>{words} / {minWords} words minimum</p>}
        </div>
      )
    }
    case 'MATCHING': {
      const left: Array<{ id: string; text: string }> = q.data?.left ?? []
      const right: Array<{ id: string; text: string }> = q.data?.right ?? []
      const given: Array<{ leftId: string; rightId: string }> = Array.isArray(value) ? value : []
      function setPair(leftId: string, rightId: string) {
        if (disabled) return
        const next = given.filter(p => p.leftId !== leftId)
        if (rightId) next.push({ leftId, rightId })
        onChange(next)
      }
      function pairFor(leftId: string) { return given.find(p => p.leftId === leftId)?.rightId ?? '' }
      return (
        <div className="space-y-2">
          {left.map(l => (
            <div key={l.id} className="flex items-center gap-2">
              <span className="text-sm text-slate-700 w-1/2 truncate">{l.text}</span>
              <select value={pairFor(l.id)} onChange={e => setPair(l.id, e.target.value)} disabled={disabled} className="flex-1 border rounded-lg px-2 py-1 text-sm">
                <option value="">— choose —</option>
                {right.map(r => <option key={r.id} value={r.id}>{r.text}</option>)}
              </select>
            </div>
          ))}
        </div>
      )
    }
  }
  return null
}
