"use client"

import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, useDraggable, useDroppable, type DragEndEvent } from '@dnd-kit/core'
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { QType } from '../lib/examQuestionLogic'

/** Minimal question shape the interactive input needs — callers may pass richer objects. */
export interface QuestionInputQuestion {
  id: string
  type: QType
  data: any
}

/** Student-facing interactive input for a single exam question, switched by type. Used both
 * by the real exam-taking page and the teacher-facing preview modal. */
export function QuestionInput({ q, value, onChange }: { q: QuestionInputQuestion; value: any; onChange: (v: any) => void }) {
  if (q.type === 'MCQ') {
    const choices: { id: string; text: string }[] = q.data?.choices ?? []
    const multiple = !!q.data?.multiple
    const selected: string[] = Array.isArray(value) ? value : []
    const toggle = (id: string) => {
      if (multiple) {
        onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id])
      } else {
        onChange([id])
      }
    }
    return (
      <div className="space-y-2">
        {choices.map((c) => {
          const isSelected = selected.includes(c.id)
          return (
            <label key={c.id} className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${isSelected ? 'border-sky-500 bg-sky-50' : 'border-slate-200 hover:border-slate-300'}`}>
              <input type={multiple ? 'checkbox' : 'radio'} name={q.id} checked={isSelected} onChange={() => toggle(c.id)} className="sr-only" />
              <div className={`w-5 h-5 border-2 flex items-center justify-center flex-shrink-0 ${multiple ? 'rounded' : 'rounded-full'} ${isSelected ? 'border-sky-500' : 'border-slate-300'}`}>
                {isSelected && <div className={`bg-sky-500 ${multiple ? 'w-2.5 h-2.5 rounded-sm' : 'w-2.5 h-2.5 rounded-full'}`} />}
              </div>
              <span className="text-sm text-slate-700">{c.text}</span>
            </label>
          )
        })}
      </div>
    )
  }

  if (q.type === 'TF') {
    return (
      <div className="flex gap-3">
        {[true, false].map((v) => (
          <label key={String(v)} className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border-2 cursor-pointer transition-colors ${value === v ? 'border-sky-500 bg-sky-50' : 'border-slate-200 hover:border-slate-300'}`}>
            <input type="radio" name={q.id} checked={value === v} onChange={() => onChange(v)} className="sr-only" />
            <span className="text-sm font-medium text-slate-700">{v ? 'True' : 'False'}</span>
          </label>
        ))}
      </div>
    )
  }

  if (q.type === 'ESSAY') {
    const text = typeof value === 'string' ? value : ''
    const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0
    const minWords = q.data?.minWords || 0
    return (
      <div>
        <textarea
          value={text}
          onChange={e => onChange(e.target.value)}
          rows={6}
          placeholder="Write your answer here..."
          className="w-full border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-sky-300"
        />
        <p className={`text-xs mt-1 ${minWords > 0 && wordCount < minWords ? 'text-amber-600' : 'text-slate-400'}`}>
          {wordCount} word{wordCount !== 1 ? 's' : ''}{minWords > 0 ? ` · minimum ${minWords}` : ''} · graded manually by your teacher
        </p>
      </div>
    )
  }

  if (q.type === 'SORT_PARAGRAPHS') {
    return <SortParagraphsInput q={q} value={value} onChange={onChange} />
  }

  if (q.type === 'DRAG_WORDS') {
    return <DragWordsInput q={q} value={value} onChange={onChange} />
  }

  return <p className="text-xs text-red-500">Unsupported question type</p>
}

