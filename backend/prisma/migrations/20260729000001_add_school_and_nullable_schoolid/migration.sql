-- Migration 1/2 of the multi-tenant conversion: adds the School table and a
-- NULLABLE schoolId column everywhere, plus new (non-schoolId-unique)
-- indexes and foreign keys. Deliberately backward-compatible: the
-- currently-running (pre-multi-tenant) application code does not read or
-- write schoolId, so it keeps working unmodified against this schema. Safe
-- to deploy alone, well before any application code change.
--
-- After this migration deploys, run backend/prisma/backfill-tenancy.ts once
-- against production to populate schoolId on every existing row and insert
-- the sentinel "platform" School row, BEFORE deploying migration 2.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mfaSecret" TEXT,
ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "Class" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "CardAlias" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "ParentLinkRequest" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "ClassRegistration" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "ClassRegistrationSettings" ADD COLUMN     "schoolId" TEXT,
ALTER COLUMN "id" DROP DEFAULT;


-- AlterTable
ALTER TABLE "ClassRegistrationField" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "StaffAttendance" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "SessionConfig" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "StaffWeeklySchedule" ADD COLUMN     "schoolId" TEXT,
ALTER COLUMN "id" DROP DEFAULT;


-- AlterTable
ALTER TABLE "StudyYear" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "Holiday" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "Department" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "RefreshToken" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "AuditCleanupSchedule" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "CardTemplate" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "AttendanceFormatRule" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "FeeRecord" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "FeePayment" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "Timetable" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "TimetableSubject" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "TimetableClass" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "TimetableClassroom" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "TimetableTeacher" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "TimetableLesson" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "TimetableEntry" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "TimetableTeacherAttendance" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "ScoreSheet" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "ScoreSheetClass" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "ScoreSubject" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "ScoreExamTab" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "ScoreEntry" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "Salary" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "StaffProfile" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "StaffEducation" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "StaffWorkExperience" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "StaffCertification" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "Bus" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "BusRoute" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "BusStop" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "BusLocation" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "Exam" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "ExamQuestion" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "ExamAttempt" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "Assignment" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "AssignmentSubmission" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "QuizQuestion" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "QuizAnswer" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "AnnouncementRead" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "NotificationPreference" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "Course" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "CourseLesson" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "LessonPage" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "CourseEnrollment" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "LessonAttempt" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "PageResponse" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "CourseSession" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "CourseAttendance" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "LessonView" ADD COLUMN     "schoolId" TEXT;


-- AlterTable
ALTER TABLE "FeeSettings" ADD COLUMN     "schoolId" TEXT,
ALTER COLUMN "id" DROP DEFAULT;


-- AlterTable
ALTER TABLE "SiteSetting" ADD COLUMN     "schoolId" TEXT,
ALTER COLUMN "id" DROP DEFAULT;


-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "schoolId" TEXT;


-- CreateTable
CREATE TABLE "School" (
    "id" TEXT NOT NULL,
    "subdomain" TEXT NOT NULL,
    "customDomain" TEXT,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "disabledModules" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "School_pkey" PRIMARY KEY ("id")
);


-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);


-- CreateTable
CREATE TABLE "SchoolAddon" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "addonKey" TEXT NOT NULL,
    "billingStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "activatedAt" TIMESTAMP(3),
    "activatedBy" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SchoolAddon_pkey" PRIMARY KEY ("id")
);


-- CreateIndex
CREATE UNIQUE INDEX "School_subdomain_key" ON "School"("subdomain");


-- CreateIndex
CREATE UNIQUE INDEX "School_customDomain_key" ON "School"("customDomain");


-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_token_key" ON "PasswordResetToken"("token");


-- CreateIndex
CREATE INDEX "PasswordResetToken_schoolId_idx" ON "PasswordResetToken"("schoolId");


-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");


-- CreateIndex
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");


-- CreateIndex
CREATE INDEX "SchoolAddon_schoolId_idx" ON "SchoolAddon"("schoolId");


-- CreateIndex
CREATE INDEX "User_schoolId_idx" ON "User"("schoolId");


-- CreateIndex
CREATE INDEX "Class_schoolId_idx" ON "Class"("schoolId");


