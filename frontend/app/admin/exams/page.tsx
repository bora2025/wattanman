"use client"

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, useFieldArray } from 'react-hook-form'
import Sidebar from '../../../components/Sidebar'
import AuthGuard from '../../../components/AuthGuard'
import { adminNav } from '../../../lib/admin-nav'
import { apiFetch } from '../../../lib/api'

interface Exam {
  id: string; title: string; description: string | null; status: string
  duration: number; totalMarks: number; passMark: number
  class: { id: string; name: string } | null
  createdBy: { id: string; name: string }
  _count: { questions: number; attempts: number }
  createdAt: string
}
interface ClassItem { id: string; name: string }

const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-600',
  PUBLISHED: 'bg-sky-100 text-sky-700',
  ACTIVE: 'bg-emerald-100 text-emerald-700',
  COMPLETED: 'bg-purple-100 text-purple-700',
}

export default function ExamAdminPage() {
  const [showForm, setShowForm] = useState(false)
  const [editExam, setEditExam] = useState<Exam | null>(null)
  const qc = useQueryClient()

  const { data: exams = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['exams'],
    queryFn: async () => { const r = await apiFetch('/api/exams'); if (!r.ok) throw new Error(); return r.json() as Promise<Exam[]> },
  })
  const { data: classes = [] } = useQuery({
    queryKey: ['classes-list'],
    queryFn: async () => { const r = await apiFetch('/api/classes'); if (!r.ok) throw new Error(); return r.json() as Promise<ClassItem[]> },
  })

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiFetch(`/api/exams/${id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exams'] }),
  })
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/exams/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exams'] }),
  })

  return (
    <AuthGuard>
      <div className="flex min-h-screen bg-slate-50">
        <Sidebar title="Admin Panel" subtitle="Wattanman" navItems={adminNav} accentColor="indigo" />
        <main className="flex-1 p-6 max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-slate-800">📝 Examinations</h1>
            <button onClick={() => { setEditExam(null); setShowForm(true) }}
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
              <p className="text-slate-400 text-lg">No exams yet</p>
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
                    <p className="text-xs text-slate-500">{exam.class?.name ?? 'All classes'} · {exam._count.questions} questions · {exam.duration} min · Pass: {exam.passMark}/{exam.totalMarks}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{exam._count.attempts} attempt(s) · by {exam.createdBy.name}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
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
            onSuccess={() => { setShowForm(false); qc.invalidateQueries({ queryKey: ['exams'] }) }}
          />
        )}
      </div>
    </AuthGuard>
  )
}

function ExamFormModal({ classes, onClose, onSuccess }: { classes: ClassItem[]; onClose: () => void; onSuccess: () => void }) {
  const { register, control, handleSubmit, formState: { isSubmitting } } = useForm({
    defaultValues: { title: '', description: '', classId: '', duration: 60, totalMarks: 100, passMark: 50, questions: [{ text: '', type: 'MCQ', options: ['','','',''], answer: '', marks: 1 }] },
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'questions' })

  const onSubmit = async (data: any) => {
    const res = await apiFetch('/api/exams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, status: 'DRAFT' }),
    })
    if (res.ok) onSuccess()
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
            <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
              {fields.map((field, i) => (
                <div key={field.id} className="border rounded-lg p-3 bg-slate-50 relative">
                  <button type="button" onClick={() => remove(i)} className="absolute top-2 right-2 text-red-400 text-xs">✕</button>
                  <input {...register(`questions.${i}.text`)} placeholder={`Q${i+1}: Question text`} className="w-full border rounded px-2 py-1 text-sm mb-2" />
                  <div className="grid grid-cols-2 gap-2">
                    <input {...register(`questions.${i}.answer`)} placeholder="Correct answer" className="border rounded px-2 py-1 text-sm" />
                    <input type="number" {...register(`questions.${i}.marks`)} placeholder="Marks" className="border rounded px-2 py-1 text-sm" />
                  </div>
                </div>
              ))}
            </div>
            <button type="button"
              onClick={() => append({ text: '', type: 'MCQ', options: ['','','',''], answer: '', marks: 1 })}
              className="mt-2 text-sm text-sky-600 hover:underline">+ Add Question</button>
          </div>

          <div className="flex gap-2 justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm border rounded-lg">Cancel</button>
            <button type="submit" disabled={isSubmitting} className="px-4 py-2 text-sm bg-sky-600 text-white rounded-lg font-medium disabled:opacity-60">
              {isSubmitting ? 'Creating...' : 'Create Exam'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
