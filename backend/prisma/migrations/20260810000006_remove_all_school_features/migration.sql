-- IRREVERSIBLE: removes all non-core school feature data requested on 2026-08-10.
-- Preserved domains: authentication, schools, platform extension control-plane,
-- audit, site settings, posts, and backup infrastructure.

TRUNCATE TABLE
  "PageResponse",
  "LessonAttempt",
  "LessonView",
  "CourseAttendance",
  "CourseSession",
  "CourseEnrollment",
  "LessonPage",
  "CourseLesson",
  "Course",
  "QuizAnswer",
  "QuizQuestion",
  "AssignmentSubmission",
  "Assignment",
  "ExamAttempt",
  "ExamQuestion",
  "Exam",
  "ScoreEntry",
  "ScoreExamTab",
  "ScoreSubject",
  "ScoreSheetClass",
  "ScoreSheet",
  "TimetableTeacherAttendance",
  "TimetableEntry",
  "TimetableLesson",
  "TimetableTeacher",
  "TimetableClassroom",
  "TimetableClass",
  "TimetableSubject",
  "Timetable",
  "BusLocation",
  "BusSchedule",
  "BusStudentAssignment",
  "BusStop",
  "BusRoute",
  "Bus",
  "Salary",
  "FeePayment",
  "FeeRecord",
  "FeeSettings",
  "CardTemplate",
  "AttendanceFormatRule",
  "StaffWeeklySchedule",
  "SessionConfig",
  "StaffAttendance",
  "Holiday",
  "Attendance",
  "CardAlias",
  "ClassRegistrationField",
  "ClassRegistrationSettings",
  "ClassRegistration",
  "ParentLinkRequest",
  "Student",
  "Class",
  "StudyYear",
  "AnnouncementRead",
  "Announcement",
  "Message",
  "NotificationPreference",
  "Notification",
  "StaffCertification",
  "StaffWorkExperience",
  "StaffEducation",
  "StaffProfile"
RESTART IDENTITY CASCADE;

DELETE FROM "ExtensionInstallation"
WHERE "extensionId" IN (
  SELECT "id" FROM "Extension" WHERE "runtimeType" = 'CORE_MODULE'
);

DELETE FROM "ExtensionDependency"
WHERE "extensionId" IN (
  SELECT "id" FROM "Extension" WHERE "runtimeType" = 'CORE_MODULE'
)
OR "requiredExtensionId" IN (
  SELECT "id" FROM "Extension" WHERE "runtimeType" = 'CORE_MODULE'
);

DELETE FROM "Extension" WHERE "runtimeType" = 'CORE_MODULE';
DELETE FROM "SchoolAddon";
DELETE FROM "AddonDefinition" WHERE "kind" = 'MODULE';
