"use client"

import { useEffect, useRef, useState, type ReactNode } from 'react'
import MathText from '../MathText'
import { AcceptedAnswersEditor } from './SpeakWordsField'
import { parseFillBlanksText } from '../../lib/h5pQuestionLogic'

const BLANK_RE = /_{3,}/g

type BlankAnswers = { answers: string[] }

// data.text keeps storing the *word1/word2*-markup as the single source of truth
// (grading and student rendering both parse it directly) — mirrors Drag the Words'
// editor pattern: the sentence shows plain ___ placeholders, and the accepted
// answer(s) for each blank live in a numbered list below, rather than typing the
// markup by hand. Multiple accepted spellings/synonyms per blank are supported via
// the same repeatable-list UI Speak the Words already uses for accepted answers.
function toSentenceAndAnswers(text: string): { sentence: string; answers: BlankAnswers[] } {
  const parsed = parseFillBlanksText(text || '')
  let sentence = ''
  const answers: BlankAnswers[] = []
  for (const s of parsed) {
    if (s.type === 'text') sentence += s.value
    else { sentence += '___'; answers.push({ answers: s.answers }) }
  }
  return { sentence, answers }
}

function toText(sentence: string, answers: BlankAnswers[]): string {
  let i = 0
  return sentence.replace(BLANK_RE, () => {
    const a = answers[i++]
    const list = (a?.answers || []).map((w) => w.trim()).filter(Boolean)
    if (!list.length) return '___' // leave incomplete blanks as literal text rather than a blank nobody could ever guess
    return `*${list.join('/')}*`
  })
}

/** Authoring editor for Fill in the Blanks. `data: { text: string }` — see
 * toSentenceAndAnswers/toText above for how the sentence+answer-list UI maps to it.
 * Each blank can accept several alternate spellings/synonyms, all graded equally. */
export function FillBlanksEditor({ data, onChange }: { data: any; onChange: (d: any) => void }) {
  // sentence/answers are real local state, not re-derived from data.text on every
  // render — same reasoning as Drag the Words: a freshly-added blank with no answer
  // yet can't round-trip through the *word*-markup (there's no valid way to encode
  // "blank with an empty answer"), so re-parsing after every keystroke would make a
  // freshly-added blank's row disappear before the teacher had a chance to type into it.
  const initial = toSentenceAndAnswers(data?.text ?? '')
  const [sentence, setSentenceState] = useState(initial.sentence)
  const [answers, setAnswersState] = useState<BlankAnswers[]>(initial.answers)
  const lastEmitted = useRef<string>(data?.text ?? '')

  useEffect(() => {
    const incoming = data?.text ?? ''
    if (incoming !== lastEmitted.current) {
      const parsed = toSentenceAndAnswers(incoming)
      setSentenceState(parsed.sentence)
      setAnswersState(parsed.answers)
      lastEmitted.current = incoming
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.text])

  function emit(newSentence: string, newAnswers: BlankAnswers[]) {
    const nextText = toText(newSentence, newAnswers)
    lastEmitted.current = nextText
    onChange({ ...data, text: nextText })
  }

  function setSentence(newSentence: string) {
    const blankCount = (newSentence.match(BLANK_RE) || []).length
    const newAnswers = Array.from({ length: blankCount }, (_, i) => answers[i] || { answers: [''] })
    setSentenceState(newSentence)
    setAnswersState(newAnswers)
    emit(newSentence, newAnswers)
  }

  function updateBlankAnswers(i: number, list: string[]) {
    const newAnswers = answers.map((a, idx) => (idx === i ? { answers: list } : a))
    setAnswersState(newAnswers)
    emit(sentence, newAnswers)
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-500">
        Type the text with <code className="bg-slate-100 px-1 rounded">___</code> where each blank goes, then fill in the accepted answer(s) below — e.g. &quot;Bilberries are also known as ___ berries.&quot;
      </p>
      <textarea value={sentence} onChange={e => setSentence(e.target.value)} rows={4} placeholder="Bilberries are also known as ___ berries." className="w-full border rounded-lg px-3 py-2 text-sm resize-none" />

      {answers.length > 0 && (
        <div className="space-y-2">
          {answers.map((a, i) => (
            <div key={i} className="flex items-start gap-2 border rounded-lg p-2 bg-white">
              <span className="text-xs text-slate-400 w-14 shrink-0 pt-1.5">Blank {i + 1}</span>
              <div className="flex-1">
                <AcceptedAnswersEditor answers={a.answers} onChange={list => updateBlankAnswers(i, list)} />
              </div>
            </div>
          ))}
        </div>
      )}

      {sentence && (
        <div className="text-sm bg-white border rounded-lg p-2 leading-relaxed">
          {(() => {
            const parts = sentence.split(BLANK_RE)
            const out: ReactNode[] = []
            parts.forEach((part, i) => {
              out.push(<span key={`t${i}`}>{part}</span>)
              if (i < parts.length - 1) {
                const a = answers[i]
                const filled = (a?.answers || []).filter(Boolean).join(' / ')
                out.push(
                  <span key={`b${i}`} className="inline-block px-1.5 py-0.5 rounded mx-0.5 font-medium bg-sky-100 text-sky-700">
                    {filled || `blank ${i + 1}`}
                  </span>
                )
              }
            })
            return out
          })()}
        </div>
      )}
    </div>
  )
}

/** Student-facing input for Fill in the Blanks. `data: { segments }` (student-safe
 * shape, blanks carry only an id — no answers), `value: Record<blankId, string>`
 * (text typed into each blank, or empty). Each blank is a plain inline text box —
 * unlike Drag the Words there's no word bank, the student types directly. */
export function FillBlanksInput({ data, value, onChange, disabled }: { data: any; value: any; onChange: (v: any) => void; disabled?: boolean }) {
  const segments: Array<{ type: 'text'; value: string } | { type: 'blank'; id: string }> = data?.segments ?? []
  const filled: Record<string, string> = value && typeof value === 'object' ? value : {}

  return (
    <div className={`text-base leading-loose ${disabled ? 'pointer-events-none opacity-60' : ''}`}>
      {segments.map((seg, i) =>
        seg.type === 'text' ? (
          <MathText key={i} as="span" text={seg.value} />
        ) : (
          <input
            key={seg.id}
            type="text"
            value={filled[seg.id] || ''}
            onChange={e => onChange({ ...filled, [seg.id]: e.target.value })}
            disabled={disabled}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            style={{ width: `${Math.max(7, (filled[seg.id]?.length || 7) + 2)}ch` }}
            className="inline-block mx-1 px-2 py-0.5 rounded-md border-2 border-slate-300 bg-white text-center align-middle focus:border-sky-500 focus:outline-none disabled:bg-slate-50"
          />
        )
      )}
    </div>
  )
}
