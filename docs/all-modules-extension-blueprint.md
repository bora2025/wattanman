# All Modules to Extensions Blueprint

## Purpose

This document inventories every module registered by Wattaman, copies the functional scope found in the existing backend and frontend, and defines how each module should become a complete first-party extension.

This is an architecture and implementation blueprint. It does not mean every module has already been converted.

> **Destructive removal status (2026-08-10):** The user explicitly selected removal of every non-core school feature, including source runtime exposure and database data. The implementation detaches all feature NestJS modules, removes feature navigation, retires feature routes at middleware, empties the core module registry, and adds migration `20260810000006_remove_all_school_features`. Applying that migration is irreversible and deletes the feature data listed in the migration.

The second purpose is deletion safety: after a module becomes a verified extension, this document identifies which legacy routes, navigation entries, gates, and compatibility code may be removed without losing the copied feature.

## Critical Architecture Clarification

Moving a feature to a first-party `CORE_MODULE` extension does **not** mean its backend domain code and relational Prisma models can be deleted from the repository.

A `CORE_MODULE` extension is lifecycle-controlled by the extension platform, but its executable implementation still lives in Wattaman:

- NestJS controllers and services execute the feature.
- Prisma models store relational school data.
- React and Next.js components render the feature.
- Extension installation and activation decide whether the school may use it.

Deleting those implementation files would delete the extension's functionality.

After conversion, only the following legacy layers should normally be deleted:

- Old non-extension page entry points after redirects are no longer needed.
- Duplicate static navigation entries after extension navigation owns them.
- Legacy `SchoolAddon` compatibility code after all installations are migrated.
- Duplicate module catalog and toggle UI.
- Old ungated or general-purpose mutation routes replaced by extension-owned routes.
- Temporary redirects after the supported transition period.
- Migration scripts only after the retention policy allows archival.

To delete the executable module implementation itself, Wattaman would first need a trusted executable extension runtime that can load isolated backend and frontend code from a package. The current declarative runtime cannot replace relational first-party modules.

## Deletion Goal

The safe end state is:

1. Every optional feature appears only as an extension installation.
2. Every owned mutation checks extension activation.
3. Every extension has a canonical `/extensions/{KEY}/...` UI route.
4. Shared platform contracts remain available to dependent extensions.
5. Legacy module pages and module-toggle systems are removed.
6. Core extension implementation and relational data remain in the application until an executable extension runtime exists.

## Source Reviewed

- `backend/src/module-registry/module-registry.ts`
- Backend controllers and services protected by `@RequiresAddon(...)`
- Related Prisma models in `backend/prisma/schema.prisma`
- Module-tagged navigation in `frontend/lib/*-nav.ts`
- Existing admin, teacher, employee, reporter, accounter, parent, and student pages
- Extension installation, activation, update, disable, and uninstall behavior

## Extension Strategy

Most existing modules operate on relational school data and cannot be faithfully recreated as generic `DECLARATIVE_MODULE` packages backed only by `ExtensionRecord` JSON.

They should become first-party `CORE_MODULE` extensions with:

- A stable extension key.
- A versioned internal manifest.
- Explicit managed capabilities.
- Explicit shared capabilities.
- Extension-owned navigation routes.
- Existing relational Prisma models.
- Tenant-scoped authorization.
- Installation and activation gates.
- Safe disable and uninstall behavior.
- Lifecycle, compatibility, and tenant-isolation tests.

Normal uninstall must preserve relational school data unless a separate, warned platform-admin purge is explicitly requested.

## Module Summary

