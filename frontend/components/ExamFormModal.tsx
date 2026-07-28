"use client"

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { apiFetch } from '../lib/api'
import { ExamQuestionsEditor, defaultQuestion, type ExamQuestionDraft } from './ExamQuestionsEditor'

export interface ExamClassItem { id: string; name: string; subject?: string }

export interface ExamEditInitialData {
  title: string; description: string; classId: string
  duration: number; totalMarks: number; passMark: number; maxAttempts: number
  questions: ExamQuestionDraft[]
}

/** Shared create/edit exam modal — previously duplicated near-verbatim between
 * admin/exams/page.tsx and teacher/exams/page.tsx. Behavior (fields, validation,
 * submit endpoint/method) is unchanged; only the presentation was cleaned up
 * with labeled/grouped fields instead of placeholder-only inputs. */
export default function ExamFormModal({ classes, examId, initialData, onClose, onSuccess }: {
  classes: ExamClassItem[]
  examId?: string
  initialData?: ExamEditInitialData
  onClose: () => void
  onSuccess: () => void
}) {
  const { register, handleSubmit, watch, formState: { isSubmitting } } = useForm({
    defaultValues: initialData
      ? { title: initialData.title, description: initialData.description, classId: initialData.classId, duration: initialData.duration, totalMarks: initialData.totalMarks, passMark: initialData.passMark, allowRetake: initialData.maxAttempts !== 1, maxAttempts: initialData.maxAttempts }
      : { title: '', description: '', classId: '', duration: 60, totalMarks: 100, passMark: 50, allowRetake: false, maxAttempts: 1 },
  })
  const watchedDuration = Number(watch('duration')) || undefined
  const watchAllowRetake = watch('allowRetake')
  const [questions, setQuestions] = useState<ExamQuestionDraft[]>(initialData?.questions?.length ? initialData.questions : [defaultQuestion()])
  const [formError, setFormError] = useState<string | null>(null)

  const onSubmit = async (data: any) => {
    setFormError(null)
    if (!data.allowRetake) data.maxAttempts = 1
    delete data.allowRetake
    const url = examId ? `/api/exams/${examId}` : '/api/exams'
    const method = examId ? 'PUT' : 'POST'
    const body = examId ? { ...data, questions } : { ...data, status: 'DRAFT', questions }
    const res = await apiFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      onSuccess()
    } else {
      const e = await res.json().catch(() => ({}))
      setFormError(Array.isArray(e?.message) ? e.message.join(', ') : (e?.message || `Failed to ${examId ? 'update' : 'create'} exam`))
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-3 sm:p-6">
      {/* Fixed-height flex column so the title bar and Cancel/Save stay put —
          only the fields+questions area scrolls. A tall question list used to
          scroll the whole modal as one block, which carried the header and
          the save button out of view along with it. */}
      <div className="bg-white rounded-2xl w-full max-w-5xl h-full max-h-[92vh] shadow-xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-sky-50 to-white flex-shrink-0">
          <h2 className="text-lg font-bold text-slate-800">{examId ? '✏️ Edit Exam' : '📝 Create Exam'}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 text-sm">✕</button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex-1 flex flex-col overflow-hidden min-h-0">
          <div className="flex-1 overflow-y-auto p-6 space-y-5 min-h-0">
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-slate-500">Exam title *
                <input {...register('title', { required: true })} placeholder="e.g. Midterm — Algebra" className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
              </label>
              <label className="block text-xs font-semibold text-slate-500">Description
                <input {...register('description')} placeholder="Optional" className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
              </label>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <label className="block text-xs font-semibold text-slate-500 col-span-2 sm:col-span-4">Class
                <select {...register('classId')} className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-300">
                  <option value="">All classes</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
              <label className="block text-xs font-semibold text-slate-500">Duration (min)
                <input type="number" {...register('duration', { valueAsNumber: true })} className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
              </label>
              <label className="block text-xs font-semibold text-slate-500">Total marks
                <input type="number" {...register('totalMarks', { valueAsNumber: true })} className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
              </label>
              <label className="block text-xs font-semibold text-slate-500">Pass mark
                <input type="number" {...register('passMark', { valueAsNumber: true })} className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
              </label>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 grid grid-cols-2 gap-3 items-end">
              <label className="text-xs font-semibold text-slate-600 flex items-center gap-2 col-span-2">
                <input type="checkbox" {...register('allowRetake')} className="h-4 w-4" />
                <span>Allow students to <strong>retake</strong> this exam</span>
              </label>
              {watchAllowRetake ? (
                <label className="block text-xs font-semibold text-slate-500 col-span-2">Max attempts
                  <input type="number" min={0} max={50} placeholder="0 = unlimited" {...register('maxAttempts', { valueAsNumber: true })} className="mt-1 w-full border border-slate-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300" />
                </label>
              ) : (
                <span className="text-[11px] text-slate-500 col-span-2">Students get a single attempt.</span>
              )}
            </div>

            <div className="border-t border-slate-100 pt-4">
              <ExamQuestionsEditor questions={questions} onChange={setQuestions} />
            </div>
          </div>

          <div className="flex-shrink-0 border-t border-slate-100 px-6 py-4 bg-white space-y-2">
            {formError && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-3 py-2">{formError}</div>}
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={onClose} className="px-4 py-2.5 text-sm font-medium border border-slate-300 rounded-xl text-slate-600 hover:bg-slate-50">Cancel</button>
              <button type="submit" disabled={isSubmitting}
                className="px-4 py-2.5 text-sm bg-sky-600 text-white rounded-xl font-semibold hover:bg-sky-700 disabled:opacity-60 shadow-sm">
                {isSubmitting ? 'Saving…' : (examId ? 'Save Changes' : 'Create Exam')}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
