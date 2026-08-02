/**
 * Phase 22 — the single source of truth for every toggleable MODULE key.
 * Before this, a module's key was a plain, unchecked string independently
 * retyped in three places (a backend @RequiresAddon() call, a frontend
 * moduleKey nav tag, and an AddonDefinition.key DB row) with nothing
 * checking they agreed — confirmed live: LATEX_EDITOR was tagged in two nav
 * files and seeded in the catalog with no backend enforcement anywhere, a
 * silent gap nobody had caught. `ModuleKey` below is a real TypeScript
 * union derived FROM this array, so a typo anywhere it's used now fails
 * `tsc --noEmit` instead of silently 403ing an endpoint or hiding a nav
 * item forever.
 *
 * Adding a new module: add one entry here. `backend/prisma/seed-module-registry.ts`
 * reads this array to seed the catalog (replacing four one-off scripts that
 * each hand-duplicated this same shape); `frontend/lib/moduleRegistry.ts`
 * mirrors the key list on the other side of the repo boundary, the same
 * duplicated-small-constant convention already used for
 * accentColor/themeFonts rather than a shared package.
 */

export interface ModuleRegistryEntry {
  key: string;
  name: string;
  description: string;
  category: string;
  /** false only for a module with no backend enforcement at all — nav
   * visibility is the only gate. Must always come with ungatedReason. */
  backendGated?: boolean;
  ungatedReason?: string;
}

export const MODULE_REGISTRY = [
  { key: 'ATTENDANCE', name: 'Attendance', description: 'Camera/QR gate scanning, manual attendance edits, staff attendance.', category: 'Academics' },
  { key: 'CLASSES', name: 'Class Management', description: 'Classes, study years, and timetable.', category: 'Academics' },
  { key: 'FEES', name: 'Fee Management', description: 'Student fee records, payments, and the finance/budget dashboard.', category: 'Finance' },
  { key: 'SALARY', name: 'Salary Management', description: 'Staff salary records and payment tracking.', category: 'Finance' },
  { key: 'EXAMS', name: 'Exams & Scoring', description: 'Exams, score sheets, and grading.', category: 'Academics' },
  { key: 'CARD_DESIGNER', name: 'ID Card Designer', description: 'Design and print student/staff ID card and certificate templates.', category: 'Tools' },
  { key: 'BUS', name: 'School Bus', description: 'Bus routes, stops, and live location tracking.', category: 'Transport' },
  { key: 'STUDENT_PORTAL', name: 'Student Portal', description: 'Add, edit, remove, and bulk-import student accounts.', category: 'People' },
  { key: 'TEACHER_PORTAL', name: 'Teacher Portal', description: 'Add, edit, and remove teacher accounts.', category: 'People' },
  { key: 'PARENT_PORTAL', name: 'Parent Portal', description: 'Add, edit, and remove parent accounts.', category: 'People' },
  { key: 'TIMETABLE', name: 'Timetable', description: 'Build and manage the weekly class schedule — subjects, classrooms, lessons, and entries.', category: 'Academics' },
  { key: 'PART_TIME_TEACHER', name: 'Part-Time Teacher & Reports', description: 'Manage the roster of scheduled/part-time teachers and their attendance reports.', category: 'People' },
  { key: 'CHAT', name: 'Communication Hub', description: 'Admin messaging and announcement moderation dashboard.', category: 'Communication' },
  {
    key: 'LATEX_EDITOR',
    name: 'LaTeX Editor',
    description: 'Standalone LaTeX equation editor and reference tool.',
    category: 'Tools',
    backendGated: false,
    ungatedReason: 'Purely client-side (/tools/latex-editor) — no backend controller calls it, so there is nothing to @RequiresAddon()-gate at the API level. Nav visibility (Sidebar.tsx filtering on moduleKey) is the only enforcement.',
  },
] as const satisfies readonly ModuleRegistryEntry[];

/** A real union of every valid key, generated from the array above — not a
 * hand-maintained enum that can drift from it. */
export type ModuleKey = (typeof MODULE_REGISTRY)[number]['key'];
