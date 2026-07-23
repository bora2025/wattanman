"use client"

import { useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import AuthGuard from '../../../../../components/AuthGuard'
import Sidebar from '../../../../../components/Sidebar'
import { teacherNav } from '../../../../../lib/teacher-nav'
import { apiFetch } from '../../../../../lib/api'
import { gradeQuestion } from '../../../../../lib/examQuestionLogic'
import { parseDragWordsText, diffWords } from '../../../../../lib/h5pQuestionLogic'
import MathText from '../../../../../components/MathText'

interface ExamQuestion {
  id: string
  text: string
  type: string
  data: any
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
  answers: Record<string, any> | null
  manualMarks: Record<string, number> | null
  feedback: string | null
  student: { id: string; user: { name: string } }
}

// Every exam type except ESSAY is auto-graded (the only one exercising the
// mixed-exam "wait for manual grading" path — see exam.service.ts's submitAttempt).
function isAutoGraded(type: string) {
  return type !== 'ESSAY'
}

// Mirrors backend/src/h5p/h5p-questions.ts's parseDragWordsText, so the gradebook
// can derive blanks+answers from the same *word*-marked-up text without a round trip.
function parseDragWordsBlanks(text: string): { id: string; answer: string }[] {
  return parseDragWordsText(text).filter((s): s is { type: 'blank'; id: string; answer: string } => s.type === 'blank')
}

// Delegates to lib/examQuestionLogic.ts's gradeQuestion (which mirrors the backend
// exactly, including the shared H5P grading for the 6 auto-graded H5P types), so the
// gradebook can show the score without a round-trip.
function gradeAutoQuestion(q: ExamQuestion, response: any): number {
  return gradeQuestion({ type: q.type, marks: q.marks, data: q.data }, response).awarded ?? 0
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

  const manualQuestions = useMemo(() => exam?.questions.filter(q => !isAutoGraded(q.type)) ?? [], [exam])

  return (
    <AuthGuard allowedRoles={['TEACHER', 'ADMIN', 'SUPER_ADMIN']}>
      <div className="flex min-h-screen bg-slate-50 pt-14 lg:pt-0 pb-[72px] lg:pb-0">
        <Sidebar title="Teacher" subtitle="Portal" navItems={teacherNav} accentColor="sky" />
        <main className="flex-1 p-4 sm:p-6 max-w-5xl mx-auto w-full">
          <div className="mb-4 sm:mb-6 flex items-center gap-3 flex-wrap">
            <button onClick={() => router.push('/teacher/exams')} className="text-sm text-slate-500 hover:text-slate-800">← Back</button>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-800">
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
                  {manualQuestions.length > 0 && (
                    <> · <span className="text-amber-700">{manualQuestions.length} question(s) require manual grading</span></>
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
                      <div className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-800 truncate">{att.student.user.name}</p>
                          <p className="text-xs text-slate-500">
                            Submitted: {att.submittedAt ? new Date(att.submittedAt).toLocaleString() : '—'}
                            {att.gradedAt && <> · Graded: {new Date(att.gradedAt).toLocaleString()}</>}
                          </p>
                        </div>
                        <div className="flex items-center justify-between gap-3 sm:flex-shrink-0">
                          <div className="text-left sm:text-right">
                            <div className="text-sm font-semibold text-slate-800">
                              {att.score ?? 0} / {exam.totalMarks}
                              {att.grade && <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${att.grade === 'PASS' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{att.grade}</span>}
                            </div>
                            <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full font-semibold ${STATUS_COLOR[att.status] ?? 'bg-slate-100 text-slate-600'}`}>{att.status}</span>
                          </div>
                          <button
                            onClick={() => setOpenAttemptId(openAttemptId === att.id ? null : att.id)}
                            className="flex-shrink-0 text-xs px-3 py-1.5 rounded-md border border-sky-200 text-sky-700 hover:bg-sky-50 font-medium"
                          >
                            {openAttemptId === att.id ? 'Close' : att.status === 'GRADED' ? 'Review' : 'Grade'}
                          </button>
                        </div>
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
      if (!isAutoGraded(q.type)) {
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
        const studentAnswer = answers[q.id]
        const autoGraded = isAutoGraded(q.type)
        const awarded = autoGraded ? gradeAutoQuestion(q, studentAnswer) : 0
        const choices: { id: string; text: string; isCorrect: boolean }[] = q.data?.choices ?? []
        const chosenIds = new Set(Array.isArray(studentAnswer) ? studentAnswer.map(String) : studentAnswer != null ? [String(studentAnswer)] : [])
        const paragraphs: { id: string; text: string }[] = q.data?.paragraphs ?? []
        const dragBlanks = q.type === 'DRAG_WORDS' ? parseDragWordsBlanks(q.data?.text || '') : []
        const dropItems: { id: string; label: string; correctZoneId: string }[] = q.data?.items ?? []
        const dropZones: { id: string }[] = q.data?.zones ?? []
        const swSetItems: { id: string; prompt: string; acceptedAnswers: string[] }[] = q.data?.items ?? []
        return (
          <div key={q.id} className="bg-white rounded-lg border border-slate-200 p-3">
            <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5 mb-2">
              <p className="text-sm font-semibold text-slate-800 min-w-0 break-words">
                Q{idx + 1}. <MathText as="span" text={q.text} />
                <span className="ml-2 text-xs text-slate-400 font-normal">({q.type} · {q.marks} marks)</span>
              </p>
              {autoGraded && (
                <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-semibold ${awarded === q.marks ? 'bg-emerald-100 text-emerald-700' : awarded > 0 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                  +{Math.round(awarded * 100) / 100} (auto)
                </span>
              )}
            </div>
            {q.type === 'MCQ' && choices.length > 0 && (
              <ul className="text-xs text-slate-600 space-y-0.5 mb-2 ml-4">
                {choices.map((c) => (
                  <li key={c.id} className={c.isCorrect ? 'text-emerald-700 font-semibold' : ''}>
                    {chosenIds.has(c.id) ? '☑' : '☐'} <MathText as="span" text={c.text} />{c.isCorrect ? ' (correct)' : ''}
                  </li>
                ))}
              </ul>
            )}
            {q.type === 'TF' && (
              <div className="text-xs text-slate-600 mb-2 ml-4">
                Correct answer: <span className="font-semibold text-emerald-700">{q.data?.correct ? 'True' : 'False'}</span>
              </div>
            )}
            {q.type === 'SORT_PARAGRAPHS' && paragraphs.length > 0 && (
              <ol className="text-xs text-slate-600 space-y-0.5 mb-2 ml-4 list-decimal list-inside">
                {paragraphs.map((p) => <li key={p.id} className="text-emerald-700 font-semibold"><MathText as="span" text={p.text} /></li>)}
              </ol>
            )}
            {q.type === 'DRAG_WORDS' && dragBlanks.length > 0 && (
              <div className="text-xs text-slate-600 mb-2 ml-4">
                Correct words: {dragBlanks.map((b) => <span key={b.id} className="text-emerald-700 font-semibold mr-2">[{b.answer}]</span>)}
              </div>
            )}
            {q.type === 'DRAG_DROP' && dropItems.length > 0 && (
              <ul className="text-xs text-slate-600 space-y-0.5 mb-2 ml-4">
                {dropItems.map((it) => (
                  <li key={it.id} className="text-emerald-700 font-semibold">
                    <MathText as="span" text={it.label} /> → Zone {dropZones.findIndex(z => z.id === it.correctZoneId) + 1}
                  </li>
                ))}
              </ul>
            )}
            {q.type === 'SPEAK_WORDS' && (q.data?.acceptedAnswers ?? []).length > 0 && (
              <div className="text-xs text-slate-600 mb-2 ml-4">
                Accepted answers: {(q.data.acceptedAnswers as string[]).map((a, i) => <span key={i} className="text-emerald-700 font-semibold mr-2">[{a}]</span>)}
              </div>
            )}
            {q.type === 'SPEAK_WORDS_SET' && swSetItems.length > 0 && (
              <ul className="text-xs text-slate-600 space-y-0.5 mb-2 ml-4">
                {swSetItems.map((it) => (
                  <li key={it.id}><MathText as="span" text={it.prompt} />: <span className="text-emerald-700 font-semibold">{it.acceptedAnswers.join(' / ')}</span></li>
                ))}
              </ul>
            )}
            {q.type === 'DICTATION' && q.data?.script && (
              <div className="text-xs text-slate-600 mb-2 ml-4">
                Script: <MathText as="span" className="text-emerald-700 font-semibold" text={q.data.script} />
              </div>
            )}
            <div className="text-xs text-slate-500 mb-1">Student answer:</div>
            <div className="text-sm bg-slate-50 border border-slate-200 rounded p-2 whitespace-pre-wrap">
              {q.type === 'MCQ' ? (
                choices.filter(c => chosenIds.has(c.id)).length > 0
                  ? <MathText as="span" text={choices.filter(c => chosenIds.has(c.id)).map(c => c.text).join(', ')} />
                  : <span className="text-slate-400 italic">(no answer)</span>
              ) : q.type === 'TF' ? (
                studentAnswer == null ? <span className="text-slate-400 italic">(no answer)</span> : (studentAnswer ? 'True' : 'False')
              ) : q.type === 'SORT_PARAGRAPHS' ? (
                Array.isArray(studentAnswer) && studentAnswer.length > 0 ? (
                  <ol className="list-decimal list-inside space-y-0.5">
                    {studentAnswer.map((id: string, i: number) => {
                      const p = paragraphs.find(x => x.id === id)
                      const rightSpot = paragraphs[i]?.id === id
                      return <li key={id} className={rightSpot ? 'text-emerald-700' : 'text-red-600'}>{p ? <MathText as="span" text={p.text} /> : '(unknown)'}</li>
                    })}
                  </ol>
                ) : <span className="text-slate-400 italic">(no answer)</span>
              ) : q.type === 'DRAG_WORDS' ? (
                dragBlanks.length > 0 ? (
                  <div className="space-y-0.5">
                    {dragBlanks.map((b) => {
                      const given = studentAnswer && typeof studentAnswer === 'object' ? studentAnswer[b.id] : undefined
                      const ok = (given || '').trim().toLowerCase() === b.answer.trim().toLowerCase()
                      return <div key={b.id}>Blank &quot;{b.answer}&quot;: <span className={ok ? 'text-emerald-700 font-semibold' : 'text-red-600'}>{given || '(blank)'}</span></div>
                    })}
                  </div>
                ) : <span className="text-slate-400 italic">(no answer)</span>
              ) : q.type === 'DRAG_DROP' ? (
                dropItems.length > 0 ? (
                  <div className="space-y-0.5">
                    {dropItems.map((it) => {
                      const given = studentAnswer && typeof studentAnswer === 'object' ? studentAnswer[it.id] : undefined
                      const ok = given === it.correctZoneId
                      const zoneIdx = dropZones.findIndex(z => z.id === given)
                      return <div key={it.id}><MathText as="span" text={it.label} />: <span className={ok ? 'text-emerald-700 font-semibold' : 'text-red-600'}>{given ? `Zone ${zoneIdx + 1}` : '(not placed)'}</span></div>
                    })}
                  </div>
                ) : <span className="text-slate-400 italic">(no answer)</span>
              ) : q.type === 'SPEAK_WORDS' ? (
                studentAnswer ? <MathText as="span" text={studentAnswer} /> : <span className="text-slate-400 italic">(no answer)</span>
              ) : q.type === 'SPEAK_WORDS_SET' ? (
                swSetItems.length > 0 ? (
                  <div className="space-y-0.5">
                    {swSetItems.map((it) => {
                      const given = studentAnswer && typeof studentAnswer === 'object' ? studentAnswer[it.id] : undefined
                      return <div key={it.id}><MathText as="span" text={it.prompt} />: <span className="text-slate-700">{given || '(no answer)'}</span></div>
                    })}
                  </div>
                ) : <span className="text-slate-400 italic">(no answer)</span>
              ) : q.type === 'DICTATION' ? (
                <div className="space-y-1">
                  {diffWords(q.data?.script || '', studentAnswer || '').map((d, i) => (
                    <span key={i} className={`mr-1.5 ${d.match ? 'text-emerald-700' : 'text-red-600 line-through'}`}>{d.word}</span>
                  ))}
                  {!studentAnswer && <span className="text-slate-400 italic block">(no answer)</span>}
                </div>
              ) : (
                studentAnswer || <span className="text-slate-400 italic">(no answer)</span>
              )}
            </div>
            {!autoGraded && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label className="text-xs text-slate-600">Marks:</label>
                <input
                  type="number"
                  min={0}
                  max={q.marks}
                  step="0.5"
                  value={marks[q.id] ?? ''}
                  onChange={e => setMarks({ ...marks, [q.id]: e.target.value })}
                  className="w-24 text-sm border border-slate-300 rounded-md px-2 py-1.5"
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

      <div className="flex flex-col sm:flex-row sm:justify-end gap-2">
        <button
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending}
          className="w-full sm:w-auto bg-emerald-600 text-white text-sm font-medium px-4 py-2 sm:py-1.5 rounded-md hover:bg-emerald-700 disabled:opacity-60"
        >
          {saveMutation.isPending ? 'Saving…' : 'Save & Finalize Grade'}
        </button>
      </div>
    </div>
  )
}
