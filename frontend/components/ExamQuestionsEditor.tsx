"use client"

import { useState } from 'react'
import { type QType, type ExamQuestionDraft, TYPE_LABEL, uid, defaultData, defaultQuestion } from '../lib/examQuestionLogic'
import RichTextEditor from './RichTextEditor'
import { EssayEditor } from './questions/EssayField'
import { SortParagraphsEditor } from './questions/SortParagraphsField'
import { DragWordsEditor } from './questions/DragWordsField'
import { FillBlanksEditor } from './questions/FillBlanksField'
import { DragDropEditor } from './questions/DragDropField'
import { SpeakWordsEditor } from './questions/SpeakWordsField'
import { SpeakWordsSetEditor } from './questions/SpeakWordsSetField'
import { DictationEditor } from './questions/DictationField'
import ExamPreviewModal from './ExamPreviewModal'

export type { QType, ExamQuestionDraft }
export { TYPE_LABEL, uid, defaultData, defaultQuestion }
export interface Choice { id: string; text: string; isCorrect: boolean }

// Guards against a common mistake: pasting/typing a section name the way it'd be
// written in a list elsewhere (e.g. "Listening", with a wrapping quote and trailing
// comma copied along) — each question gets its OWN plain section name, not a
// combined list, so a stray quote/comma would otherwise become part of the label
// and silently stop two questions meant to share a section from matching.
function cleanSectionLabel(raw: string): string {
  return raw.replace(/^[\s"'“”‘’]+|[\s"'“”‘’,]+$/g, '')
}

/** Renders the full "Questions" section: type-switching list + add/remove, for authoring an exam. */
export function ExamQuestionsEditor({ questions, onChange }: { questions: ExamQuestionDraft[]; onChange: (qs: ExamQuestionDraft[]) => void }) {
  const [previewOpen, setPreviewOpen] = useState(false)

  function updateQuestion(i: number, patch: Partial<ExamQuestionDraft>) {
    onChange(questions.map((q, idx) => idx === i ? { ...q, ...patch } : q))
  }
  function changeType(i: number, type: QType) {
    updateQuestion(i, { type, data: defaultData(type) })
  }
  function addQuestion() { onChange([...questions, defaultQuestion()]) }
  function removeQuestion(i: number) { onChange(questions.filter((_, idx) => idx !== i)) }

  // Section names already used elsewhere in this exam, offered via a datalist so
  // a teacher typing "Listening" for a 2nd/3rd time gets it spelled consistently —
  // consecutive questions with matching section text become one page for students
  // (see groupQuestionsBySection), so a typo would silently split what was meant
  // to be a single section into two.
  const sectionNames = Array.from(new Set(questions.map(q => (q.section || '').trim()).filter(Boolean)))

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-semibold text-slate-700">Questions</p>
        <button type="button" onClick={() => setPreviewOpen(true)} disabled={questions.length === 0} className="text-xs text-emerald-700 hover:underline disabled:opacity-40">
          👁 Preview
        </button>
      </div>
      <datalist id="exam-section-names">
        {sectionNames.map(name => <option key={name} value={name} />)}
      </datalist>
      <div className="space-y-3">
        {questions.map((q, i) => {
          const section = (q.section || '').trim()
          const prevSection = (questions[i - 1]?.section || '').trim()
          const showSectionDivider = section && section !== prevSection
          return (
          <div key={i}>
            {showSectionDivider && (
              <div className="flex items-center gap-2 mt-4 mb-1.5 first:mt-0">
                <span className="text-xs font-bold text-sky-700 uppercase tracking-wide">{section}</span>
                <div className="flex-1 h-px bg-sky-200" />
              </div>
            )}
            <div className="border border-slate-200 rounded-xl p-3 bg-slate-50 relative">
            <button type="button" onClick={() => removeQuestion(i)} disabled={questions.length <= 1} className="absolute top-2 right-2 text-red-400 text-xs disabled:opacity-30">✕</button>
            <div className="grid grid-cols-3 gap-2 mb-2">
              <select value={q.type} onChange={e => changeType(i, e.target.value as QType)} className="col-span-2 border rounded px-2 py-1 text-sm">
                {(Object.keys(TYPE_LABEL) as QType[]).map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
              </select>
              <input type="number" step="any" min={0} value={q.marks} onChange={e => updateQuestion(i, { marks: Number(e.target.value) || 0 })} placeholder="Marks" className="border rounded px-2 py-1 text-sm" />
            </div>
            <input
              type="text"
              list="exam-section-names"
              value={q.section || ''}
              onChange={e => updateQuestion(i, { section: cleanSectionLabel(e.target.value) })}
              placeholder="Section this question belongs to (optional) — e.g. Listening"
              title="One section name per question — questions in a row sharing the same name become one page for students. Leave blank for questions with no section."
              className="w-full border rounded px-2 py-1 text-xs mb-2 text-slate-600"
            />
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
            {q.type === 'FILL_BLANKS' && (
              <FillBlanksEditor data={q.data} onChange={d => updateQuestion(i, { data: d })} />
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
          </div>
          )
        })}
      </div>
      <button type="button" onClick={addQuestion} className="mt-2 text-sm text-sky-600 hover:underline">+ Add Question</button>
      {previewOpen && <ExamPreviewModal questions={questions} onClose={() => setPreviewOpen(false)} />}
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

