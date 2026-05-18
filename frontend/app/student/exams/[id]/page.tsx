"use client"

import { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useRouter, useParams } from 'next/navigation'
import AuthGuard from '../../../../components/AuthGuard'
import { apiFetch } from '../../../../lib/api'

interface Question { id: string; text: string; type: string; options: string[] | null; marks: number }
interface ExamDetail { id: string; title: string; duration: number; totalMarks: number; passMark: number; questions: Question[] }
interface Attempt { id: string; status: string; startedAt: string }

export default function StudentExamTakingPage() {
  const params = useParams()
  const router = useRouter()
  const examId = params?.id as string
  const [attempt, setAttempt] = useState<Attempt | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const { data: exam, isLoading } = useQuery({
    queryKey: ['exam-detail', examId],
    queryFn: async () => { const r = await apiFetch(`/api/exams/${examId}`); if (!r.ok) throw new Error(); return r.json() as Promise<ExamDetail> },
    enabled: !!examId,
  })

  const startMutation = useMutation({
    mutationFn: () => apiFetch(`/api/exams/${examId}/start`, { method: 'POST' }),
    onSuccess: async (res) => { const data = await res.json(); setAttempt(data); setTimeLeft((exam?.duration ?? 60) * 60) },
  })

  const submitMutation = useMutation({
    mutationFn: (attemptId: string) =>
      apiFetch(`/api/exams/attempts/${attemptId}/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers }) }),
    onSuccess: () => setSubmitted(true),
  })

  const saveAnswers = useCallback(async () => {
    if (!attempt) return
    await apiFetch(`/api/exams/attempts/${attempt.id}/answers`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers }) })
  }, [attempt, answers])

  useEffect(() => {
    if (!attempt || timeLeft === null) return
    if (timeLeft <= 0) { submitMutation.mutate(attempt.id); return }
    const tick = setInterval(() => setTimeLeft(t => (t ?? 1) - 1), 1000)
    if (timeLeft % 30 === 0) saveAnswers()
    return () => clearInterval(tick)
  }, [timeLeft, attempt])

  const formatTime = (secs: number) => `${Math.floor(secs / 60).toString().padStart(2, '0')}:${(secs % 60).toString().padStart(2, '0')}`

  if (submitted) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="bg-white rounded-2xl p-10 text-center shadow-xl max-w-sm">
        <p className="text-5xl mb-4">✅</p>
        <h2 className="text-xl font-bold text-slate-800 mb-2">Exam Submitted!</h2>
        <p className="text-slate-500 text-sm mb-6">Your answers have been submitted. Results will be available soon.</p>
        <button onClick={() => router.push('/student/exams')} className="bg-sky-600 text-white px-6 py-2 rounded-xl font-medium">Back to Exams</button>
      </div>
    </div>
  )

  return (
    <AuthGuard>
      <div className="min-h-screen bg-slate-50">
        {/* Header */}
        <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
          <div>
            <p className="font-bold text-slate-800">{exam?.title ?? 'Loading...'}</p>
            <p className="text-xs text-slate-400">{exam?.totalMarks} marks · {exam?.questions?.length ?? 0} questions</p>
          </div>
          {attempt && timeLeft !== null && (
            <div className={`text-lg font-mono font-bold ${timeLeft < 300 ? 'text-red-600' : 'text-slate-800'}`}>
              ⏱ {formatTime(timeLeft)}
            </div>
          )}
        </div>

        <div className="max-w-2xl mx-auto p-6">
          {!attempt ? (
            <div className="bg-white rounded-2xl p-10 text-center shadow-sm mt-10">
              <p className="text-4xl mb-4">📝</p>
              {isLoading ? (
                <p className="text-slate-400">Loading exam...</p>
              ) : exam ? (
                <>
                  <h2 className="text-xl font-bold text-slate-800 mb-2">{exam.title}</h2>
                  <p className="text-slate-500 text-sm mb-1">{exam.questions.length} questions · {exam.duration} minutes</p>
                  <p className="text-slate-500 text-sm mb-6">Pass mark: {exam.passMark}/{exam.totalMarks}</p>
                  <p className="text-xs text-amber-600 mb-6 bg-amber-50 rounded-lg px-4 py-2">⚠️ Once started, the timer cannot be paused. Answers auto-save every 30 seconds.</p>
                  <button onClick={() => startMutation.mutate()} disabled={startMutation.isPending}
                    className="bg-sky-600 text-white px-8 py-3 rounded-xl font-semibold text-lg hover:bg-sky-700 disabled:opacity-60">
                    {startMutation.isPending ? 'Starting...' : 'Start Exam'}
                  </button>
                </>
              ) : (
                <p className="text-red-500">Failed to load exam</p>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {exam?.questions.map((q, i) => (
                <div key={q.id} className="bg-white rounded-xl shadow-sm p-5 border border-slate-100">
                  <p className="font-semibold text-slate-800 mb-3">Q{i + 1}. {q.text} <span className="text-xs font-normal text-slate-400">({q.marks} mark{q.marks !== 1 ? 's' : ''})</span></p>
                  {q.type === 'MCQ' && q.options ? (
                    <div className="space-y-2">
                      {q.options.map((opt, j) => (
                        <label key={j} className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${answers[q.id] === opt ? 'border-sky-500 bg-sky-50' : 'border-slate-200 hover:border-slate-300'}`}>
                          <input type="radio" name={q.id} value={opt} checked={answers[q.id] === opt} onChange={() => setAnswers(a => ({ ...a, [q.id]: opt }))} className="sr-only" />
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${answers[q.id] === opt ? 'border-sky-500' : 'border-slate-300'}`}>
                            {answers[q.id] === opt && <div className="w-2.5 h-2.5 rounded-full bg-sky-500" />}
                          </div>
                          <span className="text-sm text-slate-700">{opt}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <textarea value={answers[q.id] ?? ''} onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))}
                      rows={3} placeholder="Write your answer here..."
                      className="w-full border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-sky-300" />
                  )}
                </div>
              ))}

              <div className="text-center pb-10">
                <button onClick={() => attempt && submitMutation.mutate(attempt.id)} disabled={submitMutation.isPending}
                  className="bg-emerald-600 text-white px-8 py-3 rounded-xl font-semibold text-lg hover:bg-emerald-700 disabled:opacity-60">
                  {submitMutation.isPending ? 'Submitting...' : 'Submit Exam'}
                </button>
                <p className="text-xs text-slate-400 mt-2">Make sure all questions are answered before submitting</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </AuthGuard>
  )
}