| Key | Extension | Category | Runtime | Current backend gate | Conversion complexity |
| --- | --- | --- | --- | --- | --- |
| `ATTENDANCE` | Attendance Management | Academics | `CORE_MODULE` | Strong, spread across four domains | Very high |
| `CLASSES` | Class Management | Academics | `CORE_MODULE` | Strong with shared read exceptions | In progress |
| `FEES` | Fee Management | Finance | `CORE_MODULE` | Strong | High |
| `SALARY` | Salary Management | Finance | `CORE_MODULE` | Strong | Medium |
| `EXAMS` | Exams and Scoring | Academics | `CORE_MODULE` | Strong across exams and scoring | Very high |
| `CARD_DESIGNER` | ID Card Designer | Tools | `CORE_MODULE` | Template API gated | High |
| `BUS` | School Bus Operations | Transport | `CORE_MODULE` | Strong | Very high |
| `STUDENT_PORTAL` | Student Portal | People | `CORE_MODULE` | Mixed into Classes and Auth | Very high |
| `TEACHER_PORTAL` | Teacher Portal | People | `CORE_MODULE` | List endpoint gated; mutations not fully gated | High |
| `PARENT_PORTAL` | Parent Portal | People | `CORE_MODULE` | Partially gated | High |
| `TIMETABLE` | Timetable | Academics | `CORE_MODULE` | Strong with shared reads | Very high |
| `PART_TIME_TEACHER` | Part-Time Teacher and Reports | People | `CORE_MODULE` | Mixed into Timetable | Very high |
| `CHAT` | Communication Hub | Communication | `CORE_MODULE` | Moderation gated; messaging partially shared | High |
| `LATEX_EDITOR` | LaTeX Editor | Tools | Client extension | Navigation only | Low |

---

## 1. Attendance Management

### Current Key

`ATTENDANCE`

### Existing Features to Copy

- Record individual student attendance.
- Bulk record student attendance.
- Student check-out.
- Staff attendance recording.
- Staff check-out.
- Automatic staff scanning.
- Employee self-scan.
- Camera and QR attendance workflows.
- Wattaman scanner workflow.
- Read student attendance records.
- Read staff attendance records.
- Edit attendance status and permission type.
- Create missing student or staff records.
- Delete incorrect attendance records.
- Student daily attendance reports.
- Staff daily and monthly reports.
- Attendance dashboards and summaries.
- Class attendance progress.
- Monthly trends.
- Class summaries and detailed grids.
- CSV and XLSX export.
- Printable student and staff reports.
- Employee personal attendance reports.
- Session configuration.
- Global and class-specific session formats.
- Attendance format rules.
- Staff weekly schedules.
- Holiday management and holiday checks.

### Existing UI Routes

- `/admin/camera`
- `/admin/attendance`
- `/admin/attendance/edit`
- `/admin/staff-attendance`
- `/admin/staff-attendance/edit`
- `/admin/reports`
- `/admin/staff-reports`
- `/admin/session-settings`
- `/admin/holidays`
- `/teacher/camera`
- `/teacher/attendance`
- `/teacher/staff-attendance`
- `/teacher/reports`
- `/employee/scan`
- `/employee/reports`
- `/wattaman/scan`
- `/wattaman/usb-scan`

### Roles

`ADMIN`, `CLASS_ADMIN`, `TEACHER`, `EMPLOYEE`, `WATTAMAN`, `WATTAMAN_REPORTER`

### Relational Data

- `Attendance`
- `StaffAttendance`
- `SessionConfig`
- `AttendanceFormatRule`
- `StaffWeeklySchedule`
- `Holiday`
- `CardAlias`
- Shared reads from `Class`, `Student`, `User`, `StudyYear`, and `Department`

### Dependencies

- Required shared capability: class and roster reads.
- Optional integration: ID cards and aliases.
- Optional integration: notifications and reports.

### Required Extension Boundaries

- Attendance owns attendance events, sessions, format rules, holidays, and attendance reports.
- It must not own classes, students, users, or departments.
- Shared class and roster reads must continue if Class Management is disabled.
- Scanning endpoints need explicit device and role capabilities.

### Current Gaps

- Functionality is distributed across attendance, reports, holidays, and session-config controllers.
- Some system reports are intentionally ungated and must remain platform capabilities.
- Navigation is spread across six role dashboards.

### Recommended First Release

Version `1.1.0` should combine all attendance-owned pages under extension navigation while preserving role-specific entry points.

---

## 2. Class Management

### Current Key

`CLASSES`

### Existing Features to Copy

- Create, edit, and delete classes.
- Assign teachers and class administrators.
- Associate classes with study years.
- Configure schedules.
- Configure registration status.
- Configure thumbnails and descriptions.
- Configure class price visibility.
- Search, filter, sort, list, and grid views.
- Link classes to timetables.
- Manage study years and select the current study year.
- Read classes assigned to a teacher or class administrator.
- Shared roster reads for dependent extensions.

### Existing UI Routes

- Canonical: `/extensions/CLASSES/manage`
- Legacy redirect: `/admin/classes`
- `/admin/study-years`
- `/admin/classes/[id]`
- `/teacher/classes`

