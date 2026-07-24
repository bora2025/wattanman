"use client"

import { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useRouter, useParams } from 'next/navigation'
import AuthGuard from '../../../../components/AuthGuard'
import { apiFetch } from '../../../../lib/api'
import { QuestionInput } from '../../../../components/ExamQuestionInput'
import RichText from '../../../../components/RichText'
import ProgressBar from '../../../../components/ProgressBar'
import type { QType } from '../../../../lib/examQuestionLogic'

interface Question { id: string; text: string; type: QType; marks: number; order: number; data: any }
interface ExamDetail { id: string; title: string; duration: number; totalMarks: number; passMark: number; questions: Question[] }
interface Attempt { id: string; status: string; startedAt: string }

export default function StudentExamTakingPage() {
  const params = useParams()
  const router = useRouter()
  const examId = params?.id as string
  const [attempt, setAttempt] = useState<Attempt | null>(null)
  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [timeLeft, setTimeLeft] = useState<number | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const { data: exam, isLoading } = useQuery({
    queryKey: ['exam-detail', examId],
    queryFn: async () => { const r = await apiFetch(`/api/exams/${examId}/take`); if (!r.ok) throw new Error(); return r.json() as Promise<ExamDetail> },
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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="bg-white rounded-2xl p-10 text-center shadow-xl max-w-sm border border-gray-100">
        <p className="text-5xl mb-4">✅</p>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Exam Submitted!</h2>
        <p className="text-gray-500 text-sm mb-6">Your answers have been submitted. Results will be available soon.</p>
        <button onClick={() => router.push('/student/exams')} className="bg-sky-600 text-white px-6 py-2.5 rounded-xl font-semibold hover:bg-sky-700 shadow-sm">Back to Exams</button>
      </div>
    </div>
  )

  const answeredCount = exam ? exam.questions.filter(q => answers[q.id] != null).length : 0

  return (
    <AuthGuard requiredRole="STUDENT">
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-100 px-6 py-4 sticky top-0 z-10 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-gray-900">{exam?.title ?? 'Loading...'}</p>
              <p className="text-xs text-gray-400">{exam?.totalMarks} marks · {exam?.questions?.length ?? 0} questions</p>
            </div>
            {attempt && timeLeft !== null && (
              <div className={`text-lg font-mono font-bold px-3 py-1 rounded-xl ${timeLeft < 300 ? 'text-red-600 bg-red-50' : 'text-gray-800 bg-gray-100'}`}>
                ⏱ {formatTime(timeLeft)}
              </div>
            )}
          </div>
          {attempt && exam && (
            <div className="mt-3">
              <ProgressBar pct={(answeredCount / (exam.questions.length || 1)) * 100} label={`${answeredCount} of ${exam.questions.length} answered`} color="bg-emerald-500" />
            </div>
          )}
        </div>

        <div className="max-w-2xl mx-auto p-6">
          {!attempt ? (
            <div className="bg-white rounded-2xl p-10 text-center shadow-sm border border-gray-100 mt-10">
              <p className="text-4xl mb-4">📝</p>
              {isLoading ? (
                <p className="text-gray-400">Loading exam...</p>
              ) : exam ? (
                <>
                  <h2 className="text-xl font-bold text-gray-900 mb-2">{exam.title}</h2>
                  <p className="text-gray-500 text-sm mb-1">{exam.questions.length} questions · {exam.duration} minutes</p>
                  <p className="text-gray-500 text-sm mb-6">Pass mark: {exam.passMark}/{exam.totalMarks}</p>
                  <p className="text-xs text-amber-700 mb-6 bg-amber-50 border border-amber-100 rounded-xl px-4 py-2">⚠️ Once started, the timer cannot be paused. Answers auto-save every 30 seconds.</p>
                  <button onClick={() => startMutation.mutate()} disabled={startMutation.isPending}
                    className="bg-sky-600 text-white px-8 py-3 rounded-xl font-semibold text-lg hover:bg-sky-700 disabled:opacity-60 shadow-sm">
                    {startMutation.isPending ? 'Starting...' : 'Start Exam'}
                  </button>
                </>
              ) : (
                <p className="text-red-500">Failed to load exam</p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {exam?.questions.map((q, i) => (
                <div key={q.id} className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
                  <div className="flex items-start gap-2 mb-3">
                    <span className="flex-none w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                    <div className="font-semibold text-gray-900">
                      <RichText as="div" html={q.text} />
                      <span className="text-xs font-normal text-gray-400">({q.marks} mark{q.marks !== 1 ? 's' : ''})</span>
                    </div>
                  </div>
                  <QuestionInput q={q} value={answers[q.id]} onChange={v => setAnswers(a => ({ ...a, [q.id]: v }))} />
                </div>
              ))}

              <div className="text-center pb-10 pt-2">
                <button onClick={() => attempt && submitMutation.mutate(attempt.id)} disabled={submitMutation.isPending}
                  className="bg-emerald-600 text-white px-8 py-3 rounded-xl font-semibold text-lg hover:bg-emerald-700 disabled:opacity-60 shadow-sm">
                  {submitMutation.isPending ? 'Submitting...' : 'Submit Exam'}
                </button>
                <p className="text-xs text-gray-400 mt-2">Make sure all questions are answered before submitting</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </AuthGuard>
  )
}
