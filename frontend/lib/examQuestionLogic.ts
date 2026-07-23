// Shared exam-question types, authoring defaults, and client-side mirrors of
// backend/src/exam/exam.service.ts's sanitize/grade logic. Used by the question
// authoring editor, the preview modal, and the teacher gradebook so none of them
// need a round-trip just to shuffle/score a question.

export type QType = 'MCQ' | 'TF' | 'ESSAY' | 'SORT_PARAGRAPHS' | 'DRAG_WORDS'

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

// Drag the Words uses a *word*-delimited markup as the single source of truth —
// mirrors backend/src/exam/exam.service.ts's parseDragWordsText.
export function parseDragWordsText(text: string): Array<{ type: 'text'; value: string } | { type: 'blank'; id: string; answer: string }> {
  const parts = (text || '').split(/(\*[^*]+\*)/g).filter((p) => p.length > 0)
  let i = 0
  return parts.map((p) => {
    if (p.startsWith('*') && p.endsWith('*') && p.length > 2) {
      return { type: 'blank' as const, id: `b${i++}`, answer: p.slice(1, -1).trim() }
    }
    return { type: 'text' as const, value: p }
  })
}

export function shuffle<T>(arr: T[]): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// Strips correct-answer data the same way exam.service.ts's
// sanitizeExamQuestionForStudent does, so a preview never leaks answers through
// the interactive input's own props (grading is done separately via gradeQuestion).
export function sanitizeForPreview(type: QType, data: any): any {
  const d = data || {}
  switch (type) {
    case 'MCQ':
      return { choices: (d.choices || []).map((c: any) => ({ id: c.id, text: c.text })), multiple: !!d.multiple }
    case 'ESSAY':
      return { minWords: d.minWords || 0 }
    case 'SORT_PARAGRAPHS':
      return { paragraphs: shuffle((d.paragraphs || []).map((p: any) => ({ id: p.id, text: p.text }))) }
    case 'DRAG_WORDS': {
      const parsed = parseDragWordsText(d.text || '')
      const segments = parsed.map((s) => (s.type === 'blank' ? { type: 'blank' as const, id: s.id } : s))
      const wordBank = shuffle(parsed.filter((s) => s.type === 'blank').map((s: any) => s.answer))
      return { segments, wordBank }
    }
    case 'TF':
    default:
      return {}
  }
}

// Mirrors backend/src/exam/exam.service.ts's gradeExamQuestion.
export function gradeQuestion(q: { type: QType | string; marks: number; data: any }, response: any): { awarded: number | null; autoGraded: boolean } {
  if (response == null) {
    if (q.type === 'ESSAY') return { awarded: null, autoGraded: false }
    return { awarded: 0, autoGraded: true }
  }
  const d = q.data || {}
  switch (q.type) {
    case 'MCQ': {
      const correctIds = new Set((d.choices || []).filter((c: any) => c.isCorrect).map((c: any) => c.id))
      const chosen = new Set(Array.isArray(response) ? response.map(String) : [String(response)])
      const equal = chosen.size === correctIds.size && [...chosen].every((id) => correctIds.has(id))
      return { awarded: equal ? q.marks : 0, autoGraded: true }
    }
    case 'TF':
      return { awarded: !!response === !!d.correct ? q.marks : 0, autoGraded: true }
    case 'SORT_PARAGRAPHS': {
      const correctOrder: string[] = (d.paragraphs || []).map((p: any) => p.id)
      const given: string[] = Array.isArray(response) ? response.map(String) : []
      let correct = 0
      for (let i = 0; i < correctOrder.length; i++) if (given[i] === correctOrder[i]) correct++
      return { awarded: (q.marks * correct) / (correctOrder.length || 1), autoGraded: true }
    }
    case 'DRAG_WORDS': {
      const blanks = parseDragWordsText(d.text || '').filter((s) => s.type === 'blank') as { id: string; answer: string }[]
      const given: Record<string, string> = response && typeof response === 'object' ? response : {}
      let correct = 0
      for (const b of blanks) if ((given[b.id] || '').trim().toLowerCase() === b.answer.trim().toLowerCase()) correct++
      return { awarded: (q.marks * correct) / (blanks.length || 1), autoGraded: true }
    }
    case 'ESSAY':
      return { awarded: null, autoGraded: false }
    default:
      return { awarded: null, autoGraded: false }
  }
}
