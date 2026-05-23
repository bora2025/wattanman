"use client"

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import AuthGuard from '../../../../components/AuthGuard'
import { apiFetch } from '../../../../lib/api'

type LessonStatus = 'DRAFT' | 'PUBLISHED'
type PageType = 'CONTENT' | 'QUESTION' | 'BRANCH'

interface Lesson {
  id: string
  courseId: string
  title: string
  description: string | null
  order: number
  status: LessonStatus
  showProgressBar: boolean
  branchingEnabled: boolean
  totalPoints: number
  passingScore: number | null
  publishedAt: string | null
  _count: { pages: number }
}

interface LessonPage {
  id: string
  lessonId: string
  title: string
  pageType: PageType
  order: number
  content: any
  nextPageId: string | null
}

interface Course {
  id: string
  title: string
  description: string | null
  status: string
  enrollmentOpen: boolean
  class: { id: string; name: string; subject: string | null }
  createdBy: { id: string; name: string }
  lessons: Lesson[]
  _count: { enrollments: number }
}

const STATUS_BADGES: Record<string, string> = {
  DRAFT: 'bg-slate-200 text-slate-700',
  PUBLISHED: 'bg-emerald-100 text-emerald-700',
  ENROLLMENT: 'bg-sky-100 text-sky-700',
  ACTIVE: 'bg-violet-100 text-violet-700',
  COMPLETED: 'bg-amber-100 text-amber-700',
  ARCHIVED: 'bg-rose-100 text-rose-700',
}

const PAGE_TYPE_LABEL: Record<PageType, string> = {
  CONTENT: '📄 Content',
  QUESTION: '❓ Question',
  BRANCH: '🔀 Branch',
}

