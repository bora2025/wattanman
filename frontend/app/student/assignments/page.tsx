"use client"

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import AuthGuard from '../../../components/AuthGuard'
import Sidebar from '../../../components/Sidebar'
import { apiFetch } from '../../../lib/api'

const studentNav = [
  { label: 'nav.dashboard', href: '/student', icon: 'dashboard' },
  { label: 'Assignments', href: '/student/assignments', icon: 'book' },
  { label: 'My Scores', href: '/student/scores', icon: 'chart' },
  { label: 'Exams', href: '/student/exams', icon: 'clipboard' },
  { label: 'Messages', href: '/student/messages', icon: 'clipboard' },
  { label: 'My Parent', href: '/student/parent', icon: 'users' },
]

interface Assignment { id: string; title: string; description: string | null; dueDate: string | null; totalMarks: number; class: { name: string; subject: string }; createdBy: { name: string }; submission: { id: string; marks: number | null; submittedAt: string; isLate: boolean } | null }

const STATUS_MAP = {
  graded: { label: 'Graded', color: 'bg-emerald-100 text-emerald-700' },
  submitted: { label: 'Submitted', color: 'bg-sky-100 text-sky-700' },
  late: { label: 'Late', color: 'bg-orange-100 text-orange-700' },
  pending: { label: 'Pending', color: 'bg-amber-100 text-amber-700' },
  missing: { label: 'Missing', color: 'bg-red-100 text-red-700' },
}

function getStatus(a: Assignment) {
  if (!a.submission) return a.dueDate && new Date(a.dueDate) < new Date() ? 'missing' : 'pending'
  if (a.submission.marks !== null) return 'graded'
  if (a.submission.isLate) return 'late'
  return 'submitted'
}

export default function StudentAssignmentsPage() {
  const [submitFor, setSubmitFor] = useState<Assignment | null>(null)
  const qc = useQueryClient()

  const { data: assignments = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['student-assignments'],
    queryFn: async () => { const r = await apiFetch('/api/assignments/student/my-assignments'); if (!r.ok) throw new Error(); return r.json() as Promise<Assignment[]> },
  })

  const submitMutation = useMutation({
    mutationFn: ({ id, content }: { id: string; content: string }) =>
      apiFetch(`/api/assignments/${id}/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['student-assignments'] }); setSubmitFor(null) },
  })

  const { register, handleSubmit, reset } = useForm<{ content: string }>()
  const onSubmit = (data: { content: string }) => { if (submitFor) submitMutation.mutate({ id: submitFor.id, content: data.content }) }

  return (
    <AuthGuard requiredRole="STUDENT">
      <div className="flex min-h-screen bg-slate-50">
        <Sidebar title="Student" subtitle="Portal" navItems={studentNav} accentColor="emerald" />
        <main className="flex-1 p-6">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-2xl font-bold text-slate-800 mb-6">📚 My Assignments</h1>

          {isLoading ? (
            <div className="space-y-3">{[1,2,3,4].map(i => <div key={i} className="bg-white h-20 rounded-xl animate-pulse" />)}</div>
          ) : isError ? (
            <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
              <p className="text-red-600 mb-2">Failed to load assignments</p>
              <button onClick={() => refetch()} className="text-sm text-red-500 underline">Retry</button>
            </div>
          ) : assignments.length === 0 ? (
            <div className="bg-white rounded-xl p-12 text-center shadow-sm">
              <p className="text-4xl mb-3">📚</p>
              <p className="text-slate-400">No assignments assigned yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {assignments.map(a => {
                const status = getStatus(a)
                const meta = STATUS_MAP[status as keyof typeof STATUS_MAP]
                return (
                  <div key={a.id} className="bg-white rounded-xl shadow-sm p-4 border border-slate-100">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-semibold text-slate-800">{a.title}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${meta.color}`}>{meta.label}</span>
                        </div>
                        <p className="text-xs text-slate-500">{a.class.name} · {a.class.subject} · by {a.createdBy.name}</p>
                        {a.dueDate && <p className="text-xs text-slate-400 mt-0.5">Due: {new Date(a.dueDate).toLocaleDateString()}</p>}
                        {a.submission?.marks !== null && a.submission && (
                          <p className="text-xs font-semibold text-emerald-600 mt-1">Score: {a.submission.marks}/{a.totalMarks}</p>
                        )}
                      </div>
                      {(status === 'pending' || status === 'missing') && (
                        <button onClick={() => { setSubmitFor(a); reset() }}
                          className="text-xs bg-sky-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-sky-700 flex-shrink-0">
                          Submit
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {submitFor && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
              <h2 className="text-lg font-bold mb-1">{submitFor.title}</h2>
              <p className="text-xs text-slate-400 mb-4">{submitFor.class.name}</p>
              <form onSubmit={handleSubmit(onSubmit)}>
                <textarea {...register('content', { required: true })}
                  rows={5}
                  placeholder="Write your answer or paste your submission content here..."
                  className="w-full border rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-sky-300 mb-4" />
                <div className="flex gap-2 justify-end">
                  <button type="button" onClick={() => setSubmitFor(null)} className="px-4 py-2 text-sm border rounded-lg">Cancel</button>
                  <button type="submit" disabled={submitMutation.isPending}
                    className="px-4 py-2 text-sm bg-sky-600 text-white rounded-lg font-medium disabled:opacity-60">
                    {submitMutation.isPending ? 'Submitting...' : 'Submit Assignment'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
    </AuthGuard>
  )
}
