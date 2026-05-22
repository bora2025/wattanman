"use client"

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import AuthGuard from '../../../../components/AuthGuard'
import { apiFetch } from '../../../../lib/api'

interface Submission {
  id: string
  content: string | null
  attachmentUrl: string | null
  submittedAt: string
  status: string // SUBMITTED | LATE | GRADED
  attemptNumber: number
  latePenaltyApplied: number | null
  marks: number | null
  feedback: string | null
  gradedAt: string | null
  student: { user: { name: string; photo: string | null } }
}
interface AssignmentDetail {
  id: string
  title: string
  totalMarks: number
  type: string
  status: string
  latePenaltyPct: number
  maxAttempts: number
  attachmentUrl: string | null
  instructions: string | null
  dueDate: string | null
  class: { name: string; subject?: string }
}

export default function TeacherGradingPage() {
  const params = useParams()
  const assignmentId = params?.id as string
  const [gradingId, setGradingId] = useState<string | null>(null)
  const qc = useQueryClient()

  const { data: assignment } = useQuery({
    queryKey: ['assignment-detail', assignmentId],
    queryFn: async () => { const r = await apiFetch(`/api/assignments/${assignmentId}`); if (!r.ok) throw new Error(); return r.json() as Promise<AssignmentDetail> },
    enabled: !!assignmentId,
  })
  const { data: submissions = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['submissions', assignmentId],
    queryFn: async () => { const r = await apiFetch(`/api/assignments/${assignmentId}`); if (!r.ok) throw new Error(); const data = await r.json(); return (data.submissions ?? []) as Submission[] },
    enabled: !!assignmentId,
  })

  const gradeMutation = useMutation({
    mutationFn: ({ submissionId, marks, feedback }: { submissionId: string; marks: number; feedback: string }) =>
      apiFetch(`/api/assignments/submissions/${submissionId}/grade`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ marks, feedback }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['submissions', assignmentId] }); setGradingId(null) },
  })

  const { register, handleSubmit, formState: { isSubmitting } } = useForm<{ marks: number; feedback: string }>()
  const onGrade = async (data: { marks: number; feedback: string }) => {
    if (!gradingId) return
    gradeMutation.mutate({ submissionId: gradingId, marks: Number(data.marks), feedback: data.feedback })
  }

  return (
    <AuthGuard requiredRole="TEACHER">
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="max-w-3xl mx-auto">
          <Link href="/teacher/assignments" className="text-sm text-sky-600 mb-4 block">← Back to Assignments</Link>
          <h1 className="text-2xl font-bold text-slate-800 mb-1">Grade Submissions</h1>
          {assignment && (
            <div className="mb-6">
              <p className="text-sm text-slate-500">{assignment.title} · {assignment.class?.name} · {assignment.totalMarks} marks · {assignment.type}</p>
              {assignment.dueDate && <p className="text-xs text-slate-400 mt-0.5">Due: {new Date(assignment.dueDate).toLocaleString()}</p>}
              {assignment.latePenaltyPct > 0 && <p className="text-xs text-orange-600 mt-0.5">Late penalty: {assignment.latePenaltyPct}% off final score</p>}
              {assignment.attachmentUrl && (
                <a href={assignment.attachmentUrl} target="_blank" rel="noreferrer" className="inline-block text-xs text-sky-600 underline mt-1">📎 Reference attachment</a>
              )}
              {assignment.type === 'QUIZ' && (
                <Link href={`/teacher/assignments/${assignmentId}/quiz`} className="inline-block mt-3 bg-violet-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-violet-700">📝 Manage Quiz Questions</Link>
              )}
            </div>
          )}

          {isLoading ? (
            <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="bg-white h-24 rounded-xl animate-pulse" />)}</div>
          ) : isError ? (
            <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
              <p className="text-red-600 mb-2">Failed to load submissions</p>
              <button onClick={() => refetch()} className="text-sm text-red-500 underline">Retry</button>
            </div>
          ) : submissions.length === 0 ? (
            <div className="bg-white rounded-xl p-12 text-center shadow-sm">
              <p className="text-4xl mb-3">📭</p>
              <p className="text-slate-400">No submissions yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {submissions.map(sub => (
                <div key={sub.id} className="bg-white rounded-xl shadow-sm p-4 border border-slate-100">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className="font-semibold text-slate-800">{sub.student?.user?.name}</p>
                        {sub.status === 'LATE' && <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-semibold">Late</span>}
                        {sub.attemptNumber > 1 && <span className="text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-semibold">Attempt {sub.attemptNumber}</span>}
                        {sub.marks !== null && <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">Graded: {sub.marks}/{assignment?.totalMarks}</span>}
                        {sub.latePenaltyApplied != null && sub.latePenaltyApplied > 0 && (
                          <span className="text-xs bg-orange-50 text-orange-700 px-2 py-0.5 rounded-full font-semibold">−{sub.latePenaltyApplied}% applied</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mb-2">Submitted: {new Date(sub.submittedAt).toLocaleString()}</p>
                      {sub.content && <p className="text-sm text-slate-700 bg-slate-50 rounded-lg p-3 whitespace-pre-wrap line-clamp-4">{sub.content}</p>}
                      {sub.attachmentUrl && (
                        <a href={sub.attachmentUrl} target="_blank" rel="noreferrer" className="inline-block text-xs text-sky-600 underline mt-1">📎 View attachment</a>
                      )}
                      {sub.feedback && <p className="text-xs text-slate-500 italic mt-1">Feedback: "{sub.feedback}"</p>}
                    </div>
                    <button onClick={() => setGradingId(sub.id)}
                      className="flex-shrink-0 text-xs bg-sky-100 text-sky-700 px-3 py-1.5 rounded-lg font-medium hover:bg-sky-200">
                      {sub.marks !== null ? 'Re-grade' : 'Grade'}
                    </button>
                  </div>

                  {gradingId === sub.id && (
                    <form onSubmit={handleSubmit(onGrade)} className="mt-4 border-t border-slate-100 pt-4 flex gap-3 items-end">
                      <div className="flex-1">
                        <input type="number" {...register('marks', { required: true, min: 0, max: assignment?.totalMarks })}
                          placeholder={`Marks (0–${assignment?.totalMarks})`}
                          className="w-full border rounded-lg px-3 py-2 text-sm mb-2" />
                        <input {...register('feedback')} placeholder="Feedback (optional)" className="w-full border rounded-lg px-3 py-2 text-sm" />
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => setGradingId(null)} className="text-xs border rounded-lg px-3 py-2">Cancel</button>
                        <button type="submit" disabled={isSubmitting} className="text-xs bg-emerald-600 text-white px-3 py-2 rounded-lg font-medium disabled:opacity-60">Save</button>
                      </div>
                    </form>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AuthGuard>
  )
}
