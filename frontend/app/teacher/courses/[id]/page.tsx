"use client"

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import AuthGuard from '../../../../components/AuthGuard'
import { apiFetch } from '../../../../lib/api'

type LessonStatus = 'DRAFT' | 'PUBLISHED'
type GradingMode = 'GRADED' | 'PRACTICE' | 'UNGRADED'
type PageType = 'CONTENT' | 'QUESTION' | 'BRANCH'
type QuestionType =
  | 'MCQ_SINGLE'
  | 'MCQ_MULTI'
  | 'TRUE_FALSE'
  | 'SHORT_ANSWER'
  | 'NUMERIC'

interface Lesson {
  id: string
  courseId: string
  title: string
  description: string | null
  order: number
  status: LessonStatus
  gradingMode?: GradingMode
  showProgressBar: boolean
  branchingEnabled: boolean
  totalPoints: number
  passingScore: number | null
  requireVideoWatch?: boolean
  videoWatchPct?: number
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
            <div className="flex items-center justify-between">
              <Link
                href="/teacher/courses"
                className="text-sm text-blue-600 hover:underline"
              >
                ← All Courses
              </Link>
              <Link
                href={`/teacher/courses/${courseId}/attendance`}
                className="text-sm rounded-md border border-sky-200 bg-sky-50 px-3 py-1 text-sky-700 hover:bg-sky-100"
              >
                📋 Attendance
              </Link>
              <Link
                href={`/teacher/courses/${courseId}/engagement`}
                className="text-sm rounded-md border border-violet-200 bg-violet-50 px-3 py-1 text-violet-700 hover:bg-violet-100"
              >
                📊 Engagement
              </Link>
            </div>
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
  const [gradingMode, setGradingMode] = useState<GradingMode>(
    (lesson.gradingMode as GradingMode) || 'GRADED',
  )
  const [showProgressBar, setShowProgressBar] = useState(lesson.showProgressBar)
  const [branchingEnabled, setBranchingEnabled] = useState(lesson.branchingEnabled)
  const [passingScore, setPassingScore] = useState<string>(
    lesson.passingScore != null ? String(lesson.passingScore) : '',
  )
  const [requireVideoWatch, setRequireVideoWatch] = useState<boolean>(
    !!lesson.requireVideoWatch,
  )
  const [videoWatchPct, setVideoWatchPct] = useState<string>(
    String(lesson.videoWatchPct ?? 90),
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
      gradingMode,
      showProgressBar,
      branchingEnabled,
      passingScore: passingScore === '' ? null : Number(passingScore),
      requireVideoWatch,
      videoWatchPct: Math.max(1, Math.min(100, Number(videoWatchPct) || 90)),
    })
  }

  function addPage(pageType: PageType) {
    const title = prompt(`Title for new ${pageType.toLowerCase()} page:`)
    if (!title?.trim()) return
    const baseContent =
      pageType === 'CONTENT'
        ? { body: '', mediaUrl: null, mediaType: null }
        : pageType === 'QUESTION'
          ? {
              questionType: 'MCQ_SINGLE',
              prompt: '',
              points: 1,
              choices: [
                { id: 'c1', text: '' },
                { id: 'c2', text: '' },
              ],
              correctChoiceId: null,
            }
          : {
              prompt: '',
              choices: [
                { id: 'b1', text: '', nextPageId: null },
                { id: 'b2', text: '', nextPageId: null },
              ],
            }
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
              Grading mode
            </label>
            <select
              value={gradingMode}
              onChange={(e) => setGradingMode(e.target.value as GradingMode)}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="GRADED">Graded</option>
              <option value="PRACTICE">Practice</option>
              <option value="UNGRADED">Ungraded</option>
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
          <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
            <input
              type="checkbox"
              checked={requireVideoWatch}
              onChange={(e) => setRequireVideoWatch(e.target.checked)}
            />
            Require watching video before finishing
          </label>
          {requireVideoWatch && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Minimum watched %
              </label>
              <input
                type="number"
                min={1}
                max={100}
                value={videoWatchPct}
                onChange={(e) => setVideoWatchPct(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
              />
              <p className="mt-1 text-[11px] text-slate-500">
                Tracked for uploaded videos (HTML5). YouTube/Vimeo embeds cannot be
                tracked automatically.
              </p>
            </div>
          )}
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
                allPages={pages}
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
  allPages,
  onSave,
  onDelete,
  saving,
}: {
  page: LessonPage
  allPages: LessonPage[]
  onSave: (body: any) => void
  onDelete: () => void
  saving: boolean
}) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(page.title)
  const [content, setContent] = useState<any>(() => normalizeContent(page))

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
        <div className="space-y-3 border-t border-slate-100 px-3 py-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>

          {page.pageType === 'CONTENT' && (
            <ContentEditor value={content} onChange={setContent} />
          )}
          {page.pageType === 'QUESTION' && (
            <QuestionEditor value={content} onChange={setContent} />
          )}
          {page.pageType === 'BRANCH' && (
            <BranchEditor
              value={content}
              onChange={setContent}
              otherPages={allPages.filter((p) => p.id !== page.id)}
            />
          )}

          <div className="flex justify-end">
            <button
              disabled={saving}
              onClick={() => onSave({ title: title.trim() || page.title, content })}
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