### Roles

`ADMIN`, `CLASS_ADMIN`, with shared reads for `TEACHER`

### Relational Data

- `Class`
- `StudyYear`
- Shared relationships to students, attendance, sessions, exams, assignments, announcements, courses, registrations, and timetables

### Dependencies

- Teacher lookup.
- Class-administrator lookup.
- Optional timetable integration.
- Optional Student Portal integration.
- Shared consumers: attendance, exams, scoring, reports, fees, courses, assignments, and registrations.

### Required Extension Boundaries

- Class CRUD and study-year management belong here.
- Student mutations belong to `STUDENT_PORTAL`.
- Class and roster reads remain shared platform contracts.
- Assignments, exams, courses, and timetable workflows remain separate extensions.

### Current Status

- Version `1.1.0` extension metadata exists.
- Explicit capabilities and shared capabilities exist.
- The canonical extension management route exists.
- Existing installations receive an available update marker.

---

## 3. Fee Management

### Current Key

`FEES`

### Existing Features to Copy

- List students for fee assignment.
- Create, edit, and delete fee records.
- Record partial and full payments.
- Calculate pending, partial, paid, and overdue states.
- Fee summary metrics.
- Finance and budget dashboard.
- Fee settings.
- Invoice generation and printing.
- QR student lookup for payment.
- Fee export.
- Accounter-specific dashboard and records.
- Parent read access to a child's fees.

### Existing UI Routes

- `/admin/fees`
- `/admin/fees/settings`
- `/admin/budget-report`
- `/accounter`
- `/accounter/fees`
- `/accounter/budget`
- `/accounter/settings`
- `/parent/fees`

### Roles

`ADMIN`, `ACCOUNTER`, shared parent read access

### Relational Data

- `FeeRecord`
- `FeePayment`
- `FeeSettings`
- Shared `Student` data

### Dependencies

- Student lookup and identity.
- Optional Parent Portal read integration.
- Optional ID card or QR integration.

### Required Extension Boundaries

- Fee records, payments, settings, invoices, and finance summaries belong here.
- Student identity remains a shared platform contract.
- Parent fee views should use a read-only capability rather than owning finance data.

### Current Gaps

- Parent fee endpoints are located in the Parent controller and are not governed directly by the Fee extension gate.
- Admin and accounter UI routes should become extension-owned routes.

---

## 4. Salary Management

### Current Key

`SALARY`

### Existing Features to Copy

- List eligible staff.
- Create salary records.
- Edit salary records.
- Mark salary as paid or unpaid.
- Delete salary records.
- Filter by month and year.
- Salary totals and summary cards.
- Payment-state display.

### Existing UI Route

- `/admin/salary`

### Roles

`ADMIN`

### Relational Data

- `Salary`
- Shared `User` staff identity

### Dependencies

- Staff directory lookup.

### Required Extension Boundaries

- Salary amounts and payment state belong here.
- Staff accounts remain a shared platform capability.

### Conversion Notes

This is one of the cleanest relational modules and is a good early conversion candidate.

---

## 5. Exams and Scoring

### Current Key

`EXAMS`

### Existing Features to Copy

- Create and edit exams.
- Configure exam questions.
- Publish, activate, complete, and delete exams.
- Assign exams to classes.
- Student exam discovery and attempt start.
- Save answers and submit attempts.
- View attempt results.
- Teacher and admin grading.
- Reset attempts.
- Score-sheet creation and editing.
- Assign classes to score sheets.
- Add scoring subjects.
- Import timetable subjects.
- Configure exam tabs.
- Enter individual and bulk scores.
- Grade scales, GPA, formulas, and printable reports.
- Teacher gradebook and exam management.

### Existing UI Routes

- `/admin/exams`
- `/admin/scoring`
- `/admin/scoring/print`
- `/teacher/exams`
- `/teacher/exams/new`
- `/teacher/exams/[id]/edit`
- `/teacher/exams/[id]/attempts`
- `/teacher/gradebook`
- `/student/exams`
- `/student/exams/[id]`
- `/student/scores`

### Roles

`ADMIN`, `CLASS_ADMIN`, `TEACHER`, `STUDENT`

### Relational Data

- `Exam`
- `ExamQuestion`
- `ExamAttempt`
- `ScoreSheet`
- `ScoreSheetClass`
- `ScoreSubject`
- `ScoreExamTab`
- `ScoreEntry`
- Shared `Class`, `Student`, `TimetableSubject`, and `Notification`

