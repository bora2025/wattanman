// Shared H5P-style question type logic reused by the Exam, Assignments, and Courses
// modules' authoring/taking/gradebook UIs. Mirrors backend/src/h5p/h5p-questions.ts
// exactly (labels, defaults, and a client-side grading mirror for instant preview
// without a round-trip). Each module keeps its own module-specific types (e.g.
// Exam's MCQ/TF) locally and only imports this file for the 7 shared types.

export const H5P_TYPES = [
  'ESSAY',
  'SORT_PARAGRAPHS',
  'DRAG_WORDS',
  'DRAG_DROP',
  'SPEAK_WORDS',
  'SPEAK_WORDS_SET',
  'DICTATION',
] as const

export type H5PType = (typeof H5P_TYPES)[number]

export function isH5PType(type: string): type is H5PType {
  return (H5P_TYPES as readonly string[]).includes(type)
}

export const H5P_TYPE_LABEL: Record<H5PType, string> = {
  ESSAY: 'Essay',
  SORT_PARAGRAPHS: 'Sort the Paragraphs',
  DRAG_WORDS: 'Drag the Words',
  DRAG_DROP: 'Drag and Drop',
  SPEAK_WORDS: 'Speak the Words',
  SPEAK_WORDS_SET: 'Speak the Words Set',
  DICTATION: 'Dictation',
}

export function uid(prefix: string) { return `${prefix}_${Math.random().toString(36).slice(2, 8)}` }

export function h5pDefaultData(type: H5PType): any {
  switch (type) {
    case 'ESSAY':
      return { minWords: 0 }
    case 'SORT_PARAGRAPHS':
      return { paragraphs: [{ id: uid('p'), text: '' }, { id: uid('p'), text: '' }] }
    case 'DRAG_WORDS':
      return { text: '' }
    case 'DRAG_DROP':
      return { backgroundImage: '', zones: [], items: [] }
    case 'SPEAK_WORDS':
      return { prompt: '', acceptedAnswers: [''] }
    case 'SPEAK_WORDS_SET':
      return { items: [{ id: uid('sw'), prompt: '', acceptedAnswers: [''] }] }
    case 'DICTATION':
      return { script: '', audioUrl: '' }
  }
}

// Drag the Words uses a *word*-delimited markup as the single source of truth —
// mirrors backend/src/h5p/h5p-questions.ts's parseDragWordsText.
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

function normalizeAnswer(s: string): string {
  return (s || '')
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
}

// Strips correct-answer data the same way backend/src/h5p/h5p-questions.ts's
// sanitizeH5PForStudent does, so a preview never leaks answers through the
// interactive input's own props (grading is done separately via gradeH5PQuestion).
export function sanitizeH5PForPreview(type: H5PType, data: any): any {
  const d = data || {}
  switch (type) {
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
    case 'DRAG_DROP':
      return {
        backgroundImage: d.backgroundImage,
        zones: (d.zones || []).map((z: any) => ({ id: z.id, x: z.x, y: z.y, width: z.width, height: z.height })),
        items: shuffle((d.items || []).map((it: any) => ({ id: it.id, label: it.label }))),
      }
    case 'SPEAK_WORDS':
      return { prompt: d.prompt }
    case 'SPEAK_WORDS_SET':
      return { items: (d.items || []).map((it: any) => ({ id: it.id, prompt: it.prompt })) }
    case 'DICTATION':
      return d.audioUrl ? { audioUrl: d.audioUrl, script: d.script } : { script: d.script }
  }
}

// Mirrors backend/src/h5p/h5p-questions.ts's gradeH5PQuestion.
export function gradeH5PQuestion(type: H5PType, data: any, response: any, marks: number): { awarded: number | null; autoGraded: boolean } {
  if (type === 'ESSAY') return { awarded: null, autoGraded: false }
  if (response == null) return { awarded: 0, autoGraded: true }

  const d = data || {}
  switch (type) {
    case 'SORT_PARAGRAPHS': {
      const correctOrder: string[] = (d.paragraphs || []).map((p: any) => p.id)
      const given: string[] = Array.isArray(response) ? response.map(String) : []
      let correct = 0
      for (let i = 0; i < correctOrder.length; i++) if (given[i] === correctOrder[i]) correct++
      return { awarded: (marks * correct) / (correctOrder.length || 1), autoGraded: true }
    }
    case 'DRAG_WORDS': {
      const blanks = parseDragWordsText(d.text || '').filter((s) => s.type === 'blank') as { id: string; answer: string }[]
      const given: Record<string, string> = response && typeof response === 'object' ? response : {}
      let correct = 0
      for (const b of blanks) if ((given[b.id] || '').trim().toLowerCase() === b.answer.trim().toLowerCase()) correct++
      return { awarded: (marks * correct) / (blanks.length || 1), autoGraded: true }
    }
    case 'DRAG_DROP': {
      const items: { id: string; correctZoneId: string }[] = d.items || []
      const given: Record<string, string> = response && typeof response === 'object' ? response : {}
      let correct = 0
      for (const it of items) if (given[it.id] === it.correctZoneId) correct++
      return { awarded: (marks * correct) / (items.length || 1), autoGraded: true }
    }
    case 'SPEAK_WORDS': {
      const accepted: string[] = (d.acceptedAnswers || []).map(normalizeAnswer)
      const given = normalizeAnswer(typeof response === 'string' ? response : '')
      return { awarded: accepted.includes(given) ? marks : 0, autoGraded: true }
    }
    case 'SPEAK_WORDS_SET': {
      const items: { id: string; acceptedAnswers: string[] }[] = d.items || []
      const given: Record<string, string> = response && typeof response === 'object' ? response : {}
      let correct = 0
      for (const it of items) {
        const accepted = (it.acceptedAnswers || []).map(normalizeAnswer)
        if (accepted.includes(normalizeAnswer(given[it.id] || ''))) correct++
      }
      return { awarded: (marks * correct) / (items.length || 1), autoGraded: true }
    }
    case 'DICTATION': {
      const scriptWords = normalizeAnswer(d.script || '').split(' ').filter(Boolean)
      const givenWords = normalizeAnswer(typeof response === 'string' ? response : '').split(' ').filter(Boolean)
      let matching = 0
      for (let i = 0; i < scriptWords.length; i++) if (givenWords[i] === scriptWords[i]) matching++
      return { awarded: (marks * matching) / (scriptWords.length || 1), autoGraded: true }
    }
  }
}

export { normalizeAnswer }

// Word-level diff for Dictation's post-submission feedback — positional comparison
// after normalization, mirroring the scoring logic in gradeH5PQuestion('DICTATION').
export function diffWords(script: string, response: string): Array<{ word: string; match: boolean }> {
  const scriptWords = (script || '').trim().split(/\s+/).filter(Boolean)
  const givenWords = (response || '').trim().split(/\s+/).filter(Boolean)
  return scriptWords.map((word, i) => ({
    word,
    match: normalizeAnswer(givenWords[i] || '') === normalizeAnswer(word),
  }))
}
