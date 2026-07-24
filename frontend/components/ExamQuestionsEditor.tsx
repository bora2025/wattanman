"use client"

import { useState } from 'react'
import { type QType, type ExamQuestionDraft, TYPE_LABEL, uid, defaultData, defaultQuestion } from '../lib/examQuestionLogic'
import RichTextEditor from './RichTextEditor'
import { EssayEditor } from './questions/EssayField'
import { SortParagraphsEditor } from './questions/SortParagraphsField'
import { DragWordsEditor } from './questions/DragWordsField'
import { DragDropEditor } from './questions/DragDropField'
import { SpeakWordsEditor } from './questions/SpeakWordsField'
import { SpeakWordsSetEditor } from './questions/SpeakWordsSetField'
import { DictationEditor } from './questions/DictationField'
import ExamPreviewModal from './ExamPreviewModal'

export type { QType, ExamQuestionDraft }
export { TYPE_LABEL, uid, defaultData, defaultQuestion }
export interface Choice { id: string; text: string; isCorrect: boolean }

/** Renders the full "Questions" section: type-switching list + add/remove, for authoring an exam.
 * `durationMinutes` (the exam's own duration field) is optional and only used to simulate the
 * countdown timer in the Preview modal — pass it from whatever form holds the exam's metadata. */
export function ExamQuestionsEditor({ questions, onChange, durationMinutes }: { questions: ExamQuestionDraft[]; onChange: (qs: ExamQuestionDraft[]) => void; durationMinutes?: number }) {
  const [previewOpen, setPreviewOpen] = useState(false)

  function updateQuestion(i: number, patch: Partial<ExamQuestionDraft>) {
    onChange(questions.map((q, idx) => idx === i ? { ...q, ...patch } : q))
  }
  function changeType(i: number, type: QType) {
    updateQuestion(i, { type, data: defaultData(type) })
  }
  function addQuestion() { onChange([...questions, defaultQuestion()]) }
  function removeQuestion(i: number) { onChange(questions.filter((_, idx) => idx !== i)) }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-slate-700">Questions</p>
        <button type="button" onClick={() => setPreviewOpen(true)} disabled={questions.length === 0} className="text-xs text-emerald-700 hover:underline disabled:opacity-40">
          👁 Preview
        </button>
      </div>
      <div className="space-y-3">
        {questions.map((q, i) => (
          <div key={i} className="border border-slate-200 rounded-xl p-3 bg-slate-50 relative">
            <button type="button" onClick={() => removeQuestion(i)} disabled={questions.length <= 1} className="absolute top-2 right-2 text-red-400 text-xs disabled:opacity-30">✕</button>
            <div className="grid grid-cols-3 gap-2 mb-2">
              <select value={q.type} onChange={e => changeType(i, e.target.value as QType)} className="col-span-2 border rounded px-2 py-1 text-sm">
                {(Object.keys(TYPE_LABEL) as QType[]).map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
              </select>
              <input type="number" step="any" min={0} value={q.marks} onChange={e => updateQuestion(i, { marks: Number(e.target.value) || 0 })} placeholder="Marks" className="border rounded px-2 py-1 text-sm" />
            </div>
            <RichTextEditor value={q.text} onChange={text => updateQuestion(i, { text })} placeholder={`Q${i + 1}: Question text`} />

            {q.type === 'MCQ' && (
              <McqEditor data={q.data} onChange={d => updateQuestion(i, { data: d })} />
            )}
            {q.type === 'TF' && (
              <div className="flex items-center gap-4 text-sm">
                <span className="text-slate-500">Correct answer:</span>
                <label className="flex items-center gap-1"><input type="radio" checked={q.data?.correct === true} onChange={() => updateQuestion(i, { data: { correct: true } })} /> True</label>
                <label className="flex items-center gap-1"><input type="radio" checked={q.data?.correct === false} onChange={() => updateQuestion(i, { data: { correct: false } })} /> False</label>
              </div>
            )}
            {q.type === 'ESSAY' && (
              <EssayEditor data={q.data} onChange={d => updateQuestion(i, { data: d })} />
            )}
            {q.type === 'SORT_PARAGRAPHS' && (
              <SortParagraphsEditor data={q.data} onChange={d => updateQuestion(i, { data: d })} />
            )}
            {q.type === 'DRAG_WORDS' && (
              <DragWordsEditor data={q.data} onChange={d => updateQuestion(i, { data: d })} />
            )}
            {q.type === 'DRAG_DROP' && (
              <DragDropEditor data={q.data} onChange={d => updateQuestion(i, { data: d })} />
            )}
            {q.type === 'SPEAK_WORDS' && (
              <SpeakWordsEditor data={q.data} onChange={d => updateQuestion(i, { data: d })} />
            )}
            {q.type === 'SPEAK_WORDS_SET' && (
              <SpeakWordsSetEditor data={q.data} onChange={d => updateQuestion(i, { data: d })} />
            )}
            {q.type === 'DICTATION' && (
              <DictationEditor data={q.data} onChange={d => updateQuestion(i, { data: d })} />
            )}
          </div>
        ))}
      </div>
      <button type="button" onClick={addQuestion} className="mt-2 text-sm text-sky-600 hover:underline">+ Add Question</button>
      {previewOpen && <ExamPreviewModal questions={questions} durationMinutes={durationMinutes} onClose={() => setPreviewOpen(false)} />}
    </div>
  )
}

function McqEditor({ data, onChange }: { data: any; onChange: (d: any) => void }) {
  const choices: Choice[] = data?.choices ?? []
  const multiple = !!data?.multiple
  function setChoice(i: number, patch: Partial<Choice>) {
    const next = choices.map((c, idx) => idx === i ? { ...c, ...patch } : c)
    onChange({ ...data, choices: next })
  }
  function addChoice() { onChange({ ...data, choices: [...choices, { id: uid('c'), text: '', isCorrect: false }] }) }
  function removeChoice(i: number) { onChange({ ...data, choices: choices.filter((_, idx) => idx !== i) }) }
  function toggleCorrect(i: number) {
    if (multiple) {
      setChoice(i, { isCorrect: !choices[i].isCorrect })
    } else {
      onChange({ ...data, choices: choices.map((c, idx) => ({ ...c, isCorrect: idx === i })) })
    }
  }
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 text-xs text-slate-500">
        <input type="checkbox" checked={multiple} onChange={e => onChange({ ...data, multiple: e.target.checked })} /> Allow multiple correct answers
      </label>
      {choices.map((c, i) => (
        <div key={c.id} className="flex items-center gap-2">
          <input type={multiple ? 'checkbox' : 'radio'} checked={c.isCorrect} onChange={() => toggleCorrect(i)} title="Mark as correct" />
          <input value={c.text} onChange={e => setChoice(i, { text: e.target.value })} placeholder={`Choice ${i + 1}`} className="flex-1 border rounded-lg px-3 py-1.5 text-sm" />
          <button type="button" onClick={() => removeChoice(i)} disabled={choices.length <= 2} className="text-xs text-red-500 disabled:opacity-30">✕</button>
        </div>
      ))}
      <button type="button" onClick={addChoice} className="text-xs text-sky-600 hover:underline">+ Add choice</button>
    </div>
  )
}