### Dependencies

- Shared class and roster reads.
- Optional timetable subject lookup.
- Notification capability.

### Required Extension Boundaries

- Exams, attempts, grading, score sheets, and grade calculations belong here.
- Classes, students, and timetable subjects remain shared contracts.

### Current Gaps

- The feature is split between two backend domains and many role-specific pages.
- Gradebook navigation is not consistently tagged with `EXAMS`.
- Class-detail exam panels must become cross-extension links rather than embedded ownership.

---

## 6. ID Card Designer

### Current Key

`CARD_DESIGNER`

### Existing Features to Copy

- Create card and certificate templates.
- Edit templates using the designer.
- Activate templates by card type.
- Delete templates.
- Student ID card design and printing.
- Staff ID card design and printing.
- Part-time teacher card design.
- Certificate design and printing.
- Load active templates for authenticated users.
- Export or print generated cards.

### Existing UI Routes

- `/admin/card-designer`
- `/admin/card-designer/new`
- `/admin/card-designer/student`
- `/admin/card-designer/staff`
- `/admin/card-designer/teacher-part-time`
- `/admin/card-designer/print`
- `/admin/student-cards`
- `/admin/staff-cards`
- `/admin/certificate`

### Roles

`ADMIN`, with authenticated read access to active templates

### Relational Data

- `CardTemplate`
- Shared student, staff, class, and school presentation data

### Dependencies

- Student directory.
- Staff directory.
- Class lookup.
- School appearance and branding.

### Required Extension Boundaries

- Templates, design state, activation, and rendering belong here.
- Student and staff records remain read-only shared data.
- Template reads required by card display must be a shared capability.

### Current Gaps

- Only template APIs are directly gated; several print/data pages call shared endpoints.
- Large client-side editor assets need extension-owned route organization.

---

## 7. School Bus Operations

### Current Key

`BUS`

### Existing Features to Copy

- Bus fleet CRUD.
- Driver and assistant information.
- Capacity and status management.
- Route CRUD.
- Ordered route stops.
- Stop coordinates and pickup/drop-off details.
- Student rider assignments.
- Pickup and drop-off stop assignment.
- Bus schedules.
- Admin lookup options.
- Live bus location updates.
- Latest bus location display.
- Location history.
- Parent and student bus views.
- Teacher bus visibility.
- Wattaman location reporting.

### Existing UI Routes

- `/admin/bus`
- `/parent/bus`

### Roles

`ADMIN`, `TEACHER`, `PARENT`, `STUDENT`, `WATTAMAN`

### Relational Data

- `Bus`
- `BusRoute`
- `BusStop`
- `BusStudentAssignment`
- `BusSchedule`
- `BusLocation`
- Shared `Student` and `User`

### Dependencies

- Student and guardian identity.
- Optional mapping provider.
- Optional realtime transport or WebSocket capability.

### Required Extension Boundaries

- Fleet, routes, stops, riders, schedules, and location history belong here.
- Student and guardian records remain shared capabilities.
- Live location ingestion requires an approved realtime capability, not generic declarative records.

### Current Status

The existing core bus backend is much more functional than the declarative School Bus example package. The first-party extension must wrap the core implementation instead of replacing it with generic JSON forms.

---

## 8. Student Portal

### Current Key

`STUDENT_PORTAL`

### Existing Features to Copy

- List students by class.
- Add existing or newly registered students to a class.
- Create student accounts.
- Edit student profile information.
- Assign parents.
- Reset student passwords.
- Remove student accounts and related owned records.
- CSV bulk import.
- Preserve QR card aliases.
- Clean orphaned student records.
- Read custom registration fields.
- Student dashboard and portal access.

### Existing UI Routes

- `/admin/students`
- Student role dashboard and student pages

### Roles

`ADMIN`, `CLASS_ADMIN`, limited `TEACHER`, `STUDENT`

### Relational Data

- `Student`
- Student `User`
- `CardAlias`
- `RefreshToken`
- Shared `Class`, `Parent`, registration fields, attendance, fees, exams, courses, and assignments

### Dependencies

- Shared class and roster contracts.
- Optional Parent Portal integration.
- Optional Class Registration integration.

### Required Extension Boundaries

