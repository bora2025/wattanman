"use client"

import { DndContext, PointerSensor, useSensor, useSensors, useDraggable, useDroppable, type DragEndEvent } from '@dnd-kit/core'
import MathText from '../MathText'

type Group = 'a' | 'b'

/** Authoring editor for Drag the Words. `data: { text: string, distractors?: string[] }`.
 * *word* marks a group-a blank (blue), #word# marks a group-b blank (orange) — a purely
 * visual hint so students can narrow down candidates faster; both are graded identically. */
export function DragWordsEditor({ data, onChange }: { data: any; onChange: (d: any) => void }) {
  const text: string = data?.text ?? ''
  const distractors: string[] = data?.distractors ?? []
  const preview = text.split(/(\*[^*]+\*|#[^#]+#)/g).filter((s: string) => s.length > 0)
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">
        Wrap words in *asterisks* for one color group, or #hashes# for a second color group — e.g. &quot;John likes *playing* football with #their# friends.&quot; Both are graded the same; the colors just help students tell blank types apart.
      </p>
      <textarea value={text} onChange={e => onChange({ ...data, text: e.target.value })} rows={3} placeholder="John likes *playing* football with #their# friends." className="w-full border rounded-lg px-3 py-2 text-sm resize-none" />
      {text && (
        <div className="text-sm bg-white border rounded-lg p-2 leading-relaxed">
          {preview.map((seg, i) => {
            if (seg.startsWith('*') && seg.endsWith('*') && seg.length > 2) {
              return <span key={i} className="inline-block bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded mx-0.5 font-medium">{seg.slice(1, -1)}</span>
            }
            if (seg.startsWith('#') && seg.endsWith('#') && seg.length > 2) {
              return <span key={i} className="inline-block bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded mx-0.5 font-medium">{seg.slice(1, -1)}</span>
            }
            return <span key={i}>{seg}</span>
          })}
        </div>
      )}
      <div>
        <label className="text-xs text-slate-500 block mb-1">Extra decoy words <span className="text-slate-400">(optional, comma-separated — shown in the word bank but don&apos;t fit any blank)</span></label>
        <input
          type="text"
          value={distractors.join(',')}
          onChange={e => onChange({ ...data, distractors: e.target.value.split(',') })}
          placeholder="e.g. Cardiff, Cork, Derry"
          className="w-full border rounded-lg px-3 py-2 text-sm"
        />
      </div>
    </div>
  )
}

/** Student-facing input for Drag the Words. `data: { segments, wordBank }` (student-safe shape,
 * segments' blanks and wordBank entries each carry a `group: 'a'|'b'` for color hinting),
 * `value: Record<blankId, string>` (word placed in each blank, or empty). */
export function DragWordsInput({ data, value, onChange, disabled }: { data: any; value: any; onChange: (v: any) => void; disabled?: boolean }) {
  const segments: Array<{ type: 'text'; value: string } | { type: 'blank'; id: string; group: Group }> = data?.segments ?? []
  const wordBank: Array<{ word: string; group: Group }> = data?.wordBank ?? []
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
      <div className={disabled ? 'pointer-events-none opacity-60' : undefined}>
        <div className="text-base leading-loose mb-4">
          {segments.map((seg, i) =>
            seg.type === 'text'
              ? <MathText key={i} as="span" text={seg.value} />
              : <DroppableBlank key={seg.id} id={seg.id} group={seg.group} word={filled[seg.id]} onClear={() => clearBlank(seg.id)} />
          )}
        </div>
        <p className="text-xs text-slate-500 mb-2">Drag a word into each blank (tap a filled blank to clear it).</p>
        <div className="flex flex-wrap gap-2 p-3 bg-slate-50 rounded-lg border border-dashed border-slate-300">
          {wordBank.length === 0 && <span className="text-xs text-slate-400">No words</span>}
          {wordBank.map((w, i) => (
            <DraggableWord key={`${w.word}::${i}`} id={`${w.word}::${i}`} word={w.word} group={w.group} used={placedWords.includes(w.word)} />
          ))}
        </div>
      </div>
    </DndContext>
  )
}

function DraggableWord({ id, word, group, used }: { id: string; word: string; group: Group; used: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id, data: { word } })
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined
  const colorClass = used
    ? 'border-slate-200 bg-slate-100 text-slate-400'
    : group === 'b'
      ? 'border-amber-300 bg-amber-50 text-amber-700'
      : 'border-sky-300 bg-sky-50 text-sky-700'
  return (
    <button
      type="button"
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`px-3 py-1.5 rounded-lg border-2 text-sm font-medium cursor-grab active:cursor-grabbing touch-none select-none ${colorClass} ${isDragging ? 'opacity-50 z-50 relative' : ''}`}
    >
      {word}
    </button>
  )
}

function DroppableBlank({ id, group, word, onClear }: { id: string; group: Group; word?: string; onClear: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `blank::${id}` })
  const emptyClass = group === 'b' ? 'border-dashed border-slate-300 bg-slate-100 text-slate-400' : 'border-dashed border-slate-300 bg-white text-slate-300'
  return (
    <span
      ref={setNodeRef}
      onClick={word ? onClear : undefined}
      className={`inline-flex items-center justify-center min-w-[70px] mx-1 px-2 py-0.5 rounded-md border-2 align-middle ${isOver ? 'border-sky-500 bg-sky-50' : word ? 'border-solid bg-emerald-50 border-emerald-300 text-emerald-700 font-medium cursor-pointer' : emptyClass}`}
      title={word ? 'Click to clear' : 'Drop a word here'}
    >
      {word || '______'}
    </span>
  )
}