// ─── Per-type editors ─────────────────────────────────────────────────

function normalizeContent(page: LessonPage): any {
  const c =
    typeof page.content === 'object' && page.content !== null
      ? { ...page.content }
      : {}
  if (page.pageType === 'CONTENT') {
    return {
      body: typeof c.body === 'string' ? c.body : '',
      mediaUrl: c.mediaUrl ?? null,
      mediaType: c.mediaType ?? null,
    }
  }
  if (page.pageType === 'QUESTION') {
    const qt = String(c.questionType || 'MCQ_SINGLE').toUpperCase()
    const allowed = ['MCQ_SINGLE', 'MCQ_MULTI', 'TRUE_FALSE', 'SHORT_ANSWER', 'NUMERIC']
    const questionType = allowed.includes(qt) ? qt : 'MCQ_SINGLE'
    return {
      questionType,
      prompt: typeof c.prompt === 'string' ? c.prompt : '',
      explanation: c.explanation ?? '',
      points: Number.isFinite(Number(c.points)) ? Number(c.points) : 1,
      choices: Array.isArray(c.choices)
        ? c.choices.map((ch: any, i: number) => ({
            id: String(ch?.id ?? `c${i + 1}`),
            text: String(ch?.text ?? ''),
          }))
        : [
            { id: 'c1', text: '' },
            { id: 'c2', text: '' },
          ],
      correctChoiceId: c.correctChoiceId ?? null,
      correctChoiceIds: Array.isArray(c.correctChoiceIds)
        ? c.correctChoiceIds.map((s: any) => String(s))
        : [],
      correctAnswer: !!c.correctAnswer,
      acceptedAnswers: Array.isArray(c.acceptedAnswers)
        ? c.acceptedAnswers.map((s: any) => String(s))
        : [],
      caseSensitive: !!c.caseSensitive,
      correctValue: Number.isFinite(Number(c.correctValue)) ? Number(c.correctValue) : 0,
      tolerance: Number.isFinite(Number(c.tolerance)) ? Number(c.tolerance) : 0,
    }
  }
  // BRANCH
  return {
    prompt: typeof c.prompt === 'string' ? c.prompt : '',
    choices: Array.isArray(c.choices) && c.choices.length > 0
      ? c.choices.map((ch: any, i: number) => ({
          id: String(ch?.id ?? `b${i + 1}`),
          text: String(ch?.text ?? ''),
          nextPageId: ch?.nextPageId ?? null,
        }))
      : [
          { id: 'b1', text: '', nextPageId: null },
          { id: 'b2', text: '', nextPageId: null },
        ],
  }
}