- Student-account and student-profile mutations belong here.
- Class CRUD remains in Class Management.
- Dependent records owned by other extensions require safe deletion contracts.

### Current Gaps

- Student operations are implemented inside `ClassesController` and `ClassesService`.
- Account creation and password reset use general Auth endpoints that are not fully extension-gated.
- Destructive student deletion crosses many module-owned tables.

### Required Refactor

Create a dedicated Student Portal controller and service, then leave only shared roster reads in the Classes domain.

---

## 9. Teacher Portal

### Current Key

`TEACHER_PORTAL`

### Existing Features to Copy

- List teacher accounts.
- Search and filter teachers.
- Create teacher accounts.
- Edit teacher identity and contact details.
- Upload or update teacher photos.
- Reset passwords.
- Remove teacher accounts with dependency checks.

### Existing UI Route

- `/admin/teachers`

### Roles

`ADMIN`

### Relational Data

- Teacher `User`
- Relationships to classes, timetables, exams, assignments, courses, announcements, and attendance

### Dependencies

- Auth and identity management.
- Dependency checks for assigned classes and academic records.

### Required Extension Boundaries

- Teacher-directory mutations belong here.
- Authentication remains a platform service.
- Teacher academic activity remains owned by academic extensions.

### Current Gaps

- Only the role-specific list endpoint is explicitly gated.
- Create, edit, photo, password, and delete operations use general Auth APIs and can bypass the extension gate.

### Required Refactor

Add dedicated Teacher Portal mutation endpoints and stop using unrestricted Auth management endpoints from the extension UI.

---

## 10. Parent Portal

### Current Key

`PARENT_PORTAL`

### Existing Features to Copy

- List parent accounts.
- Create, edit, reset, and remove parent accounts.
- Link parents to students.
- Review parent-link requests.
- Parent child list.
- Child attendance view.
- Child grade view.
- Child fee view.
- Student view of linked parent.
- Student request to link a parent.

### Existing UI Routes

- `/admin/parents`
- `/admin/parent-requests`
- Parent dashboard and child pages

### Roles

`ADMIN`, `PARENT`, `STUDENT`

### Relational Data

- Parent `User`
- `ParentLinkRequest`
- Shared `Student`, `Attendance`, `FeeRecord`, assignments, messages, and notifications

### Dependencies

- Student Portal identity.
- Read-only integrations with Attendance, Exams/Scoring, Fees, and Communication.

### Required Extension Boundaries

- Parent account management and linking belong here.
- Child academic and finance data remain read-only capabilities from other extensions.
- Parent login and authentication remain platform services.

### Current Gaps

- Only parent listing and admin link-request operations are directly gated.
- Parent mutations use general Auth APIs.
- Child attendance, grades, and fees need capability-aware behavior when source extensions are absent.

---

## 11. Timetable

### Current Key

`TIMETABLE`

### Existing Features to Copy

- Create and manage timetables.
- Configure timetable settings and period times.
- Create subjects.
- Create timetable class entries.
- Create classrooms.
- Create lessons.
- Create and move schedule entries.
- Remove schedule entries.
- Automatic timetable generation.
- Teacher time-off rules.
- Color configuration.
- Grid and print layouts.
- Shared timetable lookup for dependent modules.

### Existing UI Routes

- `/admin/timetable`
- `/admin/timetable/subjects`
- `/admin/timetable/classes`
- `/admin/timetable/classrooms`
- `/admin/timetable/lessons`
- `/admin/timetable/schedule`

### Roles

`ADMIN`, with shared reads for authenticated academic workflows

### Relational Data

- `Timetable`
- `TimetableSubject`
- `TimetableClass`
- `TimetableClassroom`
- `TimetableLesson`
- `TimetableEntry`
- Shared `Class` and `User`

### Dependencies

- Shared class lookup.
- Shared teacher lookup.
- Optional Part-Time Teacher extension.
- Optional Exams/Scoring subject import.

### Required Extension Boundaries

- Timetable structure and entries belong here.
- Part-time teacher contracts and attendance belong to `PART_TIME_TEACHER`.
- Timetable reads used by other extensions remain shared capabilities.

### Current Gaps

- Part-time teacher operations share the same controller and service.
- Several timetable list reads are intentionally ungated and need explicit shared capabilities.
- The existing UI is very large and should be split into extension-owned components without losing functionality.

---

## 12. Part-Time Teacher and Reports

