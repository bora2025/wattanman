"use client"

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import Link from 'next/link'
import AuthGuard from '../../../components/AuthGuard'
import { apiFetch } from '../../../lib/api'

interface Assignment { id: string; title: string; description: string | null; dueDate: string | null; totalMarks: number; class: { id: string; name: string; subject: string }; _count: { submissions: number } }
interface ClassItem { id: string; name: string; subject: string }

export default function TeacherAssignmentsPage() {
  const [showForm, setShowForm] = useState(false)
  const qc = useQueryClient()

  const { data: assignments = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['teacher-assignments'],
    queryFn: async () => { const r = await apiFetch('/api/assignments/my-assignments'); if (!r.ok) throw new Error(); return r.json() as Promise<Assignment[]> },
  })
  const { data: classes = [] } = useQuery({
    queryKey: ['classes-list'],
    queryFn: async () => { const r = await apiFetch('/api/classes'); if (!r.ok) throw new Error(); return r.json() as Promise<ClassItem[]> },
  })

  const createMutation = useMutation({
    mutationFn: (data: any) => apiFetch('/api/assignments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['teacher-assignments'] }); setShowForm(false) },
  })
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/assignments/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teacher-assignments'] }),
  })

  const { register, handleSubmit, reset, formState: { isSubmitting } } = useForm()
  const onSubmit = async (data: any) => { await createMutation.mutateAsync({ ...data, totalMarks: Number(data.totalMarks) }); reset() }

  return (
    <AuthGuard requiredRole="TEACHER">
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-slate-800">📚 My Assignments</h1>
            <button onClick={() => setShowForm(true)} className="bg-sky-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-sky-700">+ New Assignment</button>
          </div>

          {isLoading ? (
            <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="bg-white h-20 rounded-xl animate-pulse" />)}</div>
          ) : isError ? (
            <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
              <p className="text-red-600 mb-2">Failed to load assignments</p>
              <button onClick={() => refetch()} className="text-sm text-red-500 underline">Retry</button>
            </div>
          ) : assignments.length === 0 ? (
            <div className="bg-white rounded-xl p-12 text-center shadow-sm">
              <p className="text-4xl mb-3">📚</p>
              <p className="text-slate-400">No assignments created yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {assignments.map(a => (
                <div key={a.id} className="bg-white rounded-xl shadow-sm p-4 border border-slate-100 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800">{a.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{a.class.name} · {a.class.subject} · {a.totalMarks} marks</p>
                    {a.dueDate && <p className="text-xs text-slate-400">Due: {new Date(a.dueDate).toLocaleDateString()}</p>}
                    <p className="text-xs text-amber-600 mt-0.5">{a._count.submissions} submission(s)</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Link href={`/teacher/assignments/${a.id}`} className="text-xs bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg font-medium hover:bg-slate-200">Grade</Link>
                    <button onClick={() => deleteMutation.mutate(a.id)} className="text-xs text-red-500 hover:underline">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {showForm && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
              <h2 className="text-lg font-bold mb-4">New Assignment</h2>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
                <input {...register('title', { required: true })} placeholder="Title *" className="w-full border rounded-lg px-3 py-2 text-sm" />
                <textarea {...register('description')} rows={2} placeholder="Description" className="w-full border rounded-lg px-3 py-2 text-sm resize-none" />
                <select {...register('classId', { required: true })} className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">Select class *</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name} — {c.subject}</option>)}
                </select>
                <div className="grid grid-cols-2 gap-3">
                  <input type="number" {...register('totalMarks')} defaultValue={100} placeholder="Total marks" className="border rounded-lg px-3 py-2 text-sm" />
                  <input type="date" {...register('dueDate')} className="border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <button type="button" onClick={() => { setShowForm(false); reset() }} className="px-4 py-2 text-sm border rounded-lg">Cancel</button>
                  <button type="submit" disabled={isSubmitting} className="px-4 py-2 text-sm bg-sky-600 text-white rounded-lg font-medium disabled:opacity-60">
                    {isSubmitting ? 'Creating...' : 'Create'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </AuthGuard>
  )
}