-- CreateIndex
CREATE INDEX "Student_schoolId_idx" ON "Student"("schoolId");


-- CreateIndex
CREATE INDEX "CardAlias_schoolId_idx" ON "CardAlias"("schoolId");


-- CreateIndex
CREATE INDEX "Attendance_schoolId_idx" ON "Attendance"("schoolId");


-- CreateIndex
CREATE INDEX "Notification_schoolId_idx" ON "Notification"("schoolId");


-- CreateIndex
CREATE INDEX "ParentLinkRequest_schoolId_idx" ON "ParentLinkRequest"("schoolId");


-- CreateIndex
CREATE INDEX "ClassRegistration_schoolId_idx" ON "ClassRegistration"("schoolId");


-- CreateIndex
CREATE UNIQUE INDEX "ClassRegistrationSettings_schoolId_key" ON "ClassRegistrationSettings"("schoolId");


-- CreateIndex
CREATE INDEX "ClassRegistrationField_schoolId_idx" ON "ClassRegistrationField"("schoolId");


-- CreateIndex
CREATE INDEX "StaffAttendance_schoolId_idx" ON "StaffAttendance"("schoolId");


-- CreateIndex
CREATE INDEX "SessionConfig_schoolId_idx" ON "SessionConfig"("schoolId");


-- CreateIndex
CREATE UNIQUE INDEX "StaffWeeklySchedule_schoolId_key" ON "StaffWeeklySchedule"("schoolId");


-- CreateIndex
CREATE INDEX "StudyYear_schoolId_idx" ON "StudyYear"("schoolId");


-- CreateIndex
CREATE INDEX "Holiday_schoolId_idx" ON "Holiday"("schoolId");


-- CreateIndex
CREATE INDEX "Department_schoolId_idx" ON "Department"("schoolId");


-- CreateIndex
CREATE INDEX "RefreshToken_schoolId_idx" ON "RefreshToken"("schoolId");


-- CreateIndex
CREATE INDEX "AuditLog_schoolId_createdAt_idx" ON "AuditLog"("schoolId", "createdAt");


-- CreateIndex
CREATE INDEX "AuditCleanupSchedule_schoolId_idx" ON "AuditCleanupSchedule"("schoolId");


-- CreateIndex
CREATE INDEX "CardTemplate_schoolId_idx" ON "CardTemplate"("schoolId");


-- CreateIndex
CREATE INDEX "AttendanceFormatRule_schoolId_idx" ON "AttendanceFormatRule"("schoolId");


-- CreateIndex
CREATE INDEX "FeeRecord_schoolId_idx" ON "FeeRecord"("schoolId");


-- CreateIndex
CREATE INDEX "FeePayment_schoolId_idx" ON "FeePayment"("schoolId");


-- CreateIndex
CREATE INDEX "Timetable_schoolId_idx" ON "Timetable"("schoolId");


-- CreateIndex
CREATE INDEX "TimetableSubject_schoolId_idx" ON "TimetableSubject"("schoolId");


-- CreateIndex
CREATE INDEX "TimetableClass_schoolId_idx" ON "TimetableClass"("schoolId");


-- CreateIndex
CREATE INDEX "TimetableClassroom_schoolId_idx" ON "TimetableClassroom"("schoolId");


-- CreateIndex
CREATE INDEX "TimetableTeacher_schoolId_idx" ON "TimetableTeacher"("schoolId");


-- CreateIndex
CREATE INDEX "TimetableLesson_schoolId_idx" ON "TimetableLesson"("schoolId");


-- CreateIndex
CREATE INDEX "TimetableEntry_schoolId_idx" ON "TimetableEntry"("schoolId");


-- CreateIndex
CREATE INDEX "TimetableTeacherAttendance_schoolId_idx" ON "TimetableTeacherAttendance"("schoolId");


-- CreateIndex
CREATE INDEX "ScoreSheet_schoolId_idx" ON "ScoreSheet"("schoolId");


-- CreateIndex
CREATE INDEX "ScoreSheetClass_schoolId_idx" ON "ScoreSheetClass"("schoolId");


-- CreateIndex
CREATE INDEX "ScoreSubject_schoolId_idx" ON "ScoreSubject"("schoolId");