### Current Key

`PART_TIME_TEACHER`

### Existing Features to Copy

- Create and manage scheduled or contract teachers.
- Teacher contract and timetable assignment.
- Teacher attendance scanning.
- Wattaman teacher scanning.
- Manual teacher attendance marking.
- Monthly teacher attendance.
- Teacher attendance reports and printing.
- Scheduled teacher list and card support.

### Existing UI Routes

- `/wattaman/scheduled-teacher`
- `/wattaman/scheduled-teacher/print`
- `/wattaman/teacher-scan`
- `/wattaman/teacher-reports`
- `/wattaman/teacher-reports/print`
- `/admin/timetable/teachers`
- `/admin/timetable/teacher-attendance`

### Roles

`ADMIN`, `WATTAMAN`, `WATTAMAN_REPORTER`, scheduled teachers where applicable

### Relational Data

- `TimetableTeacher`
- `TimetableTeacherAttendance`
- Shared `Timetable`, timetable relationships, `User`, and attendance format rules

### Dependencies

- Timetable shared capability.
- User identity.
- Optional Card Designer integration.

### Required Extension Boundaries

- Scheduled teacher records, contracts, scans, and reports belong here.
- Core timetable structure remains owned by `TIMETABLE`.

### Current Gaps

- Backend logic is embedded inside Timetable controller and service.
- Some teacher attendance scan endpoints are deliberately ungated from Timetable but are not explicitly assigned to Part-Time Teacher.
- Wattaman navigation does not consistently tag the teacher-scan route.

### Required Refactor

Extract a dedicated controller and service before creating the extension-owned UI routes.

---

## 13. Communication Hub

### Current Key

`CHAT`

### Existing Features to Copy

- Inbox and conversation list.
- Teacher and parent/student recipient discovery.
- Send messages.
- Mark conversations as read.
- Broadcast announcements.
- Target announcements to classes or audiences.
- Announcement feed.
- Announcement unread count.
- Mark announcements as read.
- Admin announcement history.
- Delete announcements.
- Portal activity audit view.

### Existing UI Route

- `/admin/communication`
- Related teacher, student, and parent messaging pages

### Roles

`ADMIN`, `TEACHER`, `STUDENT`, `PARENT`

### Relational Data

- `Message`
- `Announcement`
- `AnnouncementRead`
- `Notification`
- `NotificationPreference`
- Shared `User`, `Student`, and `Class`

### Dependencies

- User and role directory.
- Shared class lookup for targeted announcements.
- Notification capability.
- Audit read capability for portal activity.

### Required Extension Boundaries

- Messages, announcements, reads, moderation, and communication preferences belong here.
- User and class identity remain shared capabilities.

### Current Gaps

- Only announcement administration and deletion are directly tagged with `CHAT`.
- Message APIs and regular announcement feed/create routes are not consistently extension-gated.
- Teacher messaging and announcements navigation is not consistently tagged with `CHAT`.

### Required Refactor

Apply the Communication capability gate to all owned message and announcement mutations while deciding whether read-only system announcements remain a platform capability.

---

## 14. LaTeX Editor

### Current Key

`LATEX_EDITOR`

### Existing Features to Copy

- Live LaTeX editing.
- Formula snippet insertion.
- Rendered preview.
- Copy raw LaTeX.
- Copy rendered HTML.
- Download SVG.
- Download PNG.
- Client-side reference tools.

### Existing UI Route

- `/tools/latex-editor`

### Roles

Any role whose navigation includes the extension

### Relational Data

None.

### Dependencies

Client rendering libraries only.

### Required Extension Boundaries

- This is suitable for a client-only first-party extension.
- No backend gate is needed because it has no backend APIs.
- Navigation and route access should still require an active installation.

### Current Gaps

- Sidebar filtering hides navigation, but direct URL access may remain possible.
- Add a route-level installation check for complete enforcement.

---

## Modules Not Yet Registered but Functionally Extension-Like

The following feature groups exist in the application but are not currently independent entries in `MODULE_REGISTRY`:

- Class Registration
- Assignments
- Courses and learning content
- H5P content
- Backup and Restore
- Posts and public site content
- Appearance and themes
- Notifications
- Audit and compliance
- Staff CV and profile management
- Departments and employee management

These should be reviewed after the 14 registered modules are converted. Some are platform capabilities rather than optional extensions.

