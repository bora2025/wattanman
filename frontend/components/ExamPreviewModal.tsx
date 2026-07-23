"use client"

import { useMemo, useState } from 'react'
import { QuestionInput } from './ExamQuestionInput'
import { sanitizeForPreview, gradeQuestion, TYPE_LABEL, type ExamQuestionDraft } from '../lib/examQuestionLogic'

/**
 * Lets a teacher/admin try an exam exactly as a student would, before publishing it.
 * Nothing here touches the backend — no attempt is created, nothing is persisted.
 * Correct-answer data is stripped via sanitizeForPreview before it reaches the
 * interactive input, and scoring is computed locally via gradeQuestion, mirroring
 * exactly what the real exam-taking flow and backend grader do.
 */
export default function ExamPreviewModal({ questions, onClose }: { questions: ExamQuestionDraft[]; onClose: () => void }) {
  const [answers, setAnswers] = useState<Record<number, any>>({})
  const [checked, setChecked] = useState(false)

  // Computed once per modal open — re-deriving on every keystroke would reshuffle
  // Sort the Paragraphs / rebuild the Drag the Words word bank mid-interaction.
  const previewData = useMemo(() => questions.map(q => sanitizeForPreview(q.type, q.data)), [questions])

  const totalMarks = questions.reduce((s, q) => s + (q.marks || 0), 0)
  const results = questions.map((q, i) => gradeQuestion(q, answers[i]))
  const autoTotal = results.reduce((s, r) => s + (r.autoGraded ? (r.awarded ?? 0) : 0), 0)
  const hasManual = results.some(r => !r.autoGraded)

  function reset() {
    setAnswers({})
    setChecked(false)
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-xl my-4 flex flex-col max-h-[90vh]">
        <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-800">👁 Exam Preview</h2>
            <p className="text-xs text-amber-600 mt-0.5">Preview mode — nothing here is saved or counted as a real attempt.</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl leading-none flex-shrink-0">✕</button>
        </div>

        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {questions.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No questions to preview yet.</p>
          ) : questions.map((q, i) => {
            const result = checked ? results[i] : null
            const badgeClass = result?.autoGraded
              ? (result.awarded === q.marks ? 'bg-emerald-100 text-emerald-700' : (result.awarded ?? 0) > 0 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700')
              : ''
            const cardClass = result?.autoGraded
              ? (result.awarded === q.marks ? 'border-emerald-200 bg-emerald-50/40' : (result.awarded ?? 0) > 0 ? 'border-amber-200 bg-amber-50/40' : 'border-red-200 bg-red-50/40')
              : 'border-slate-200'
            return (
              <div key={i} className={`rounded-xl border p-4 ${cardClass}`}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <p className="font-semibold text-slate-800 text-sm">
                    Q{i + 1}. {q.text || <span className="text-slate-400 italic font-normal">(no question text yet)</span>}
                    <span className="ml-2 text-xs font-normal text-slate-400">{TYPE_LABEL[q.type]} · {q.marks} mark{q.marks !== 1 ? 's' : ''}</span>
                  </p>
                  {checked && result && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${result.autoGraded ? badgeClass : 'bg-slate-100 text-slate-500'}`}>
                      {result.autoGraded ? `+${Math.round((result.awarded ?? 0) * 100) / 100} / ${q.marks}` : 'Manual grading'}
                    </span>
                  )}
                </div>
                <QuestionInput
                  q={{ id: `preview_${i}`, type: q.type, data: previewData[i] }}
                  value={answers[i]}
                  onChange={v => setAnswers(a => ({ ...a, [i]: v }))}
                />
              </div>
            )
          })}
        </div>

        <div className="p-5 border-t border-slate-100 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm text-slate-600">
            {checked ? (
              <span>
                Auto-graded score: <strong>{Math.round(autoTotal * 100) / 100}</strong> / {totalMarks}
                {hasManual && <span className="text-slate-400"> (some questions need manual grading)</span>}
              </span>
            ) : (
              <span className="text-slate-400">{totalMarks} mark{totalMarks !== 1 ? 's' : ''} total</span>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={reset} className="px-4 py-2 text-sm border rounded-lg">Reset</button>
            <button
              type="button"
              onClick={() => setChecked(true)}
              disabled={questions.length === 0}
              className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 disabled:opacity-60"
            >
              Check Answers
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
