import { BadRequestException } from '@nestjs/common';

// Shared H5P-style question type logic reused by the Exam, Assignments, and Courses
// modules. Each module keeps its own Prisma models, persistence flow, and any
// module-specific types (e.g. Exam's MCQ/TF) — only the `data`/`response` shape and
// grading rules for these 7 types live here, so none of the three modules has to
// reimplement e.g. the drag-and-drop or speech-grading logic independently.

export const H5P_TYPES = [
  'ESSAY',
  'SORT_PARAGRAPHS',
  'DRAG_WORDS',
  'DRAG_DROP',
  'SPEAK_WORDS',
  'SPEAK_WORDS_SET',
  'DICTATION',
] as const;

export type H5PType = (typeof H5P_TYPES)[number];

export function isH5PType(type: string): type is H5PType {
  return (H5P_TYPES as readonly string[]).includes(type);
}

// Drag the Words uses a *word*-delimited markup as the single source of truth for
// both the correct answers (grading) and the student-facing blanked-out segments —
// avoids storing two things that could drift out of sync.
export function parseDragWordsText(text: string): Array<{ type: 'text'; value: string } | { type: 'blank'; id: string; answer: string }> {
  const parts = (text || '').split(/(\*[^*]+\*)/g).filter((p) => p.length > 0);
  let i = 0;
  return parts.map((p) => {
    if (p.startsWith('*') && p.endsWith('*') && p.length > 2) {
      return { type: 'blank' as const, id: `b${i++}`, answer: p.slice(1, -1).trim() };
    }
    return { type: 'text' as const, value: p };
  });
}

export function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Trims/lowercases/strips punctuation so speech transcripts and typed answers can
// be compared to accepted answers without being defeated by casing or stray commas.
function normalizeAnswer(s: string): string {
  return (s || '')
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ');
}

export function sanitizeH5PInput(type: H5PType, raw: any): any {
  switch (type) {
    case 'ESSAY':
      return { minWords: Math.max(0, Number(raw?.minWords) || 0) };

    case 'SORT_PARAGRAPHS': {
      const paragraphs = Array.isArray(raw?.paragraphs) ? raw.paragraphs : [];
      const cleaned = paragraphs
        .filter((p: any) => (p?.text ?? '').toString().trim())
        .map((p: any, i: number) => ({ id: String(p.id || `p${i}`), text: String(p.text).trim() }));
      if (cleaned.length < 2) throw new BadRequestException('Sort the Paragraphs needs at least 2 paragraphs');
      return { paragraphs: cleaned };
    }

    case 'DRAG_WORDS': {
      const dragText = String(raw?.text || '').trim();
      if (!dragText) throw new BadRequestException('Drag the Words needs body text');
      const blanks = parseDragWordsText(dragText).filter((s) => s.type === 'blank');
      if (blanks.length < 1) throw new BadRequestException('Drag the Words needs at least one *word* marked as a blank');
      return { text: dragText };
    }

    case 'DRAG_DROP': {
      const backgroundImage = String(raw?.backgroundImage || '').trim();
      if (!backgroundImage) throw new BadRequestException('Drag and Drop needs a background image');
      const zones = Array.isArray(raw?.zones) ? raw.zones : [];
      const cleanedZones = zones
        .filter((z: any) => z && z.id)
        .map((z: any) => ({
          id: String(z.id),
          x: Math.max(0, Math.min(100, Number(z.x) || 0)),
          y: Math.max(0, Math.min(100, Number(z.y) || 0)),
          width: Math.max(1, Math.min(100, Number(z.width) || 10)),
          height: Math.max(1, Math.min(100, Number(z.height) || 10)),
        }));
      if (cleanedZones.length < 1) throw new BadRequestException('Drag and Drop needs at least 1 drop zone');
      const zoneIds = new Set(cleanedZones.map((z: any) => z.id));
      const items = Array.isArray(raw?.items) ? raw.items : [];
      const cleanedItems = items
        .filter((it: any) => (it?.label ?? '').toString().trim() && zoneIds.has(String(it?.correctZoneId)))
        .map((it: any, i: number) => ({
          id: String(it.id || `i${i}`),
          label: String(it.label).trim(),
          correctZoneId: String(it.correctZoneId),
        }));
      if (cleanedItems.length < 1) throw new BadRequestException('Drag and Drop needs at least 1 item assigned to a valid zone');
      return { backgroundImage, zones: cleanedZones, items: cleanedItems };
    }

    case 'SPEAK_WORDS': {
      const prompt = String(raw?.prompt || '').trim();
      if (!prompt) throw new BadRequestException('Speak the Words needs a prompt');
      const acceptedAnswers = (Array.isArray(raw?.acceptedAnswers) ? raw.acceptedAnswers : [])
        .map((a: any) => String(a).trim())
        .filter(Boolean);
      if (acceptedAnswers.length < 1) throw new BadRequestException('Speak the Words needs at least 1 accepted answer');
      return { prompt, acceptedAnswers };
    }

    case 'SPEAK_WORDS_SET': {
      const items = Array.isArray(raw?.items) ? raw.items : [];
      const cleaned = items
        .map((it: any, i: number) => ({
          id: String(it?.id || `sw${i}`),
          prompt: String(it?.prompt || '').trim(),
          acceptedAnswers: (Array.isArray(it?.acceptedAnswers) ? it.acceptedAnswers : [])
            .map((a: any) => String(a).trim())
            .filter(Boolean),
        }))
        .filter((it: any) => it.prompt && it.acceptedAnswers.length > 0);
      if (cleaned.length < 1) throw new BadRequestException('Speak the Words Set needs at least 1 prompt with an accepted answer');
      return { items: cleaned };
    }

    case 'DICTATION': {
      const script = String(raw?.script || '').trim();
      if (!script) throw new BadRequestException('Dictation needs a script');
      const audioUrl = String(raw?.audioUrl || '').trim();
      return audioUrl ? { script, audioUrl } : { script };
    }

    default:
      throw new BadRequestException(`Unknown H5P question type: ${type}`);
  }
}

