"use client"

import { DndContext, PointerSensor, useSensor, useSensors, useDraggable, useDroppable, type DragEndEvent } from '@dnd-kit/core'
import MathText from '../MathText'

/** Authoring editor for Drag the Words. `data: { text: string }` using *word* markup. */
export function DragWordsEditor({ data, onChange }: { data: any; onChange: (d: any) => void }) {
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

/** Student-facing input for Drag the Words. `data: { segments, wordBank }` (student-safe shape),
 * `value: Record<blankId, string>` (word placed in each blank, or empty). */
export function DragWordsInput({ data, value, onChange, disabled }: { data: any; value: any; onChange: (v: any) => void; disabled?: boolean }) {
  const segments: Array<{ type: 'text'; value: string } | { type: 'blank'; id: string }> = data?.segments ?? []
  const wordBank: string[] = data?.wordBank ?? []
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
