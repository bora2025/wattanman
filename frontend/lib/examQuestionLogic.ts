// Exam-specific question types, authoring defaults, and client-side mirrors of
// backend/src/exam/exam.service.ts's sanitize/grade logic. Used by the question
// authoring editor, the preview modal, and the teacher gradebook so none of them
// need a round-trip just to shuffle/score a question. MCQ/TF are exam-local; the
// other 5 types delegate to lib/h5pQuestionLogic.ts, which is shared with the
// Assignments and Courses modules.

import {
  H5P_TYPES, type H5PType, isH5PType, H5P_TYPE_LABEL, h5pDefaultData,
  parseDragWordsText, shuffle, sanitizeH5PForPreview, gradeH5PQuestion, uid,
} from './h5pQuestionLogic'

export type QType = 'MCQ' | 'TF' | H5PType

export interface ExamQuestionDraft {
  text: string
  type: QType
  marks: number
  data: any
}

export const TYPE_LABEL: Record<QType, string> = {
  MCQ: 'Multi-Choice',
  TF: 'True / False',
  ...H5P_TYPE_LABEL,
}

export { uid, parseDragWordsText, shuffle, isH5PType, H5P_TYPES }

export function defaultData(type: QType): any {
  if (isH5PType(type)) return h5pDefaultData(type)
  if (type === 'MCQ') return { choices: [{ id: uid('c'), text: '', isCorrect: false }, { id: uid('c'), text: '', isCorrect: false }], multiple: false }
  return { correct: true }
}

export function defaultQuestion(): ExamQuestionDraft {
  return { text: '', type: 'MCQ', marks: 1, data: defaultData('MCQ') }
}

// Strips correct-answer data the same way exam.service.ts's
// sanitizeExamQuestionForStudent does, so a preview never leaks answers through
// the interactive input's own props (grading is done separately via gradeQuestion).
export function sanitizeForPreview(type: QType, data: any): any {
  if (isH5PType(type)) return sanitizeH5PForPreview(type, data)
  const d = data || {}
  if (type === 'MCQ') return { choices: (d.choices || []).map((c: any) => ({ id: c.id, text: c.text })), multiple: !!d.multiple }
  return {}
}

// Mirrors backend/src/exam/exam.service.ts's gradeExamQuestion.
export function gradeQuestion(q: { type: QType | string; marks: number; data: any }, response: any): { awarded: number | null; autoGraded: boolean } {
  if (response == null && q.type !== 'ESSAY') return { awarded: 0, autoGraded: true }
  if (isH5PType(q.type)) return gradeH5PQuestion(q.type, q.data, response, q.marks)
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
    default:
      return { awarded: null, autoGraded: false }
  }
}
