"use client"

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import Link from 'next/link'
import AuthGuard from '../../../components/AuthGuard'
import Sidebar from '../../../components/Sidebar'
import { apiFetch } from '../../../lib/api'

const studentNav = [
  { label: 'nav.dashboard', href: '/student', icon: 'dashboard' },
  { label: 'Assignments', href: '/student/assignments', icon: 'book' },
  { label: 'My Scores', href: '/student/scores', icon: 'chart' },
  { label: 'Exams', href: '/student/exams', icon: 'clipboard' },
  { label: 'Messages', href: '/student/messages', icon: 'clipboard' },
]

interface Exam { id: string; title: string; duration: number; totalMarks: number; passMark: number; status: string; class: { name: string } | null; attempt: { id: string; status: string; score: number | null; submittedAt: string | null } | null }

const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-600',
  PUBLISHED: 'bg-sky-100 text-sky-700',
  ACTIVE: 'bg-emerald-100 text-emerald-700',
  COMPLETED: 'bg-purple-100 text-purple-700',
}

export default function StudentExamsPage() {
  const { data: exams = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['student-exams'],
    queryFn: async () => { const r = await apiFetch('/api/exams/student/my-exams'); if (!r.ok) throw new Error(); return r.json() as Promise<Exam[]> },
  })

  return (
    <AuthGuard>
      <div className="flex min-h-screen bg-slate-50">
        <Sidebar title="Student" subtitle="Portal" navItems={studentNav} accentColor="emerald" />
        <main className="flex-1 p-6">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-2xl font-bold text-slate-800 mb-6">📝 My Exams</h1>

          {isLoading ? (
            <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="bg-white h-20 rounded-xl animate-pulse" />)}</div>
          ) : isError ? (
            <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
              <p className="text-red-600 mb-2">Failed to load exams</p>
              <button onClick={() => refetch()} className="text-sm text-red-500 underline">Retry</button>
            </div>
          ) : exams.length === 0 ? (
            <div className="bg-white rounded-xl p-12 text-center shadow-sm">
              <p className="text-4xl mb-3">📝</p>
              <p className="text-slate-400">No exams available</p>
            </div>
          ) : (
            <div className="space-y-3">
              {exams.map(exam => {
                const hasAttempt = !!exam.attempt
                const isGraded = exam.attempt?.status === 'GRADED'
                const canTake = exam.status === 'ACTIVE' && !hasAttempt
                return (
                  <div key={exam.id} className="bg-white rounded-xl shadow-sm p-4 border border-slate-100 flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold text-slate-800">{exam.title}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${STATUS_COLOR[exam.status]}`}>{exam.status}</span>
                      </div>
                      <p className="text-xs text-slate-500">{exam.class?.name ?? 'General'} · {exam.duration} min · Pass: {exam.passMark}/{exam.totalMarks}</p>
                      {isGraded && exam.attempt && (
                        <p className={`text-xs font-semibold mt-1 ${(exam.attempt.score ?? 0) >= exam.passMark ? 'text-emerald-600' : 'text-red-600'}`}>
                          Score: {exam.attempt.score}/{exam.totalMarks} — {(exam.attempt.score ?? 0) >= exam.passMark ? 'PASSED' : 'FAILED'}
                        </p>
                      )}
                      {hasAttempt && !isGraded && <p className="text-xs text-amber-600 mt-1">Submitted · Awaiting result</p>}
                    </div>
                    <div className="flex-shrink-0">
                      {canTake && (
                        <Link href={`/student/exams/${exam.id}`}
                          className="bg-sky-600 text-white px-4 py-2 rounded-lg text-xs font-medium hover:bg-sky-700">
                          Start Exam
                        </Link>
                      )}
                      {isGraded && <span className="text-xs text-emerald-600 font-semibold">✓ Completed</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </main>
    </div>
    </AuthGuard>
  )
}