## Shared Capability Catalog

To prevent one disabled extension from breaking another, introduce shared read capabilities.

### Identity

- `users:read_basic`
- `teachers:lookup`
- `staff:lookup`
- `parents:lookup`
- `students:lookup`

### Academics

- `classes:read`
- `classes:read_assigned`
- `classes:roster_read`
- `study_years:read`
- `timetables:read`
- `timetable_subjects:read`

### Cross-Extension Data

- `attendance:child_read`
- `fees:child_read`
- `grades:child_read`
- `card_templates:active_read`
- `notifications:send`
- `audit:portal_activity_read`

Shared capabilities must be read-only unless the owning extension explicitly grants a mutation contract.

## Recommended Conversion Order

1. Complete `CLASSES` and establish the first-party extension pattern.
2. Convert `SALARY` because it has narrow ownership and few dependencies.
3. Convert `FEES` and define student and parent read contracts.
4. Extract and convert `TEACHER_PORTAL`.
5. Extract and convert `PARENT_PORTAL`.
6. Extract and convert `STUDENT_PORTAL`.
7. Convert `CARD_DESIGNER` and its shared data lookups.
8. Convert `TIMETABLE` while extracting Part-Time Teacher.
9. Convert `PART_TIME_TEACHER`.
10. Convert `EXAMS` and scoring.
11. Convert `ATTENDANCE` and its role-specific workflows.
12. Convert the existing relational `BUS` implementation.
13. Convert `CHAT` and close messaging gate gaps.
14. Convert `LATEX_EDITOR` as a client-only extension.

## Per-Module Implementation Checklist

Use this checklist for each extension:

- Confirm the stable key and display name.
- Document copied features from existing pages and APIs.
- Identify owned Prisma models.
- Identify shared read capabilities.
- Identify cross-extension dependencies.
- Add version and release notes to the module registry.
- Add explicit managed and shared capabilities.
- Add a canonical `/extensions/{KEY}/...` route.
- Redirect legacy management routes.
- Gate all owned backend mutations.
- Keep required shared reads available.
- Add role and tenant-isolation tests.
- Add disabled and uninstalled lifecycle tests.
- Preserve relational data on normal uninstall.
- Mark the new version available to existing schools.
- Run backend tests and production builds.
- Run frontend production build.
- Pilot with an existing school before broad activation.

## Legacy Deletion Checklist

Complete this checklist separately for every module. No legacy module should be deleted only because an extension catalog row exists.

### Evidence Required Before Deletion

- A published extension version exists.
- Existing schools have a valid `ExtensionInstallation`.
- New schools can request and install the extension.
- The complete copied feature works from extension-owned routes.
- Every owned API mutation is gated.
- Shared reads used by other extensions remain operational while disabled.
- Existing relational record counts match before and after migration.
- Disable, uninstall, reinstall, and upgrade tests pass.
- Tenant-isolation tests pass.
- Legacy and extension UI results match for representative schools.
- A rollback version and recovery procedure exist.

### Safe to Delete After Verification

- Legacy page entry points that only duplicate extension pages.
- Legacy sidebar links that duplicate extension navigation.
- Old module marketplace or add-on UI.
- `SchoolAddon` reads and writes after database migration verification.
- Duplicate `AddonDefinition` module records and module seeding paths.
- General Auth mutation usage replaced by portal-specific APIs.
- Controller methods moved to their correct extension-owned domain.
- Temporary adapters whose callers have all migrated.

### Never Delete During Normal Conversion

- Prisma models containing school data.
- Data migrations and backups still inside the retention period.
- Shared class, roster, user, and identity contracts.
- Audit history.
- Extension installation and version records.
- Controllers, services, and UI components still used by a `CORE_MODULE` extension.
- Foreign-key relationships required by another extension.

## Legacy Source Ownership Map

This map identifies the primary implementation that must be preserved or deliberately moved before legacy cleanup.

