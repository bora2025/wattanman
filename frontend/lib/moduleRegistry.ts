/**
 * Phase 22 — mirrors backend/src/module-registry/module-registry.ts's key
 * list on this side of the repo boundary. No shared package exists between
 * the Next.js and NestJS halves of this repo, so small cross-cutting
 * constants are deliberately duplicated on both sides rather than forcing
 * one — the same convention already used for accentColor/themeFonts. Only
 * the keys need to match here (nav tags don't need name/description/
 * category); `Sidebar.tsx`'s `NavItem.moduleKey` and every `lib/*-nav.ts`
 * tag are typed against `ModuleKey` below, so a typo fails `tsc` instead of
 * silently hiding a nav item forever.
 *
 * Keep this key list in sync with the backend registry by hand when adding
 * a module — there is no build-time check across the two, same as every
 * other duplicated constant in this codebase.
 */

export const MODULE_KEYS = [
  'ATTENDANCE',
  'CLASSES',
  'FEES',
  'SALARY',
  'EXAMS',
  'CARD_DESIGNER',
  'BUS',
  'STUDENT_PORTAL',
  'TEACHER_PORTAL',
  'PARENT_PORTAL',
  'TIMETABLE',
  'PART_TIME_TEACHER',
  'CHAT',
  'LATEX_EDITOR',
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];
