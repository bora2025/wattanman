"use client"

import { useQuery } from '@tanstack/react-query'
import AuthGuard from '../../../components/AuthGuard'
import Sidebar from '../../../components/Sidebar'
import { apiFetch } from '../../../lib/api'

const studentNav = [
  { label: 'nav.dashboard', href: '/student', icon: 'dashboard' },
  { label: 'Assignments', href: '/student/assignments', icon: 'book' },
  { label: 'My Scores', href: '/student/scores', icon: 'chart' },
  { label: 'Exams', href: '/student/exams', icon: 'clipboard' },
]

interface Grade { id: string; marks: number; assignment: { title: string; totalMarks: number; class: { name: string; subject: string } } }

export default function StudentScoresPage() {
  const { data: grades = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['student-grades'],
    queryFn: async () => {
      const r = await apiFetch('/api/assignments/student/my-assignments')
      if (!r.ok) throw new Error()
      const data = await r.json() as any[]
      return data.filter(a => a.submission?.marks !== null).map(a => ({
        id: a.id, marks: a.submission.marks, assignment: { title: a.title, totalMarks: a.totalMarks, class: a.class }
      })) as Grade[]
    },
  })

  const avg = grades.length
    ? Math.round(grades.reduce((s, g) => s + (g.marks / g.assignment.totalMarks) * 100, 0) / grades.length)
    : null

  const bySubject = grades.reduce<Record<string, Grade[]>>((acc, g) => {
    const key = g.assignment.class.subject
    if (!acc[key]) acc[key] = []
    acc[key].push(g)
    return acc
  }, {})

  return (
    <AuthGuard>
      <div className="flex min-h-screen bg-slate-50">
        <Sidebar title="Student" subtitle="Portal" navItems={studentNav} accentColor="emerald" />
        <main className="flex-1 p-6">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-2xl font-bold text-slate-800 mb-6">📊 My Scores</h1>

          {isLoading ? (
            <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="bg-white h-16 rounded-xl animate-pulse" />)}</div>
          ) : isError ? (
            <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
              <p className="text-red-600 mb-2">Failed to load scores</p>
              <button onClick={() => refetch()} className="text-sm text-red-500 underline">Retry</button>
            </div>
          ) : grades.length === 0 ? (
            <div className="bg-white rounded-xl p-12 text-center shadow-sm">
              <p className="text-4xl mb-3">📊</p>
              <p className="text-slate-400">No graded assignments yet</p>
            </div>
          ) : (
            <>
              {/* Average card */}
              {avg !== null && (
                <div className="bg-white rounded-xl shadow-sm p-5 mb-6 flex items-center gap-4 border border-slate-100">
                  <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold text-white ${avg >= 70 ? 'bg-emerald-500' : avg >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}>
                    {avg}
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 text-lg">Overall: {avg}%</p>
                    <p className="text-sm text-slate-400">{grades.length} graded assignment(s) across {Object.keys(bySubject).length} subject(s)</p>
                  </div>
                </div>
              )}

              {/* By subject */}
              {Object.entries(bySubject).map(([subject, subjectGrades]) => {
                const subAvg = Math.round(subjectGrades.reduce((s, g) => s + (g.marks / g.assignment.totalMarks) * 100, 0) / subjectGrades.length)
                return (
                  <div key={subject} className="bg-white rounded-xl shadow-sm p-4 mb-4 border border-slate-100">
                    <div className="flex items-center justify-between mb-3">
                      <p className="font-semibold text-slate-700">{subject}</p>
                      <span className={`text-sm font-bold ${subAvg >= 70 ? 'text-emerald-600' : subAvg >= 50 ? 'text-amber-600' : 'text-red-600'}`}>{subAvg}%</span>
                    </div>
                    <div className="space-y-2">
                      {subjectGrades.map(g => {
                        const pct = Math.round((g.marks / g.assignment.totalMarks) * 100)
                        return (
                          <div key={g.id} className="flex items-center gap-3">
                            <p className="text-xs text-slate-600 w-40 truncate">{g.assignment.title}</p>
                            <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                              <div className={`h-1.5 rounded-full ${pct >= 70 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-400' : 'bg-red-500'}`} style={{ width: `${pct}%` }} />
                            </div>
                            <p className="text-xs font-semibold text-slate-700 w-14 text-right">{g.marks}/{g.assignment.totalMarks}</p>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </>
          )}
        </div>
      </main>
    </div>
    </AuthGuard>
  )
}
