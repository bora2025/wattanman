"use client"

import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

export type QType = 'MCQ' | 'TF' | 'ESSAY' | 'SORT_PARAGRAPHS' | 'DRAG_WORDS'
export interface Choice { id: string; text: string; isCorrect: boolean }
export interface Paragraph { id: string; text: string }
export interface ExamQuestionDraft {
  text: string
  type: QType
  marks: number
  data: any
}

export const TYPE_LABEL: Record<QType, string> = {
  MCQ: 'Multi-Choice',
  TF: 'True / False',
  ESSAY: 'Essay',
  SORT_PARAGRAPHS: 'Sort the Paragraphs',
  DRAG_WORDS: 'Drag the Words',
}

export function uid(prefix: string) { return `${prefix}_${Math.random().toString(36).slice(2, 8)}` }

export function defaultData(type: QType): any {
  switch (type) {
    case 'MCQ':
      return { choices: [{ id: uid('c'), text: '', isCorrect: false }, { id: uid('c'), text: '', isCorrect: false }], multiple: false }
    case 'ESSAY':
      return { minWords: 0 }
    case 'SORT_PARAGRAPHS':
      return { paragraphs: [{ id: uid('p'), text: '' }, { id: uid('p'), text: '' }] }
    case 'DRAG_WORDS':
      return { text: '' }
    case 'TF':
    default:
      return { correct: true }
  }
}

export function defaultQuestion(): ExamQuestionDraft {
  return { text: '', type: 'MCQ', marks: 1, data: defaultData('MCQ') }
}

/** Renders the full "Questions" section: type-switching list + add/remove, for authoring an exam. */
export function ExamQuestionsEditor({ questions, onChange }: { questions: ExamQuestionDraft[]; onChange: (qs: ExamQuestionDraft[]) => void }) {
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
      <p className="text-sm font-semibold text-slate-700 mb-2">Questions</p>
      <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
        {questions.map((q, i) => (
          <div key={i} className="border rounded-lg p-3 bg-slate-50 relative">
            <button type="button" onClick={() => removeQuestion(i)} disabled={questions.length <= 1} className="absolute top-2 right-2 text-red-400 text-xs disabled:opacity-30">✕</button>
            <div className="grid grid-cols-3 gap-2 mb-2">
              <select value={q.type} onChange={e => changeType(i, e.target.value as QType)} className="col-span-2 border rounded px-2 py-1 text-sm">
                {(Object.keys(TYPE_LABEL) as QType[]).map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
              </select>
              <input type="number" step="any" min={0} value={q.marks} onChange={e => updateQuestion(i, { marks: Number(e.target.value) || 0 })} placeholder="Marks" className="border rounded px-2 py-1 text-sm" />
            </div>
            <textarea value={q.text} onChange={e => updateQuestion(i, { text: e.target.value })} placeholder={`Q${i + 1}: Question text`} rows={2} className="w-full border rounded px-2 py-1 text-sm mb-2 resize-none" />

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
              <label className="text-xs text-slate-500 block">Minimum words (optional)
                <input type="number" min={0} value={q.data?.minWords ?? 0} onChange={e => updateQuestion(i, { data: { minWords: Number(e.target.value) || 0 } })} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" />
                <p className="text-[11px] text-slate-400 mt-1">Essay answers must be graded manually.</p>
              </label>
            )}
            {q.type === 'SORT_PARAGRAPHS' && (
              <ParagraphSortEditor data={q.data} onChange={d => updateQuestion(i, { data: d })} />
            )}
            {q.type === 'DRAG_WORDS' && (
              <DragWordsEditor data={q.data} onChange={d => updateQuestion(i, { data: d })} />
            )}
          </div>
        ))}
      </div>
      <button type="button" onClick={addQuestion} className="mt-2 text-sm text-sky-600 hover:underline">+ Add Question</button>
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

function SortableRow({ id, children }: { id: string; children: (opts: { listeners: any; attributes: any }) => React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }
  return <div ref={setNodeRef} style={style}>{children({ listeners, attributes })}</div>
}

function ParagraphSortEditor({ data, onChange }: { data: any; onChange: (d: any) => void }) {
  const paragraphs: Paragraph[] = data?.paragraphs ?? []
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  function updateText(i: number, text: string) {
    onChange({ ...data, paragraphs: paragraphs.map((p, idx) => idx === i ? { ...p, text } : p) })
  }
  function addParagraph() { onChange({ ...data, paragraphs: [...paragraphs, { id: uid('p'), text: '' }] }) }
  function removeParagraph(i: number) { onChange({ ...data, paragraphs: paragraphs.filter((_, idx) => idx !== i) }) }
  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIndex = paragraphs.findIndex(p => p.id === active.id)
    const newIndex = paragraphs.findIndex(p => p.id === over.id)
    onChange({ ...data, paragraphs: arrayMove(paragraphs, oldIndex, newIndex) })
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">Enter paragraphs in the correct order — students see them shuffled and must drag to reorder.</p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={paragraphs.map(p => p.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-1.5">
            {paragraphs.map((p, i) => (
              <SortableRow key={p.id} id={p.id}>
                {({ listeners, attributes }) => (
                  <div className="flex items-start gap-2 bg-white border rounded-lg p-2">
                    <span {...listeners} {...attributes} className="text-slate-400 cursor-grab active:cursor-grabbing pt-1.5 select-none touch-none" title="Drag to reorder">⠿</span>
                    <span className="text-xs text-slate-400 pt-1.5">{i + 1}.</span>
                    <textarea value={p.text} onChange={e => updateText(i, e.target.value)} rows={1} placeholder={`Paragraph ${i + 1}`} className="flex-1 border rounded px-2 py-1 text-sm resize-none" />
                    <button type="button" onClick={() => removeParagraph(i)} disabled={paragraphs.length <= 2} className="text-xs text-red-500 disabled:opacity-30 pt-1.5">✕</button>
                  </div>
                )}
              </SortableRow>
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <button type="button" onClick={addParagraph} className="text-xs text-sky-600 hover:underline">+ Add paragraph</button>
    </div>
  )
}

function DragWordsEditor({ data, onChange }: { data: any; onChange: (d: any) => void }) {
  const text: string = data?.text ?? ''
  const preview = text.split(/(\*[^*]+\*)/g).filter((s: string) => s.length > 0)
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">Wrap each draggable word in *asterisks*, e.g. &quot;The *cat* sat on the *mat*.&quot;</p>
      <textarea value={text} onChange={e => onChange({ text: e.target.value })} rows={3} placeholder="The *cat* sat on the *mat*." className="w-full border rounded-lg px-3 py-2 text-sm resize-none" />
      {text && (
        <div className="text-sm bg-white border rounded-lg p-2 leading-relaxed">
          {preview.map((seg, i) => (
            seg.startsWith('*') && seg.endsWith('*') && seg.length > 2
              ? <span key={i} className="inline-block bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded mx-0.5 font-medium">{seg.slice(1, -1)}</span>
              : <span key={i}>{seg}</span>
          ))}
        </div>
      )}
    </div>
  )
}