function ContentEditor({
  value,
  onChange,
}: {
  value: any
  onChange: (v: any) => void
}) {
  return (
    <div className="space-y-2">
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Body</label>
        <textarea
          value={value.body ?? ''}
          onChange={(e) => onChange({ ...value, body: e.target.value })}
          rows={6}
          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          placeholder="Lesson content (plain text or markdown)…"
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-[1fr_140px]">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            Media URL (optional)
          </label>
          <input
            value={value.mediaUrl ?? ''}
            onChange={(e) =>
              onChange({ ...value, mediaUrl: e.target.value || null })
            }
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            placeholder="https://…"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            Media type
          </label>
          <select
            value={value.mediaType ?? ''}
            onChange={(e) =>
              onChange({ ...value, mediaType: e.target.value || null })
            }
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">—</option>
            <option value="image">Image</option>
            <option value="video">Video</option>
            <option value="embed">Embed</option>
          </select>
        </div>
      </div>
    </div>
  )
}

function QuestionEditor({
  value,
  onChange,
}: {
  value: any
  onChange: (v: any) => void
}) {
  const qt: QuestionType = value.questionType

  function updateChoice(idx: number, patch: Partial<{ text: string }>) {
    const choices = [...(value.choices || [])]
    choices[idx] = { ...choices[idx], ...patch }
    onChange({ ...value, choices })
  }
  function addChoice() {
    const choices = [...(value.choices || [])]
    const id = `c${choices.length + 1}_${Math.random().toString(36).slice(2, 6)}`
    choices.push({ id, text: '' })
    onChange({ ...value, choices })
  }
  function removeChoice(idx: number) {
    const choices = [...(value.choices || [])]
    const [removed] = choices.splice(idx, 1)
    const next: any = { ...value, choices }
    if (next.correctChoiceId === removed?.id) next.correctChoiceId = null
    if (Array.isArray(next.correctChoiceIds)) {
      next.correctChoiceIds = next.correctChoiceIds.filter(
        (id: string) => id !== removed?.id,
      )
    }
    onChange(next)
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_120px]">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            Question type
          </label>
          <select
            value={qt}
            onChange={(e) => onChange({ ...value, questionType: e.target.value })}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="MCQ_SINGLE">Multiple choice (single)</option>
            <option value="MCQ_MULTI">Multiple choice (multi)</option>
            <option value="TRUE_FALSE">True / False</option>
            <option value="SHORT_ANSWER">Short answer</option>
            <option value="NUMERIC">Numeric</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Points</label>
          <input
            type="number"
            min={0}
            value={value.points ?? 1}
            onChange={(e) => onChange({ ...value, points: Number(e.target.value) })}
            className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Prompt</label>
        <textarea
          value={value.prompt ?? ''}
          onChange={(e) => onChange({ ...value, prompt: e.target.value })}
          rows={2}
          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
      </div>

      {(qt === 'MCQ_SINGLE' || qt === 'MCQ_MULTI') && (
        <div className="space-y-1">
          <label className="block text-xs font-medium text-slate-600">Choices</label>
          {(value.choices || []).map((ch: any, idx: number) => {
            const isCorrect =
              qt === 'MCQ_SINGLE'
                ? value.correctChoiceId === ch.id
                : Array.isArray(value.correctChoiceIds) &&
                  value.correctChoiceIds.includes(ch.id)
            return (
              <div key={ch.id} className="flex items-center gap-2">
                <input
                  type={qt === 'MCQ_SINGLE' ? 'radio' : 'checkbox'}
                  name="correct"
                  checked={isCorrect}
                  onChange={() => {
                    if (qt === 'MCQ_SINGLE') {
                      onChange({ ...value, correctChoiceId: ch.id })
                    } else {
                      const set = new Set<string>(value.correctChoiceIds || [])
                      if (set.has(ch.id)) set.delete(ch.id)
                      else set.add(ch.id)
                      onChange({ ...value, correctChoiceIds: Array.from(set) })
                    }
                  }}
                />
                <input
                  value={ch.text}
                  onChange={(e) => updateChoice(idx, { text: e.target.value })}
                  placeholder={`Choice ${idx + 1}`}
                  className="flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                />
                <button
                  type="button"
                  onClick={() => removeChoice(idx)}
                  className="rounded px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
                >
                  ✕
                </button>
              </div>
            )
          })}
          <button
            type="button"
            onClick={addChoice}
            className="mt-1 rounded-md border border-dashed border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
          >
            + Add choice
          </button>
          <p className="text-[11px] text-slate-500">
            {qt === 'MCQ_SINGLE'
              ? 'Tick the single correct choice.'
              : 'Tick every correct choice (all required, no extras).'}
          </p>
        </div>
      )}

      {qt === 'TRUE_FALSE' && (
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            Correct answer
          </label>
          <div className="flex gap-3 text-sm">
            <label className="flex items-center gap-1">
              <input
                type="radio"
                checked={value.correctAnswer === true}
                onChange={() => onChange({ ...value, correctAnswer: true })}
              />
              True
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                checked={value.correctAnswer === false}
                onChange={() => onChange({ ...value, correctAnswer: false })}
              />
              False
            </label>
          </div>
        </div>
      )}

      {qt === 'SHORT_ANSWER' && (
        <div className="space-y-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Accepted answers (one per line)
            </label>
            <textarea
              value={(value.acceptedAnswers || []).join('\n')}
              onChange={(e) =>
                onChange({
                  ...value,
                  acceptedAnswers: e.target.value
                    .split('\n')
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
              rows={3}
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={!!value.caseSensitive}
              onChange={(e) => onChange({ ...value, caseSensitive: e.target.checked })}
            />
            Case sensitive
          </label>
        </div>
      )}

      {qt === 'NUMERIC' && (
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Correct value
            </label>
            <input
              type="number"
              value={value.correctValue ?? 0}
              onChange={(e) =>
                onChange({ ...value, correctValue: Number(e.target.value) })
              }
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Tolerance (±)
            </label>
            <input
              type="number"
              min={0}
              value={value.tolerance ?? 0}
              onChange={(e) =>
                onChange({ ...value, tolerance: Number(e.target.value) })
              }
              className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
        </div>
      )}

      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">
          Explanation (shown after answering)
        </label>
        <textarea
          value={value.explanation ?? ''}
          onChange={(e) => onChange({ ...value, explanation: e.target.value })}
          rows={2}
          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
      </div>
    </div>
  )
}

function BranchEditor({
  value,
  onChange,
  otherPages,
}: {
  value: any
  onChange: (v: any) => void
  otherPages: LessonPage[]
}) {
  function updateChoice(idx: number, patch: Partial<{ text: string; nextPageId: string | null }>) {
    const choices = [...(value.choices || [])]
    choices[idx] = { ...choices[idx], ...patch }
    onChange({ ...value, choices })
  }
  function addChoice() {
    const choices = [...(value.choices || [])]
    const id = `b${choices.length + 1}_${Math.random().toString(36).slice(2, 6)}`
    choices.push({ id, text: '', nextPageId: null })
    onChange({ ...value, choices })
  }
  function removeChoice(idx: number) {
    const choices = [...(value.choices || [])]
    choices.splice(idx, 1)
    onChange({ ...value, choices })
  }

  return (
    <div className="space-y-2">
      <div>
        <label className="mb-1 block text-xs font-medium text-slate-600">Prompt</label>
        <textarea
          value={value.prompt ?? ''}
          onChange={(e) => onChange({ ...value, prompt: e.target.value })}
          rows={2}
          className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
        />
      </div>
      <label className="block text-xs font-medium text-slate-600">
        Choices → next page
      </label>
      {(value.choices || []).map((ch: any, idx: number) => (
        <div key={ch.id} className="grid gap-2 sm:grid-cols-[1fr_220px_auto]">
          <input
            value={ch.text}
            onChange={(e) => updateChoice(idx, { text: e.target.value })}
            placeholder={`Choice ${idx + 1}`}
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
          <select
            value={ch.nextPageId ?? ''}
            onChange={(e) =>
              updateChoice(idx, { nextPageId: e.target.value || null })
            }
            className="rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          >
            <option value="">— next in order —</option>
            {otherPages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.order + 1}. {p.title}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => removeChoice(idx)}
            className="rounded px-2 py-1 text-xs text-rose-600 hover:bg-rose-50"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addChoice}
        className="rounded-md border border-dashed border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
      >
        + Add choice
      </button>
    </div>
  )
}
