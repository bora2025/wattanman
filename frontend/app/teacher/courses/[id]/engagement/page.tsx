'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import AuthGuard from '../../../../../components/AuthGuard'
import { apiFetch } from '../../../../../lib/api'

interface LessonRow {
  lessonId: string
  opened: boolean
  openCount: number
  lastOpenedAt: string | null
  watchedSeconds: number
  videoDurationSec: number | null
  videoPct: number
  videoCompleted: boolean
  attemptStatus: string | null
  attemptScore: number | null
  attemptMaxScore: number | null
  attemptPassed: boolean | null
}

interface StudentRow {
  studentId: string
  studentNumber: string | null
  name: string
  email: string
  progressPct: number
  lessonsOpened: number
  lessonsCompleted: number
  sessionsAttended: number
  attendancePct: number
  lessons: LessonRow[]
}

interface Report {
  course: { id: string; sessionCount: number; lessonCount: number }
  lessons: Array<{
    id: string
    title: string
    requireVideoWatch: boolean
    videoWatchPct: number
  }>
  students: StudentRow[]
}

function fmtMin(seconds: number): string {
  if (!seconds) return '0m'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return m > 0 ? `${m}m ${s}s` : `${s}s`
}

export default function CourseEngagementPage() {
  const params = useParams<{ id: string }>()
  const courseId = params?.id as string

  const { data, isLoading, error } = useQuery({
    queryKey: ['course-engagement', courseId],
    enabled: !!courseId,
    queryFn: async () => {
      const r = await apiFetch(`/api/courses/${courseId}/engagement-report`)
      if (!r.ok) throw new Error('Failed to load engagement report')
      return r.json() as Promise<Report>
    },
  })

  return (
    <AuthGuard allowedRoles={['TEACHER', 'ADMIN', 'SUPER_ADMIN']}>
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 py-6 space-y-4">
          <div className="flex items-center justify-between">
            <Link
              href={`/teacher/courses/${courseId}`}
              className="text-sm text-blue-600 hover:underline"
            >
              ← Back to course
            </Link>
          </div>

          <h1 className="text-2xl font-bold text-slate-800">
            Lesson engagement
          </h1>

          {isLoading && (
            <div className="rounded-md border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
              Loading…
            </div>
          )}
          {error && (
            <div className="rounded-md border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
              {(error as Error).message}
            </div>
          )}

          {data && (
            <>
              <div className="rounded-md border border-slate-200 bg-white p-4 text-sm text-slate-600 flex flex-wrap gap-x-6 gap-y-1">
                <span>
                  Published lessons:{' '}
                  <strong>{data.course.lessonCount}</strong>
                </span>
                <span>
                  Sessions: <strong>{data.course.sessionCount}</strong>
                </span>
                <span>
                  Students: <strong>{data.students.length}</strong>
                </span>
              </div>

              {/* Summary table */}
              <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2 text-left">Student</th>
                      <th className="px-3 py-2 text-left">Progress</th>
                      <th className="px-3 py-2 text-left">Lessons opened</th>
                      <th className="px-3 py-2 text-left">Lessons completed</th>
                      <th className="px-3 py-2 text-left">Attendance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.students.length === 0 && (
                      <tr>
                        <td
                          className="px-3 py-6 text-center text-slate-500"
                          colSpan={5}
                        >
                          No enrolled students yet.
                        </td>
                      </tr>
                    )}
                    {data.students.map((s) => (
                      <tr key={s.studentId} className="border-t border-slate-100">
                        <td className="px-3 py-2">
                          <div className="font-medium text-slate-800">{s.name}</div>
                          <div className="text-xs text-slate-500">
                            {s.studentNumber || s.email}
                          </div>
                        </td>
                        <td className="px-3 py-2">{Math.round(s.progressPct)}%</td>
                        <td className="px-3 py-2">
                          {s.lessonsOpened} / {data.course.lessonCount}
                        </td>
                        <td className="px-3 py-2">
                          {s.lessonsCompleted} / {data.course.lessonCount}
                        </td>
                        <td className="px-3 py-2">
                          {s.sessionsAttended} / {data.course.sessionCount} (
                          {s.attendancePct}%)
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Per-lesson matrix */}
              {data.students.length > 0 && data.lessons.length > 0 && (
                <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
                  <table className="min-w-full text-xs">
                    <thead className="bg-slate-50 uppercase text-slate-500">
                      <tr>
                        <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-left">
                          Student
                        </th>
                        {data.lessons.map((l) => (
                          <th
                            key={l.id}
                            className="px-2 py-2 text-left min-w-[140px]"
                          >
                            {l.title}
                            {l.requireVideoWatch && (
                              <span className="ml-1 text-[10px] text-amber-600">
                                ▶ {l.videoWatchPct}%
                              </span>
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.students.map((s) => (
                        <tr key={s.studentId} className="border-t border-slate-100">
                          <td className="sticky left-0 z-10 bg-white px-3 py-2 font-medium text-slate-800">
                            {s.name}
                          </td>
                          {s.lessons.map((row) => (
                            <td key={row.lessonId} className="px-2 py-2">
                              {!row.opened ? (
                                <span className="text-slate-400">—</span>
                              ) : (
                                <div className="space-y-0.5">
                                  <div className="text-slate-700">
                                    {row.attemptStatus === 'COMPLETED' ? (
                                      <span className="text-emerald-700">
                                        ✓ Done
                                        {row.attemptScore != null &&
                                        row.attemptMaxScore
                                          ? ` (${row.attemptScore}/${row.attemptMaxScore})`
                                          : ''}
                                      </span>
                                    ) : (
                                      <span className="text-sky-700">
                                        In progress
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-slate-500">
                                    Opens: {row.openCount}
                                  </div>
                                  {row.videoDurationSec ? (
                                    <div
                                      className={
                                        'text-[10px] ' +
                                        (row.videoCompleted
                                          ? 'text-emerald-600'
                                          : 'text-amber-600')
                                      }
                                    >
                                      Video: {row.videoPct}% ({fmtMin(row.watchedSeconds)})
                                    </div>
                                  ) : null}
                                </div>
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </AuthGuard>
  )
}
