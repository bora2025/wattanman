"use client"

import { useState } from 'react'
import Link from 'next/link'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import AuthGuard from '../../../components/AuthGuard'
import Sidebar from '../../../components/Sidebar'
import { teacherNav } from '../../../lib/teacher-nav'
import { apiFetch } from '../../../lib/api'

interface Exam {
  id: string; title: string; description: string | null; status: string
  duration: number; totalMarks: number; passMark: number
  class: { id: string; name: string } | null
  createdBy: { id: string; name: string }
  _count: { questions: number; attempts: number }
}
interface ClassItem { id: string; name: string; subject: string }

type QType = 'MCQ' | 'TF'
interface Choice { id: string; text: string; isCorrect: boolean }
interface ExamQuestionDraft {
  text: string
  type: QType
  marks: number
  data: any
}

const TYPE_LABEL: Record<QType, string> = { MCQ: 'Multi-Choice', TF: 'True / False' }

function uid(prefix: string) { return `${prefix}_${Math.random().toString(36).slice(2, 8)}` }

function defaultData(type: QType): any {
  switch (type) {
    case 'MCQ':
      return { choices: [{ id: uid('c'), text: '', isCorrect: false }, { id: uid('c'), text: '', isCorrect: false }], multiple: false }
    case 'TF':
    default:
      return { correct: true }
  }
}

function defaultQuestion(): ExamQuestionDraft {
  return { text: '', type: 'MCQ', marks: 1, data: defaultData('MCQ') }
}

const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-600',
  PUBLISHED: 'bg-sky-100 text-sky-700',
  ACTIVE: 'bg-emerald-100 text-emerald-700',
  COMPLETED: 'bg-purple-100 text-purple-700',
}