-- CreateIndex
CREATE INDEX "ScoreExamTab_schoolId_idx" ON "ScoreExamTab"("schoolId");


-- CreateIndex
CREATE INDEX "ScoreEntry_schoolId_idx" ON "ScoreEntry"("schoolId");


-- CreateIndex
CREATE INDEX "Salary_schoolId_idx" ON "Salary"("schoolId");


-- CreateIndex
CREATE INDEX "StaffProfile_schoolId_idx" ON "StaffProfile"("schoolId");


-- CreateIndex
CREATE INDEX "StaffEducation_schoolId_idx" ON "StaffEducation"("schoolId");


-- CreateIndex
CREATE INDEX "StaffWorkExperience_schoolId_idx" ON "StaffWorkExperience"("schoolId");


-- CreateIndex
CREATE INDEX "StaffCertification_schoolId_idx" ON "StaffCertification"("schoolId");


-- CreateIndex
CREATE INDEX "Bus_schoolId_idx" ON "Bus"("schoolId");


-- CreateIndex
CREATE INDEX "BusRoute_schoolId_idx" ON "BusRoute"("schoolId");


-- CreateIndex
CREATE INDEX "BusStop_schoolId_idx" ON "BusStop"("schoolId");


-- CreateIndex
CREATE INDEX "BusLocation_schoolId_idx" ON "BusLocation"("schoolId");


-- CreateIndex
CREATE INDEX "Exam_schoolId_idx" ON "Exam"("schoolId");


-- CreateIndex
CREATE INDEX "ExamQuestion_schoolId_idx" ON "ExamQuestion"("schoolId");


-- CreateIndex
CREATE INDEX "ExamAttempt_schoolId_idx" ON "ExamAttempt"("schoolId");


-- CreateIndex
CREATE INDEX "Assignment_schoolId_idx" ON "Assignment"("schoolId");


-- CreateIndex
CREATE INDEX "AssignmentSubmission_schoolId_idx" ON "AssignmentSubmission"("schoolId");


-- CreateIndex
CREATE INDEX "QuizQuestion_schoolId_idx" ON "QuizQuestion"("schoolId");


-- CreateIndex
CREATE INDEX "QuizAnswer_schoolId_idx" ON "QuizAnswer"("schoolId");


-- CreateIndex
CREATE INDEX "Message_schoolId_idx" ON "Message"("schoolId");


-- CreateIndex
CREATE INDEX "Announcement_schoolId_idx" ON "Announcement"("schoolId");


-- CreateIndex
CREATE INDEX "AnnouncementRead_schoolId_idx" ON "AnnouncementRead"("schoolId");


-- CreateIndex
CREATE INDEX "NotificationPreference_schoolId_idx" ON "NotificationPreference"("schoolId");


-- CreateIndex
CREATE INDEX "Course_schoolId_idx" ON "Course"("schoolId");


-- CreateIndex
CREATE INDEX "CourseLesson_schoolId_idx" ON "CourseLesson"("schoolId");


-- CreateIndex
CREATE INDEX "LessonPage_schoolId_idx" ON "LessonPage"("schoolId");


-- CreateIndex
CREATE INDEX "CourseEnrollment_schoolId_idx" ON "CourseEnrollment"("schoolId");


-- CreateIndex
CREATE INDEX "LessonAttempt_schoolId_idx" ON "LessonAttempt"("schoolId");


-- CreateIndex
CREATE INDEX "PageResponse_schoolId_idx" ON "PageResponse"("schoolId");


-- CreateIndex
CREATE INDEX "CourseSession_schoolId_idx" ON "CourseSession"("schoolId");


-- CreateIndex
CREATE INDEX "CourseAttendance_schoolId_idx" ON "CourseAttendance"("schoolId");


-- CreateIndex
CREATE INDEX "LessonView_schoolId_idx" ON "LessonView"("schoolId");


-- CreateIndex
CREATE UNIQUE INDEX "FeeSettings_schoolId_key" ON "FeeSettings"("schoolId");


-- CreateIndex
CREATE UNIQUE INDEX "SiteSetting_schoolId_key" ON "SiteSetting"("schoolId");


