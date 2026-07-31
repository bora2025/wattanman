/**
 * One-off catalog update — backfills `detailDescription` (the new long-form
 * write-up field added alongside `screenshotUrl`) for every module/add-on
 * already seeded by the earlier one-off scripts in this directory. NOT part
 * of the app runtime; run once, by hand, via ts-node.
 *
 * Only touches `detailDescription` — never creates a row, never touches
 * `description`, `icon`, `price`, or anything else a platform admin may
 * have already edited by hand in the Directory UI. Safe to re-run: it's a
 * plain `update`, and if you've since customized a detailDescription
 * yourself in the UI, running this again will overwrite it back to the
 * text below — check before re-running if you've made manual edits.
 *
 * Screenshots are NOT set here — upload those by hand in the Platform
 * Add-ons Directory (/platform/addons), per the Modules & Screenshots
 * feature this script accompanies.
 *
 * Usage:
 *   DATABASE_URL="postgresql://...production..." npx ts-node prisma/update-module-descriptions.ts
 */
import { PrismaClient } from '@prisma/client';

const DETAIL_DESCRIPTIONS: Record<string, string> = {
  ATTENDANCE:
    'Camera and QR-based gate scanning for daily student attendance, plus manual entry and edits for days the camera misses or a correction is needed after the fact. Covers staff/officer attendance the same way, with its own edit trail. This is what powers the front-gate scan flow used by admins, teachers, and the WATTAMAN kiosk role — disable it and a school falls back to no automated attendance tracking at all, so it is usually one of the first modules a new school picks.',
  CLASSES:
    "Core class management: create classes, assign a homeroom teacher and class admin, organize students by academic/study year, and control whether a class is open for public registration. This is the backbone most other academic modules build on top of — Exams, Fees, and the Timetable module all reference a school's class list, though each of those stays independently toggle-able so turning one off never breaks the others.",
  FEES:
    "Per-student fee records, payment tracking, and a finance/budget dashboard that rolls collections up across the whole school. Handles partial payments, outstanding balances, and a running picture of expected vs. collected revenue for the term. Aimed at schools that charge tuition or per-service fees and want that bookkeeping inside the same system as attendance and classes, instead of a separate spreadsheet.",
  SALARY:
    'Staff salary records and payment tracking — base pay, adjustments, and a payment history per staff member. Kept separate from Fees since one is money coming in from families and the other is money going out to staff, and not every school wants both switched on for the same admins.',
  EXAMS:
    'Exam creation, score sheets, and grading, plus the scoring dashboard admins use to review results across classes and terms. Covers both the exam-taking workflow (questions, attempts, auto-grading where applicable) and the after-the-fact scoring/report side. A school running purely on continuous assignment-based grading (no formal exams) can leave this off without losing Assignments or Gradebook, which live outside this module.',
  CARD_DESIGNER:
    'A drag-and-drop template designer for student and staff ID cards and certificates, plus the print/export flow for turning a template into physical cards. Includes the student-cards and staff-cards bulk-print screens. This is purely an admin design/print tool — it does not affect card-based gate scanning, which keeps working regardless of whether this module is enabled.',
  BUS:
    "School transport: bus routes, stops, and live GPS location tracking that parents can follow from their own dashboard. Useful for schools that run their own transport program; schools that don't can leave it off with zero effect on anything else — it's fully self-contained.",
  STUDENT_PORTAL:
    "The admin-side student roster management screen: add, edit, remove, and bulk-CSV-import student accounts. Viewing a class's existing roster (e.g. inside Manage Class, Attendance, or Exams) keeps working with this off — only the ability to add/edit/remove a student record requires it, so disabling it turns Student Portal into a read-only roster elsewhere in the app rather than breaking those other modules.",
  TEACHER_PORTAL:
    "A dedicated screen to browse, add, edit, and remove teacher accounts, separate from the general Manage Users list. Assigning an existing teacher to a class elsewhere in the app (e.g. from Manage Class) isn't affected by this toggle — only the standalone Teacher Portal browse screen requires it.",
  PARENT_PORTAL:
    'A dedicated screen to browse, add, edit, and remove parent accounts, plus the admin queue for reviewing and approving parent link requests submitted by students. Like Teacher Portal, this only gates the standalone management screen and the link-request queue — a parent account referenced elsewhere in the app keeps working regardless.',
  TIMETABLE:
    'The weekly class-schedule builder: subjects, classrooms, lessons, and the entries that place a subject/teacher/room into a specific day and period, plus the printable/visual timetable grid itself. Teacher assignment for the schedule (as opposed to the schedule grid) lives under the separate Part-Time Teacher module, so a school can run a full weekly timetable without necessarily tracking part-time teacher contracts, or vice versa.',
  PART_TIME_TEACHER:
    "Manages the roster of scheduled or part-time teachers used by the Timetable module's lesson contracts, plus their own attendance tracking and reports — separate from a school's regular staff/teacher accounts, since part-time teachers are often paid per lesson and tracked differently. Includes the teacher-attendance scan flow and the monthly report view.",
  CHAT:
    "The admin's Communication Hub: a moderation view over every announcement in the school plus the ability to delete one. This only gates the admin-facing moderation screen — regular messaging and each role's own announcement feed keep working for teachers, students, and parents no matter what this toggle is set to, by design.",
  LATEX_EDITOR:
    'A standalone LaTeX equation editor and quick-reference tool for building math notation into worksheets, exams, or assignments. Entirely client-side with no backend dependency — enabling or disabling it only affects whether the tool shows up in the nav.',
};

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log(`Updating detailDescription for ${Object.keys(DETAIL_DESCRIPTIONS).length} catalog keys...`);
    for (const [key, detailDescription] of Object.entries(DETAIL_DESCRIPTIONS)) {
      const existing = await prisma.addonDefinition.findUnique({ where: { key } });
      if (!existing) {
        console.log(`  ${key}: not found in catalog — skipped (run the module's original seed script first)`);
        continue;
      }
      await prisma.addonDefinition.update({ where: { key }, data: { detailDescription } });
      console.log(`  ${key}: updated`);
    }
    console.log('\nDone. Screenshots are not set by this script — upload those by hand in /platform/addons.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Update failed:', err);
  process.exit(1);
});