| Extension | Backend implementation | Primary frontend implementation | Legacy cleanup target |
| --- | --- | --- | --- |
| Attendance | `attendance`, `session-config`, `holidays`, attendance portions of `reports` | Admin/teacher/employee/reporter/Wattaman attendance and report pages | Static role navigation and legacy page routes after extension routes exist |
| Class Management | `classes` class CRUD, `study-years` | Class Management and study-year pages | `/admin/classes` redirect and duplicate static navigation |
| Fee Management | `fees`, fee reads currently exposed through `parent` | Admin and accounter finance pages | Legacy finance routes after extension route migration |
| Salary Management | `salary` | `/admin/salary` | Legacy salary page and navigation after extension ownership |
| Exams and Scoring | `exam`, `scoring` | Admin, teacher, and student exam/scoring pages | Duplicate class-detail panels and static routes |
| ID Card Designer | `card-templates` plus shared lookup APIs | Designer, card, certificate, and print pages | Legacy designer routes and duplicate navigation |
| School Bus | `bus` | Admin bus and parent bus pages | Declarative School Bus example if superseded; legacy `/admin/bus` route |
| Student Portal | Student operations currently inside `classes`; Auth user operations | `/admin/students` and student portal pages | Student methods in Classes after extraction; general Auth mutations from UI |
| Teacher Portal | `portal-manager` teacher list; Auth user operations | `/admin/teachers`, `PortalManager` | General Auth mutations after dedicated teacher APIs exist |
| Parent Portal | `portal-manager`, `parent`, Auth user operations | `/admin/parents`, parent requests, parent portal | General Auth mutations and ungated cross-extension reads |
| Timetable | Timetable-owned methods in `timetable` | Admin timetable pages | Legacy routes and Part-Time Teacher methods after extraction |
| Part-Time Teacher | Part-time teacher methods currently inside `timetable` | Wattaman teacher roster, scan, reports, timetable teacher pages | Embedded timetable methods after dedicated domain extraction |
| Communication Hub | `announcements`, messages and notification domains | Admin communication plus role messaging pages | Ungated message routes and duplicate role navigation |
| LaTeX Editor | No backend domain | `/tools/latex-editor` | Direct legacy tool route after extension-owned client route exists |

## Module Removal Order

Removal must follow dependencies rather than deleting all legacy modules at once.

1. Remove duplicate catalog and navigation only after the corresponding extension route is active.
2. Remove legacy page entry points after redirects and usage telemetry show no remaining callers.
3. Extract mixed domains before deleting methods from shared controllers.
4. Migrate all `SchoolAddon` state to `ExtensionInstallation` and verify it.
5. Remove `SchoolAddon` application code.
6. Remove `AddonDefinition` module application code.
7. Keep relational implementations for `CORE_MODULE` extensions.
8. Consider deleting executable implementations only after a future isolated code-extension runtime can host them.

## Cross-Module Deletion Blockers

- Classes and rosters are consumed by Attendance, Exams, Scoring, Reports, Timetable, Fees, Assignments, Courses, and Card Designer.
- Student identity is consumed by Attendance, Fees, Exams, Bus, Parent Portal, Courses, Assignments, and cards.
- User identity is consumed by every role-based extension.
- Timetable subjects are consumed by Scoring.
- Parent views consume Attendance, Fees, grades, messages, and notifications.
- Card templates consume student, staff, class, and school branding data.
- Communication consumes users and classes.
- Part-Time Teacher currently shares Timetable models and services.

These dependencies must be replaced with shared capability contracts before deleting any legacy controller or service used across domains.

## Definition of a Complete Extension

A module is not considered converted merely because it appears in the extension catalog.

Conversion is complete only when:

- Its complete existing workflow is available from extension-owned routes.
- All owned mutations require an active installation.
- Shared reads are explicitly documented and tested.
- Other extensions continue working when it is disabled.
- Existing data remains relational and tenant-scoped.
- Existing schools can update without losing data.
- New schools can request, install, and activate it.
- Disable, uninstall, reinstall, and update policies work.
- Legacy routes redirect or are safely retired.
- Backend tests and frontend builds pass.

## Audit Findings Requiring Attention

- `STUDENT_PORTAL` mutations are still mixed into the Classes domain.
- `TEACHER_PORTAL` and `PARENT_PORTAL` use general Auth mutation endpoints that are not fully extension-gated.
- `PART_TIME_TEACHER` is still embedded in Timetable.
- `CHAT` does not consistently gate all messaging and announcement operations.
- `LATEX_EDITOR` has navigation gating but needs direct-route enforcement.
- Parent finance and grade views need source-extension capability checks.
- Several role-specific navigation entries are not tagged consistently with their owning extension.
- Existing first-party extensions should publish new immutable versions instead of editing published manifests in place.