// Strips correct-answer data before sending a question to a student. NOTE on
// DICTATION: `script` is intentionally returned here (unlike other types' answer
// keys) because the browser-only architecture (no server-side TTS/audio storage)
// needs the raw text client-side to call speechSynthesis.speak() when no audioUrl
// is set — the frontend must render it only to the audio engine, never as visible
// text, but a sufficiently determined student could still inspect the network
// payload. This is an accepted tradeoff of the "no audio infrastructure" decision,
// same category as Speak the Words' recognition-accuracy caveat.
export function sanitizeH5PForStudent(type: H5PType, data: any): any {
  const d = data || {};
  switch (type) {
    case 'ESSAY':
      return { minWords: d.minWords || 0 };

    case 'SORT_PARAGRAPHS':
      return { paragraphs: shuffle((d.paragraphs || []).map((p: any) => ({ id: p.id, text: p.text }))) };

    case 'DRAG_WORDS': {
      const parsed = parseDragWordsText(d.text || '');
      const segments = parsed.map((s) => (s.type === 'blank' ? { type: 'blank' as const, id: s.id } : s));
      const wordBank = shuffle(parsed.filter((s) => s.type === 'blank').map((s: any) => s.answer));
      return { segments, wordBank };
    }

    case 'DRAG_DROP':
      return {
        backgroundImage: d.backgroundImage,
        zones: (d.zones || []).map((z: any) => ({ id: z.id, x: z.x, y: z.y, width: z.width, height: z.height })),
        items: shuffle((d.items || []).map((it: any) => ({ id: it.id, label: it.label }))),
      };

    case 'SPEAK_WORDS':
      return { prompt: d.prompt };

    case 'SPEAK_WORDS_SET':
      return { items: (d.items || []).map((it: any) => ({ id: it.id, prompt: it.prompt })) };

    case 'DICTATION':
      return d.audioUrl ? { audioUrl: d.audioUrl, script: d.script } : { script: d.script };

    default:
      return {};
  }
}

export function gradeH5PQuestion(type: H5PType, data: any, response: any, marks: number): { awarded: number | null; autoGraded: boolean } {
  if (type === 'ESSAY') return { awarded: null, autoGraded: false };
  if (response == null) return { awarded: 0, autoGraded: true };

  const d = data || {};
  switch (type) {
    case 'SORT_PARAGRAPHS': {
      const correctOrder: string[] = (d.paragraphs || []).map((p: any) => p.id);
      const given: string[] = Array.isArray(response) ? response.map(String) : [];
      let correct = 0;
      for (let i = 0; i < correctOrder.length; i++) if (given[i] === correctOrder[i]) correct++;
      return { awarded: (marks * correct) / (correctOrder.length || 1), autoGraded: true };
    }

    case 'DRAG_WORDS': {
      const blanks = parseDragWordsText(d.text || '').filter((s) => s.type === 'blank') as { id: string; answer: string }[];
      const given: Record<string, string> = response && typeof response === 'object' ? response : {};
      let correct = 0;
      for (const b of blanks) if ((given[b.id] || '').trim().toLowerCase() === b.answer.trim().toLowerCase()) correct++;
      return { awarded: (marks * correct) / (blanks.length || 1), autoGraded: true };
    }

    case 'DRAG_DROP': {
      const items: { id: string; correctZoneId: string }[] = d.items || [];
      const given: Record<string, string> = response && typeof response === 'object' ? response : {};
      let correct = 0;
      for (const it of items) if (given[it.id] === it.correctZoneId) correct++;
      return { awarded: (marks * correct) / (items.length || 1), autoGraded: true };
    }

    case 'SPEAK_WORDS': {
      const accepted: string[] = (d.acceptedAnswers || []).map(normalizeAnswer);
      const given = normalizeAnswer(typeof response === 'string' ? response : '');
      return { awarded: accepted.includes(given) ? marks : 0, autoGraded: true };
    }

    case 'SPEAK_WORDS_SET': {
      const items: { id: string; acceptedAnswers: string[] }[] = d.items || [];
      const given: Record<string, string> = response && typeof response === 'object' ? response : {};
      let correct = 0;
      for (const it of items) {
        const accepted = (it.acceptedAnswers || []).map(normalizeAnswer);
        if (accepted.includes(normalizeAnswer(given[it.id] || ''))) correct++;
      }
      return { awarded: (marks * correct) / (items.length || 1), autoGraded: true };
    }

    case 'DICTATION': {
      const scriptWords = normalizeAnswer(d.script || '').split(' ').filter(Boolean);
      const givenWords = normalizeAnswer(typeof response === 'string' ? response : '').split(' ').filter(Boolean);
      let matching = 0;
      for (let i = 0; i < scriptWords.length; i++) if (givenWords[i] === scriptWords[i]) matching++;
      return { awarded: (marks * matching) / (scriptWords.length || 1), autoGraded: true };
    }

    default:
      return { awarded: null, autoGraded: false };
  }
}