-- CreateIndex
CREATE INDEX "Post_schoolId_idx" ON "Post"("schoolId");


-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "Class" ADD CONSTRAINT "Class_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "CardAlias" ADD CONSTRAINT "CardAlias_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "ParentLinkRequest" ADD CONSTRAINT "ParentLinkRequest_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "ClassRegistration" ADD CONSTRAINT "ClassRegistration_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "ClassRegistrationSettings" ADD CONSTRAINT "ClassRegistrationSettings_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "ClassRegistrationField" ADD CONSTRAINT "ClassRegistrationField_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "StaffAttendance" ADD CONSTRAINT "StaffAttendance_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "SessionConfig" ADD CONSTRAINT "SessionConfig_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "StaffWeeklySchedule" ADD CONSTRAINT "StaffWeeklySchedule_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "StudyYear" ADD CONSTRAINT "StudyYear_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "Holiday" ADD CONSTRAINT "Holiday_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "SchoolAddon" ADD CONSTRAINT "SchoolAddon_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "AuditCleanupSchedule" ADD CONSTRAINT "AuditCleanupSchedule_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "CardTemplate" ADD CONSTRAINT "CardTemplate_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "AttendanceFormatRule" ADD CONSTRAINT "AttendanceFormatRule_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "FeeRecord" ADD CONSTRAINT "FeeRecord_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "FeePayment" ADD CONSTRAINT "FeePayment_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "Timetable" ADD CONSTRAINT "Timetable_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "TimetableSubject" ADD CONSTRAINT "TimetableSubject_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "TimetableClass" ADD CONSTRAINT "TimetableClass_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "TimetableClassroom" ADD CONSTRAINT "TimetableClassroom_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "TimetableTeacher" ADD CONSTRAINT "TimetableTeacher_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "TimetableLesson" ADD CONSTRAINT "TimetableLesson_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "TimetableEntry" ADD CONSTRAINT "TimetableEntry_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "TimetableTeacherAttendance" ADD CONSTRAINT "TimetableTeacherAttendance_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "ScoreSheet" ADD CONSTRAINT "ScoreSheet_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "ScoreSheetClass" ADD CONSTRAINT "ScoreSheetClass_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "ScoreSubject" ADD CONSTRAINT "ScoreSubject_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "ScoreExamTab" ADD CONSTRAINT "ScoreExamTab_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "ScoreEntry" ADD CONSTRAINT "ScoreEntry_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "Salary" ADD CONSTRAINT "Salary_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "StaffProfile" ADD CONSTRAINT "StaffProfile_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "StaffEducation" ADD CONSTRAINT "StaffEducation_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "StaffWorkExperience" ADD CONSTRAINT "StaffWorkExperience_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "StaffCertification" ADD CONSTRAINT "StaffCertification_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "Bus" ADD CONSTRAINT "Bus_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "BusRoute" ADD CONSTRAINT "BusRoute_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "BusStop" ADD CONSTRAINT "BusStop_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "BusLocation" ADD CONSTRAINT "BusLocation_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "ExamQuestion" ADD CONSTRAINT "ExamQuestion_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "ExamAttempt" ADD CONSTRAINT "ExamAttempt_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "AssignmentSubmission" ADD CONSTRAINT "AssignmentSubmission_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "QuizQuestion" ADD CONSTRAINT "QuizQuestion_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "QuizAnswer" ADD CONSTRAINT "QuizAnswer_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "AnnouncementRead" ADD CONSTRAINT "AnnouncementRead_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "CourseLesson" ADD CONSTRAINT "CourseLesson_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "LessonPage" ADD CONSTRAINT "LessonPage_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "CourseEnrollment" ADD CONSTRAINT "CourseEnrollment_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "LessonAttempt" ADD CONSTRAINT "LessonAttempt_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "PageResponse" ADD CONSTRAINT "PageResponse_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "CourseSession" ADD CONSTRAINT "CourseSession_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "CourseAttendance" ADD CONSTRAINT "CourseAttendance_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "LessonView" ADD CONSTRAINT "LessonView_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "FeeSettings" ADD CONSTRAINT "FeeSettings_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "SiteSetting" ADD CONSTRAINT "SiteSetting_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;


