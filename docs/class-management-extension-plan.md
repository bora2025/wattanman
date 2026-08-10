# Class Management Extension Plan

## Status

Implementation started on 2026-08-10. The first-party extension foundation is complete for version `1.1.0`; deeper UI decomposition may continue in later releases.

### Implemented Foundation

- Preserved the stable `CLASSES` key so existing installations and API gates remain compatible.
- Added explicit managed and shared capability ownership to the core extension registry.
- Added the dedicated `/extensions/CLASSES/manage` extension route.
- Kept the full existing class-management interface available through that route.
- Kept student mutations assigned to `STUDENT_PORTAL`.
- Kept class and roster reads available as shared contracts for attendance, exams, reports, and other dependent extensions.
- Published the new extension metadata as immutable version `1.1.0` rather than modifying `1.0.0`.
- Marked `1.1.0` as an available update for existing installations during registry bootstrap.
- Added regression tests for registry metadata and controller capability boundaries.

## Objective

Create a complete `CLASS_MANAGEMENT` extension that preserves the existing class-management functionality while participating in the platform extension lifecycle: publication, installation, activation, updates, disabling, and removal.

The extension must continue using the existing relational class data. It must not recreate classes as isolated declarative extension records.

## Existing Architecture

### Backend

- `backend/src/classes/classes.controller.ts` exposes class CRUD, class listings, roster reads, and student-management routes.
- `backend/src/classes/classes.service.ts` contains class validation, teacher and class-admin assignment, class CRUD, roster operations, CSV student import, and student updates.
- `backend/prisma/schema.prisma` defines the relational `Class` model and its relationships with schools, teachers, class administrators, study years, students, attendance, exams, assignments, announcements, courses, registrations, and session configuration.

### Frontend

- `frontend/app/admin/classes/page.tsx` provides the main class-management experience.
- The page includes list and grid modes, filtering, sorting, teacher assignment, class-admin assignment, study-year selection, schedules, thumbnails, public registration settings, pricing, timetable linking, and roster-management actions.
- `frontend/app/admin/classes/[id]/page.tsx` provides class-level access to assignments, exams, and courses.

### Current Extension Runtime Limitation

The declarative extension runtime stores generic JSON data in `ExtensionRecord`. It does not provide safe relational access to core classes, users, students, study years, exams, attendance, or timetables.

Therefore, Class Management cannot be implemented as only a generic declarative form and table package. It needs a platform-approved capability bridge or a first-party extension runtime that operates on the existing class domain.

## Ownership Boundaries

### Owned by Class Management

- Create classes.
- Edit class information.
- Delete classes with dependency protection.
- Search, filter, sort, and display classes.
- Assign teachers.
- Assign class administrators.
- Associate classes with study years.
- Configure schedules.
- Configure public registration visibility.
- Configure descriptions and thumbnails.
- Configure class price visibility.
- Link a class to a timetable.
- Display class-level summaries.

### Shared Platform Contracts

These operations must remain available to other installed extensions even when Class Management is disabled:

- Read available classes.
- Read classes assigned to the current teacher or class administrator.
- Read class rosters.
- Batch-read students grouped by class.
- Resolve class identity and relationships.

### Owned by Other Extensions

- Student creation, editing, CSV import, parent linking, and account removal belong to `STUDENT_PORTAL`.
- Attendance workflows belong to the attendance extension.
- Exams and gradebook workflows belong to their academic extensions.
- Assignments and courses belong to their respective extensions.
- Public class-registration workflow belongs to the class-registration extension.
- Timetable construction belongs to the timetable extension.

Class Management may link to these extensions when installed, but must not duplicate their features.

## Proposed Extension Definition

- Key: `CLASS_MANAGEMENT`
- Name: `Class Management`
- Commercial type: `MODULE`
- Runtime: first-party capability-backed module
- Initial version: `1.0.0`
- Platform range: `>=1.0.0 <2.0.0`
- Primary roles: `ADMIN`, `CLASS_ADMIN`

## Capability Contract

Introduce explicit capabilities rather than allowing unrestricted access to core tables.

### Read Capabilities

- `classes:read`
- `classes:read_assigned`
- `classes:roster_read`
- `teachers:lookup`
- `class_admins:lookup`
- `study_years:lookup`
- `timetables:lookup`

### Management Capabilities

- `classes:create`
- `classes:update`
- `classes:delete`
- `classes:registration_settings`
- `classes:timetable_link`

Every capability must enforce the current school tenant and the current user's role.

## Implementation Stages

### Stage 1: Domain Separation

- Separate class CRUD from student-account and roster-management operations.
- Create validated request DTOs for class creation and updates.
- Preserve shared class and roster read contracts.
- Define dependency checks for class deletion.
- Add audit events for create, update, delete, activation, and denied capability access.

### Stage 2: Extension Capability Bridge

- Add the first-party Class Management extension definition.
- Map extension installation and activation to `classes:manage` authorization.
- Keep shared read capabilities independent from management activation.
- Ensure disabled or uninstalled extensions cannot mutate classes.
- Return a clear extension-not-active error instead of a generic authorization failure.