export default function CourseDetailPage() {
  const params = useParams<{ id: string }>()
  const courseId = params?.id as string
  const qc = useQueryClient()
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null)
  const [showNewLesson, setShowNewLesson] = useState(false)

  const { data: course, isLoading } = useQuery({
    queryKey: ['course', courseId],
    queryFn: async () => {
      const r = await apiFetch(`/api/courses/${courseId}`)
      if (!r.ok) throw new Error('Failed to load course')
      return r.json() as Promise<Course>
    },
    enabled: !!courseId,
  })

  const selectedLesson = useMemo(
    () => course?.lessons.find((l) => l.id === selectedLessonId) || null,
    [course, selectedLessonId],
  )

  const createLessonMutation = useMutation({
    mutationFn: async (body: { title: string; description?: string }) => {
      const r = await apiFetch(`/api/courses/${courseId}/lessons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({ message: `HTTP ${r.status}` }))
        throw new Error(err?.message || 'Failed to create lesson')
      }
      return r.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['course', courseId] })
      setShowNewLesson(false)
    },
    onError: (e: any) => alert(e?.message || 'Failed to create lesson'),
  })

  const updateLessonMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: any }) => {
      const r = await apiFetch(`/api/courses/lessons/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({ message: `HTTP ${r.status}` }))
        throw new Error(err?.message || 'Failed to update lesson')
      }
      return r.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['course', courseId] }),
    onError: (e: any) => alert(e?.message || 'Failed to update lesson'),
  })

  const deleteLessonMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiFetch(`/api/courses/lessons/${id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error('Failed to delete lesson')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['course', courseId] })
      setSelectedLessonId(null)
    },
  })

  if (isLoading) {
    return (
      <AuthGuard requiredRole="TEACHER">
        <div className="p-8 text-center text-slate-500">Loading course…</div>
      </AuthGuard>
    )
  }
  if (!course) {
    return (
      <AuthGuard requiredRole="TEACHER">
        <div className="p-8 text-center text-rose-600">Course not found.</div>
      </AuthGuard>
    )
  }

  return (
    <AuthGuard requiredRole="TEACHER">
      <div className="min-h-screen bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 py-6">
          {/* Header */}
          <div className="mb-6">
            <Link
              href="/teacher/courses"
              className="text-sm text-blue-600 hover:underline"
            >
              ← All Courses
            </Link>
            <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold text-slate-800">{course.title}</h1>
                  <span
                    className={`rounded-full px-2 py-1 text-[11px] font-medium ${STATUS_BADGES[course.status] || 'bg-slate-100 text-slate-700'}`}
                  >
                    {course.status}
                  </span>
                </div>
                <p className="text-sm text-slate-500">
                  {course.class.name}
                  {course.class.subject ? ` • ${course.class.subject}` : ''} • by{' '}
                  {course.createdBy.name}
                </p>
                {course.description && (
                  <p className="mt-2 max-w-2xl text-sm text-slate-700">
                    {course.description}
                  </p>
                )}
              </div>
              <div className="text-right text-sm text-slate-600">
                <div>📚 {course.lessons.length} lessons</div>
                <div>👥 {course._count.enrollments} enrolled</div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
            {/* Lesson list */}
            <div className="rounded-xl bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-700">Lessons</h2>
                <button
                  onClick={() => setShowNewLesson(true)}
                  className="rounded-md bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-700"
                >
                  + Add
                </button>
              </div>

              {showNewLesson && (
                <NewLessonForm
                  onCancel={() => setShowNewLesson(false)}
                  onSubmit={(data) => createLessonMutation.mutate(data)}
                  pending={createLessonMutation.isPending}
                />
              )}

              {course.lessons.length === 0 ? (
                <div className="rounded-md bg-slate-50 p-4 text-center text-xs text-slate-500">
                  No lessons yet. Add the first one to get started.
                </div>
              ) : (
                <ul className="space-y-1">
                  {course.lessons.map((l) => (
                    <li key={l.id}>
                      <button
                        onClick={() => setSelectedLessonId(l.id)}
                        className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition ${
                          selectedLessonId === l.id
                            ? 'bg-blue-50 ring-1 ring-blue-300'
                            : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="truncate font-medium text-slate-800">
                            {l.order + 1}. {l.title}
                          </div>
                          <div className="text-xs text-slate-500">
                            {l._count.pages} page{l._count.pages === 1 ? '' : 's'}
                          </div>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            l.status === 'PUBLISHED'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {l.status}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Lesson editor */}
            <div className="rounded-xl bg-white p-5 shadow-sm">
              {!selectedLesson ? (
                <div className="flex h-full min-h-[200px] items-center justify-center text-sm text-slate-400">
                  Select a lesson on the left to edit its pages.
                </div>
              ) : (
                <LessonEditor
                  key={selectedLesson.id}
                  lesson={selectedLesson}
                  onSaveLesson={(body) =>
                    updateLessonMutation.mutate({ id: selectedLesson.id, body })
                  }
                  onDeleteLesson={() => {
                    if (
                      confirm(
                        `Delete lesson "${selectedLesson.title}"? All pages inside will be removed.`,
                      )
                    ) {
                      deleteLessonMutation.mutate(selectedLesson.id)
                    }
                  }}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </AuthGuard>
  )
}

// ─── New lesson inline form ───────────────────────────────────────────
function NewLessonForm({
  onSubmit,
  onCancel,
  pending,
}: {
  onSubmit: (data: { title: string; description?: string }) => void
  onCancel: () => void
  pending: boolean
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  return (
    <div className="mb-3 space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Lesson title"
        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Optional description"
        rows={2}
        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
      />
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-white"
        >
          Cancel
        </button>
        <button
          disabled={pending || !title.trim()}
          onClick={() =>
            onSubmit({ title: title.trim(), description: description.trim() || undefined })
          }
          className="rounded-md bg-blue-600 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? 'Adding…' : 'Add Lesson'}
        </button>
      </div>
    </div>
  )
}

// ─── Lesson editor with page CRUD ─────────────────────────────────────
function LessonEditor({
  lesson,
  onSaveLesson,
  onDeleteLesson,
}: {
  lesson: Lesson
  onSaveLesson: (body: any) => void
  onDeleteLesson: () => void
}) {
  const qc = useQueryClient()
  const [title, setTitle] = useState(lesson.title)
  const [description, setDescription] = useState(lesson.description ?? '')
  const [status, setStatus] = useState<LessonStatus>(lesson.status)
  const [showProgressBar, setShowProgressBar] = useState(lesson.showProgressBar)
  const [branchingEnabled, setBranchingEnabled] = useState(lesson.branchingEnabled)
  const [passingScore, setPassingScore] = useState<string>(
    lesson.passingScore != null ? String(lesson.passingScore) : '',
  )

  const { data: pages = [], isLoading: pagesLoading } = useQuery({
    queryKey: ['lesson-pages', lesson.id],
    queryFn: async () => {
      const r = await apiFetch(`/api/courses/lessons/${lesson.id}/pages`)
      if (!r.ok) throw new Error('Failed to load pages')
      return r.json() as Promise<LessonPage[]>
    },
  })

  const createPageMutation = useMutation({
    mutationFn: async (body: any) => {
      const r = await apiFetch(`/api/courses/lessons/${lesson.id}/pages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({ message: `HTTP ${r.status}` }))
        throw new Error(err?.message || 'Failed to create page')
      }
      return r.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lesson-pages', lesson.id] })
      qc.invalidateQueries({ queryKey: ['course', lesson.courseId] })
    },
    onError: (e: any) => alert(e?.message || 'Failed to create page'),
  })

  const updatePageMutation = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: any }) => {
      const r = await apiFetch(`/api/courses/pages/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!r.ok) throw new Error('Failed to update page')
      return r.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lesson-pages', lesson.id] }),
  })

  const deletePageMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await apiFetch(`/api/courses/pages/${id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error('Failed to delete page')
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lesson-pages', lesson.id] })
      qc.invalidateQueries({ queryKey: ['course', lesson.courseId] })
    },
  })

  function saveSettings() {
    onSaveLesson({
      title: title.trim() || lesson.title,
      description: description.trim() || null,
      status,
      showProgressBar,
      branchingEnabled,
      passingScore: passingScore === '' ? null : Number(passingScore),
    })
  }

  function addPage(pageType: PageType) {
    const title = prompt(`Title for new ${pageType.toLowerCase()} page:`)
    if (!title?.trim()) return
    const baseContent =
      pageType === 'CONTENT'
        ? { body: '' }
        : pageType === 'QUESTION'
          ? { questionType: 'MCQ', prompt: '', choices: [] }
          : { rules: [] }
    createPageMutation.mutate({ title: title.trim(), pageType, content: baseContent })
  }

  return (
    <div className="space-y-5">
      {/* Lesson settings */}
      <section>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Lesson settings
        </h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-600">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as LessonStatus)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="DRAFT">Draft</option>
              <option value="PUBLISHED">Published</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Passing score
            </label>
            <input
              type="number"
              min={0}
              value={passingScore}
              onChange={(e) => setPassingScore(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              placeholder="Optional"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={showProgressBar}
              onChange={(e) => setShowProgressBar(e.target.checked)}
            />
            Show progress bar
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={branchingEnabled}
              onChange={(e) => setBranchingEnabled(e.target.checked)}
            />
            Allow branching pages
          </label>
        </div>
        <div className="mt-3 flex justify-between">
          <button
            onClick={onDeleteLesson}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-rose-600 hover:bg-rose-50"
          >
            Delete lesson
          </button>
          <button
            onClick={saveSettings}
            className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Save settings
          </button>
        </div>
      </section>

      <hr className="border-slate-200" />

      {/* Pages */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Pages
          </h3>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => addPage('CONTENT')}
              className="rounded-md bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
            >
              + Content
            </button>
            <button
              onClick={() => addPage('QUESTION')}
              className="rounded-md bg-violet-100 px-3 py-1 text-xs font-medium text-violet-700 hover:bg-violet-200"
            >
              + Question
            </button>
            <button
              onClick={() => addPage('BRANCH')}
              disabled={!branchingEnabled}
              className="rounded-md bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-200 disabled:opacity-40"
              title={branchingEnabled ? '' : 'Enable branching in lesson settings first'}
            >
              + Branch
            </button>
          </div>
        </div>

        {pagesLoading ? (
          <div className="rounded-md bg-slate-50 p-3 text-center text-sm text-slate-500">
            Loading pages…
          </div>
        ) : pages.length === 0 ? (
          <div className="rounded-md bg-slate-50 p-4 text-center text-sm text-slate-500">
            No pages yet. Add a Content, Question or Branch page above.
          </div>
        ) : (
          <ul className="space-y-2">
            {pages.map((p) => (
              <PageRow
                key={p.id}
                page={p}
                onSave={(body) => updatePageMutation.mutate({ id: p.id, body })}
                onDelete={() => {
                  if (confirm(`Delete page "${p.title}"?`)) {
                    deletePageMutation.mutate(p.id)
                  }
                }}
                saving={
                  updatePageMutation.isPending &&
                  updatePageMutation.variables?.id === p.id
                }
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function PageRow({
  page,
  onSave,
  onDelete,
  saving,
}: {
  page: LessonPage
  onSave: (body: any) => void
  onDelete: () => void
  saving: boolean
}) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(page.title)
  const [body, setBody] = useState<string>(() =>
    typeof page.content === 'string'
      ? page.content
      : JSON.stringify(page.content ?? {}, null, 2),
  )

  return (
    <li className="rounded-md border border-slate-200">
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 text-left text-sm font-medium text-slate-800"
        >
          <span>{open ? '▾' : '▸'}</span>
          <span>{PAGE_TYPE_LABEL[page.pageType]}</span>
          <span>{page.title}</span>
        </button>
        <button
          onClick={onDelete}
          className="text-xs font-medium text-rose-600 hover:underline"
        >
          Delete
        </button>
      </div>
      {open && (
        <div className="space-y-2 border-t border-slate-100 px-3 py-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Content (JSON or text)
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={6}
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 font-mono text-xs"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Tip: stored as JSON. For content pages, use{' '}
              <code className="rounded bg-slate-100 px-1">{`{"body": "..."}`}</code>.
            </p>
          </div>
          <div className="flex justify-end">
            <button
              disabled={saving}
              onClick={() => {
                let content: any
                try {
                  content = JSON.parse(body)
                } catch {
                  content = { body }
                }
                onSave({ title: title.trim() || page.title, content })
              }}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save page'}
            </button>
          </div>
        </div>
      )}
    </li>
  )
}