export default function TeacherExamsPage() {
  const [showForm, setShowForm] = useState(false)
  const qc = useQueryClient()

  const { data: exams = [] as Exam[], isLoading, isError, refetch } = useQuery<Exam[]>({
    queryKey: ['teacher-exams'],
    queryFn: async () => { const r = await apiFetch('/api/exams'); if (!r.ok) throw new Error(); return r.json() },
  })
  const { data: classes = [] as ClassItem[] } = useQuery<ClassItem[]>({
    queryKey: ['classes-list'],
    queryFn: async () => { const r = await apiFetch('/api/classes'); if (!r.ok) throw new Error(); return r.json() },
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiFetch(`/api/exams/${id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teacher-exams'] }),
  })
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/exams/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teacher-exams'] }),
  })

  return (
    <AuthGuard requiredRole="TEACHER">
      <div className="flex min-h-screen bg-slate-50 pt-14 lg:pt-0 pb-[72px] lg:pb-0">
        <Sidebar title="Teacher" subtitle="Portal" navItems={teacherNav} accentColor="sky" />

        <main className="flex-1 p-4 sm:p-6 max-w-4xl mx-auto w-full">
          <div className="flex items-center justify-between mb-4 sm:mb-6 gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-800">📝 My Exams</h1>
            <button onClick={() => setShowForm(true)}
              className="bg-sky-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-sky-700">
              + Create Exam
            </button>
          </div>

          {isLoading ? (
            <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="bg-white h-20 rounded-xl animate-pulse" />)}</div>
          ) : isError ? (
            <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
              <p className="text-red-600 mb-2">Failed to load exams</p>
              <button onClick={() => refetch()} className="text-sm text-red-500 underline">Retry</button>
            </div>
          ) : exams.length === 0 ? (
            <div className="bg-white rounded-xl p-12 text-center shadow-sm">
              <p className="text-5xl mb-4">📝</p>
              <p className="text-slate-400 text-lg">No exams created yet</p>
              <button onClick={() => setShowForm(true)} className="mt-4 text-sky-600 text-sm underline">Create first exam</button>
            </div>
          ) : (
            <div className="space-y-3">
              {exams.map(exam => (
                <div key={exam.id} className="bg-white rounded-xl shadow-sm p-4 border border-slate-100 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-slate-800 truncate">{exam.title}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${STATUS_COLOR[exam.status]}`}>{exam.status}</span>
                    </div>
                    <p className="text-xs text-slate-500">
                      {exam.class?.name ?? 'All classes'} · {exam._count.questions} questions · {exam.duration} min · Pass: {exam.passMark}/{exam.totalMarks}
                    </p>
                    <p className="text-xs text-amber-600 mt-0.5">{exam._count.attempts} attempt(s)</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Link
                      href={`/teacher/exams/${exam.id}/attempts`}
                      className="text-xs px-2.5 py-1 rounded-md border border-sky-200 text-sky-700 hover:bg-sky-50 font-medium"
                    >
                      Grade ({exam._count.attempts})
                    </Link>
                    <select value={exam.status}
                      onChange={e => statusMutation.mutate({ id: exam.id, status: e.target.value })}
                      className="text-xs border rounded-lg px-2 py-1 bg-white">
                      {['DRAFT','PUBLISHED','ACTIVE','COMPLETED'].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <button onClick={() => deleteMutation.mutate(exam.id)} className="text-xs text-red-500 hover:underline">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>

        {showForm && (
          <ExamFormModal
            classes={classes}
            onClose={() => setShowForm(false)}
            onSuccess={() => { setShowForm(false); qc.invalidateQueries({ queryKey: ['teacher-exams'] }) }}
          />
        )}
      </div>
    </AuthGuard>
  )
}

function ExamFormModal({ classes, onClose, onSuccess }: { classes: ClassItem[]; onClose: () => void; onSuccess: () => void }) {
  const { register, handleSubmit, formState: { isSubmitting } } = useForm({
    defaultValues: { title: '', description: '', classId: '', duration: 60, totalMarks: 100, passMark: 50 },
  })
  const [questions, setQuestions] = useState<ExamQuestionDraft[]>([defaultQuestion()])
  const [formError, setFormError] = useState<string | null>(null)

  function updateQuestion(i: number, patch: Partial<ExamQuestionDraft>) {
    setQuestions(qs => qs.map((q, idx) => idx === i ? { ...q, ...patch } : q))
  }
  function changeType(i: number, type: QType) {
    updateQuestion(i, { type, data: defaultData(type) })
  }
  function addQuestion() { setQuestions(qs => [...qs, defaultQuestion()]) }
  function removeQuestion(i: number) { setQuestions(qs => qs.filter((_, idx) => idx !== i)) }

  const onSubmit = async (data: any) => {
    setFormError(null)
    const res = await apiFetch('/api/exams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, status: 'DRAFT', questions }),
    })
    if (res.ok) {
      onSuccess()
    } else {
      const e = await res.json().catch(() => ({}))
      setFormError(Array.isArray(e?.message) ? e.message.join(', ') : (e?.message || 'Failed to create exam'))
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl p-6 w-full max-w-2xl shadow-xl my-4">
        <h2 className="text-lg font-bold mb-4">Create Exam</h2>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <input {...register('title', { required: true })} placeholder="Exam title *" className="w-full border rounded-lg px-3 py-2 text-sm" />
          <input {...register('description')} placeholder="Description" className="w-full border rounded-lg px-3 py-2 text-sm" />
          <div className="grid grid-cols-2 gap-3">
            <select {...register('classId')} className="border rounded-lg px-3 py-2 text-sm">
              <option value="">All classes</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input type="number" {...register('duration')} placeholder="Duration (min)" className="border rounded-lg px-3 py-2 text-sm" />
            <input type="number" {...register('totalMarks')} placeholder="Total marks" className="border rounded-lg px-3 py-2 text-sm" />
            <input type="number" {...register('passMark')} placeholder="Pass mark" className="border rounded-lg px-3 py-2 text-sm" />
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-700 mb-2">Questions</p>
            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {questions.map((q, i) => (
                <div key={i} className="border rounded-lg p-3 bg-slate-50 relative">
                  <button type="button" onClick={() => removeQuestion(i)} disabled={questions.length <= 1} className="absolute top-2 right-2 text-red-400 text-xs disabled:opacity-30">✕</button>
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    <select value={q.type} onChange={e => changeType(i, e.target.value as QType)} className="col-span-2 border rounded px-2 py-1 text-sm">
                      {(Object.keys(TYPE_LABEL) as QType[]).map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                    </select>
                    <input type="number" step="any" min={0} value={q.marks} onChange={e => updateQuestion(i, { marks: Number(e.target.value) || 0 })} placeholder="Marks" className="border rounded px-2 py-1 text-sm" />
                  </div>
                  <textarea value={q.text} onChange={e => updateQuestion(i, { text: e.target.value })} placeholder={`Q${i + 1}: Question text`} rows={2} className="w-full border rounded px-2 py-1 text-sm mb-2 resize-none" />

                  {q.type === 'MCQ' && (
                    <McqEditor data={q.data} onChange={d => updateQuestion(i, { data: d })} />
                  )}
                  {q.type === 'TF' && (
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-slate-500">Correct answer:</span>
                      <label className="flex items-center gap-1"><input type="radio" checked={q.data?.correct === true} onChange={() => updateQuestion(i, { data: { correct: true } })} /> True</label>
                      <label className="flex items-center gap-1"><input type="radio" checked={q.data?.correct === false} onChange={() => updateQuestion(i, { data: { correct: false } })} /> False</label>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <button type="button" onClick={addQuestion} className="mt-2 text-sm text-sky-600 hover:underline">+ Add Question</button>
          </div>

          {formError && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{formError}</div>}

          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm border rounded-lg">Cancel</button>
            <button type="submit" disabled={isSubmitting}
              className="px-4 py-2 text-sm bg-sky-600 text-white rounded-lg font-medium disabled:opacity-60">
              {isSubmitting ? 'Creating...' : 'Create Exam'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function McqEditor({ data, onChange }: { data: any; onChange: (d: any) => void }) {
  const choices: Choice[] = data?.choices ?? []
  const multiple = !!data?.multiple
  function setChoice(i: number, patch: Partial<Choice>) {
    const next = choices.map((c, idx) => idx === i ? { ...c, ...patch } : c)
    onChange({ ...data, choices: next })
  }
  function addChoice() { onChange({ ...data, choices: [...choices, { id: uid('c'), text: '', isCorrect: false }] }) }
  function removeChoice(i: number) { onChange({ ...data, choices: choices.filter((_, idx) => idx !== i) }) }
  function toggleCorrect(i: number) {
    if (multiple) {
      setChoice(i, { isCorrect: !choices[i].isCorrect })
    } else {
      onChange({ ...data, choices: choices.map((c, idx) => ({ ...c, isCorrect: idx === i })) })
    }
  }
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-xs text-slate-500">
        <input type="checkbox" checked={multiple} onChange={e => onChange({ ...data, multiple: e.target.checked })} /> Allow multiple correct answers
      </label>
      {choices.map((c, i) => (
        <div key={c.id} className="flex items-center gap-2">
          <input type={multiple ? 'checkbox' : 'radio'} checked={c.isCorrect} onChange={() => toggleCorrect(i)} title="Mark as correct" />
          <input value={c.text} onChange={e => setChoice(i, { text: e.target.value })} placeholder={`Choice ${i + 1}`} className="flex-1 border rounded-lg px-3 py-1.5 text-sm" />
          <button type="button" onClick={() => removeChoice(i)} disabled={choices.length <= 2} className="text-xs text-red-500 disabled:opacity-30">✕</button>
        </div>
      ))}
      <button type="button" onClick={addChoice} className="text-xs text-sky-600 hover:underline">+ Add choice</button>
    </div>
  )
}