function SortParagraphsInput({ q, value, onChange }: { q: QuestionInputQuestion; value: any; onChange: (v: any) => void }) {
  const paragraphs: { id: string; text: string }[] = q.data?.paragraphs ?? []
  const order: string[] = Array.isArray(value) && value.length === paragraphs.length ? value : paragraphs.map(p => p.id)
  const byId = Object.fromEntries(paragraphs.map(p => [p.id, p.text]))
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const oldIndex = order.indexOf(String(active.id))
    const newIndex = order.indexOf(String(over.id))
    onChange(arrayMove(order, oldIndex, newIndex))
  }

  return (
    <div>
      <p className="text-xs text-slate-500 mb-2">Drag to arrange in the correct order.</p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={order} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {order.map((id, i) => (
              <SortableParagraphRow key={id} id={id} index={i} text={byId[id] ?? ''} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  )
}

function SortableParagraphRow({ id, index, text }: { id: string; index: number; text: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 }
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="flex items-start gap-3 p-3 rounded-lg border-2 border-slate-200 bg-white cursor-grab active:cursor-grabbing touch-none"
    >
      <span className="text-slate-400 font-mono text-sm pt-0.5">{index + 1}</span>
      <span className="text-sm text-slate-700 flex-1">{text}</span>
      <span className="text-slate-300">⠿</span>
    </div>
  )
}

function DragWordsInput({ q, value, onChange }: { q: QuestionInputQuestion; value: any; onChange: (v: any) => void }) {
  const segments: Array<{ type: 'text'; value: string } | { type: 'blank'; id: string }> = q.data?.segments ?? []
  const wordBank: string[] = q.data?.wordBank ?? []
  const filled: Record<string, string> = value && typeof value === 'object' ? value : {}
  const placedWords = Object.values(filled)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over) return
    const word = String(active.id).split('::')[0]
    const overId = String(over.id)
    if (!overId.startsWith('blank::')) return
    const blankId = overId.slice('blank::'.length)
    onChange({ ...filled, [blankId]: word })
  }

  function clearBlank(id: string) {
    const next = { ...filled }
    delete next[id]
    onChange(next)
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="text-base leading-loose mb-4">
        {segments.map((seg, i) =>
          seg.type === 'text'
            ? <span key={i}>{seg.value}</span>
            : <DroppableBlank key={seg.id} id={seg.id} word={filled[seg.id]} onClear={() => clearBlank(seg.id)} />
        )}
      </div>
      <p className="text-xs text-slate-500 mb-2">Drag a word into each blank (tap a filled blank to clear it).</p>
      <div className="flex flex-wrap gap-2 p-3 bg-slate-50 rounded-lg border border-dashed border-slate-300">
        {wordBank.length === 0 && <span className="text-xs text-slate-400">No words</span>}
        {wordBank.map((w, i) => (
          <DraggableWord key={`${w}::${i}`} id={`${w}::${i}`} word={w} used={placedWords.includes(w)} />
        ))}
      </div>
    </DndContext>
  )
}

function DraggableWord({ id, word, used }: { id: string; word: string; used: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id, data: { word } })
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined
  return (
    <button
      type="button"
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`px-3 py-1.5 rounded-lg border-2 text-sm font-medium cursor-grab active:cursor-grabbing touch-none select-none ${used ? 'border-slate-200 bg-slate-100 text-slate-400' : 'border-sky-300 bg-sky-50 text-sky-700'} ${isDragging ? 'opacity-50 z-50 relative' : ''}`}
    >
      {word}
    </button>
  )
}

function DroppableBlank({ id, word, onClear }: { id: string; word?: string; onClear: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `blank::${id}` })
  return (
    <span
      ref={setNodeRef}
      onClick={word ? onClear : undefined}
      className={`inline-flex items-center justify-center min-w-[70px] mx-1 px-2 py-0.5 rounded-md border-2 align-middle ${isOver ? 'border-sky-500 bg-sky-50' : word ? 'border-solid bg-emerald-50 border-emerald-300 text-emerald-700 font-medium cursor-pointer' : 'border-dashed border-slate-300 text-slate-300'}`}
      title={word ? 'Click to clear' : 'Drop a word here'}
    >
      {word || '______'}
    </span>
  )
}