### Stage 3: Extension UI

- Create an extension-native Class Management route and navigation entry.
- Rebuild class list and grid layouts.
- Add search, study-year filters, teacher filters, registration-status filters, and sorting.
- Add create and edit forms.
- Add teacher, class-admin, and study-year selectors.
- Add schedule, thumbnail, description, registration status, price, and price-visibility controls.
- Add timetable-linking actions when the timetable extension is active.
- Add responsive loading, empty, error, and permission states.

### Stage 4: Cross-Extension UX

- Show roster totals without taking ownership of student CRUD.
- Link to Student Portal when it is installed and active.
- Link to attendance, assignments, exams, courses, and timetable pages when available.
- Hide unavailable cross-extension actions or show an installation requirement.
- Keep Class Management usable when optional academic extensions are absent.

### Stage 5: Existing Data Migration

- Reuse all existing `Class` records and IDs.
- Provision `CLASS_MANAGEMENT` installations for schools currently entitled to `CLASSES`.
- Map the legacy `CLASSES` module state to the new extension installation state.
- Preserve teacher, class-admin, study-year, student, attendance, exam, assignment, course, and registration relationships.
- Add a migration verification script with school and record counts.
- Keep temporary redirects from legacy class-management URLs.

### Stage 6: Lifecycle Behavior

#### Install

- Register the extension for the school.
- Add extension navigation after platform-admin activation.
- Do not create or duplicate class records.

#### Disable

- Hide Class Management navigation.
- Block create, update, delete, and timetable-link actions.
- Preserve shared class and roster reads for dependent extensions.

#### Uninstall

- Remove the school's extension installation and navigation.
- Retain all relational class data by default.
- Record the uninstall operation in the audit log.

#### Permanent Data Purge

- Do not include class-data deletion in normal uninstall.
- Provide a separate platform-admin-only purge workflow if required later.
- Require dependency analysis, explicit confirmation, and a backup warning.

### Stage 7: Testing

- Test class creation and validation.
- Test teacher and class-admin role validation.
- Test class updates and optional relationship clearing.
- Test protected class deletion.
- Test `CLASS_ADMIN` access to assigned classes only.
- Test cross-school tenant isolation.
- Test disabled-extension mutation denial.
- Test shared reads while the extension is disabled.
- Test compatibility with attendance, exams, gradebook, reports, fees, and timetable.
- Test migration against existing class data.
- Test install, activate, disable, uninstall, reinstall, and update-policy workflows.

### Stage 8: Package and Rollout

- Create the versioned Class Management extension package.
- Validate the package and compatibility range.
- Publish it through the platform-admin extension workflow.
- Pilot it with one test school containing existing class data.
- Compare class and relationship counts before and after activation.
- Roll out to existing schools in batches.
- Monitor API failures, denied capabilities, migration verification, and operator feedback.

## UI Requirements

- Keep list and grid views.
- Preserve saved view and sorting preferences.
- Support desktop and mobile layouts.
- Clearly separate class management from student management.
- Show installed-extension dependencies beside optional actions.
- Provide confirmation before destructive actions.
- Explain why deletion is blocked when dependent records exist.
- Display activation status and update availability without distracting from daily class work.

## Security Requirements

- Scope every operation to the active school tenant.
- Do not accept a school ID from the browser for class mutations.
- Require `ADMIN` or properly scoped `CLASS_ADMIN` authorization.
- Validate teacher and class-admin assignments inside the same tenant.
- Deny undeclared extension capabilities.
- Audit destructive operations and authorization failures.
- Preserve core data when an extension is disabled or uninstalled.

## Acceptance Criteria

- Installing and activating `CLASS_MANAGEMENT` provides the complete existing class-management experience.
- Existing classes and relationships remain unchanged.
- Disabling the extension blocks class mutations but does not break attendance, exams, reports, fees, or timetables.
- Student management remains independently controlled by `STUDENT_PORTAL`.
- Class administrators can access only their assigned classes.
- Platform administrators can publish, install, activate, disable, update, and uninstall the extension.
- Normal uninstall never deletes relational class data.
- Tenant-isolation and lifecycle tests pass.
- Production backend and frontend builds pass.

## Recommended Implementation Order

1. Add tests that capture current class behavior.
2. Separate class CRUD from student-management responsibilities.
3. Implement the capability-backed extension authorization layer.
4. Build the extension-native Class Management UI.
5. Add cross-extension links and dependency states.
6. Add migration and backfill logic.
7. Validate lifecycle and tenant isolation.
8. Package, pilot, and publish version `1.0.0`.

## Open Decisions Before Coding

- Confirm whether the runtime name should remain `CORE_MODULE` or become `FIRST_PARTY_MODULE`.
- Confirm whether legacy `/admin/classes` should redirect immediately or remain during a transition period.
- Confirm whether class registration settings stay inside Class Management or move entirely to the class-registration extension.
- Confirm the deletion policy for classes that already contain attendance, exams, assignments, courses, or registrations.
- Confirm whether uninstall should retain the school's entitlement for later reinstall.
