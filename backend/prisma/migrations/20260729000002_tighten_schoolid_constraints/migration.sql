-- Migration 2/2 of the multi-tenant conversion: tightens schoolId to
-- NOT NULL, drops the old globally-unique indexes, and adds the new
-- schoolId-composite unique indexes that replace them.
--
-- Only apply this AFTER backend/prisma/backfill-tenancy.ts has run
-- successfully against production and confirmed zero NULL schoolId values
-- remain anywhere. Applying it before backfill will fail loudly (Postgres
-- rejects SET NOT NULL while NULLs exist) rather than silently corrupting
-- data — that's intentional, not a bug to work around.

-- DropIndex
DROP INDEX "User_email_key";


-- DropIndex
DROP INDEX "User_phoneNormalized_key";


-- DropIndex
DROP INDEX "Student_qrCode_key";


-- DropIndex
DROP INDEX "CardAlias_qrValue_key";


-- DropIndex
DROP INDEX "Attendance_studentId_classId_date_session_key";


-- DropIndex
DROP INDEX "ClassRegistrationField_key_key";


-- DropIndex
DROP INDEX "StaffAttendance_userId_date_session_key";


-- DropIndex
DROP INDEX "SessionConfig_classId_session_scope_key";


-- DropIndex
DROP INDEX "StudyYear_year_key";


-- DropIndex
DROP INDEX "Holiday_date_name_key";


-- DropIndex
DROP INDEX "Department_name_key";


-- DropIndex
DROP INDEX "AttendanceFormatRule_scope_organizationId_key";


-- DropIndex
DROP INDEX "TimetableTeacher_qrCode_key";


-- DropIndex
DROP INDEX "TimetableEntry_timetableId_classId_day_period_key";


-- DropIndex
DROP INDEX "TimetableTeacherAttendance_teacherId_date_period_key";


-- DropIndex
DROP INDEX "ScoreSheetClass_scoreSheetId_classId_key";


-- DropIndex
DROP INDEX "ScoreEntry_examTabId_subjectId_studentId_key";


-- DropIndex
DROP INDEX "Salary_userId_month_year_key";


-- DropIndex
DROP INDEX "Bus_plateNumber_key";


-- DropIndex
DROP INDEX "ExamAttempt_examId_studentId_key";


-- DropIndex
DROP INDEX "AssignmentSubmission_assignmentId_studentId_key";


-- DropIndex
DROP INDEX "QuizAnswer_submissionId_questionId_key";


-- DropIndex
DROP INDEX "AnnouncementRead_announcementId_userId_key";


-- DropIndex
DROP INDEX "CourseEnrollment_courseId_studentId_key";


-- DropIndex
DROP INDEX "PageResponse_attemptId_pageId_key";


-- DropIndex
DROP INDEX "CourseAttendance_sessionId_studentId_key";


-- DropIndex
DROP INDEX "LessonView_lessonId_studentId_key";


-- CreateIndex
CREATE UNIQUE INDEX "SchoolAddon_schoolId_addonKey_key" ON "SchoolAddon"("schoolId", "addonKey");


-- CreateIndex
CREATE UNIQUE INDEX "User_schoolId_email_key" ON "User"("schoolId", "email");


-- CreateIndex
CREATE UNIQUE INDEX "User_schoolId_phoneNormalized_key" ON "User"("schoolId", "phoneNormalized");


-- CreateIndex
CREATE UNIQUE INDEX "Student_schoolId_qrCode_key" ON "Student"("schoolId", "qrCode");


-- CreateIndex
CREATE UNIQUE INDEX "CardAlias_schoolId_qrValue_key" ON "CardAlias"("schoolId", "qrValue");


-- CreateIndex
CREATE UNIQUE INDEX "Attendance_schoolId_studentId_classId_date_session_key" ON "Attendance"("schoolId", "studentId", "classId", "date", "session");


-- CreateIndex
CREATE UNIQUE INDEX "ClassRegistrationField_schoolId_key_key" ON "ClassRegistrationField"("schoolId", "key");


-- CreateIndex
CREATE UNIQUE INDEX "StaffAttendance_schoolId_userId_date_session_key" ON "StaffAttendance"("schoolId", "userId", "date", "session");


-- CreateIndex
CREATE UNIQUE INDEX "SessionConfig_schoolId_classId_session_scope_key" ON "SessionConfig"("schoolId", "classId", "session", "scope");


-- CreateIndex
CREATE UNIQUE INDEX "StudyYear_schoolId_year_key" ON "StudyYear"("schoolId", "year");


-- CreateIndex
CREATE UNIQUE INDEX "Holiday_schoolId_date_name_key" ON "Holiday"("schoolId", "date", "name");


-- CreateIndex
CREATE UNIQUE INDEX "Department_schoolId_name_key" ON "Department"("schoolId", "name");


-- CreateIndex
CREATE UNIQUE INDEX "AttendanceFormatRule_schoolId_scope_organizationId_key" ON "AttendanceFormatRule"("schoolId", "scope", "organizationId");


-- CreateIndex
CREATE UNIQUE INDEX "TimetableTeacher_schoolId_qrCode_key" ON "TimetableTeacher"("schoolId", "qrCode");


-- CreateIndex
CREATE UNIQUE INDEX "TimetableEntry_schoolId_timetableId_classId_day_period_key" ON "TimetableEntry"("schoolId", "timetableId", "classId", "day", "period");


-- CreateIndex
CREATE UNIQUE INDEX "TimetableTeacherAttendance_schoolId_teacherId_date_period_key" ON "TimetableTeacherAttendance"("schoolId", "teacherId", "date", "period");


-- CreateIndex
CREATE UNIQUE INDEX "ScoreSheetClass_schoolId_scoreSheetId_classId_key" ON "ScoreSheetClass"("schoolId", "scoreSheetId", "classId");


-- CreateIndex
CREATE UNIQUE INDEX "ScoreEntry_schoolId_examTabId_subjectId_studentId_key" ON "ScoreEntry"("schoolId", "examTabId", "subjectId", "studentId");


-- CreateIndex
CREATE UNIQUE INDEX "Salary_schoolId_userId_month_year_key" ON "Salary"("schoolId", "userId", "month", "year");


-- CreateIndex
CREATE UNIQUE INDEX "Bus_schoolId_plateNumber_key" ON "Bus"("schoolId", "plateNumber");


-- CreateIndex
CREATE UNIQUE INDEX "ExamAttempt_schoolId_examId_studentId_key" ON "ExamAttempt"("schoolId", "examId", "studentId");


-- CreateIndex
CREATE UNIQUE INDEX "AssignmentSubmission_schoolId_assignmentId_studentId_key" ON "AssignmentSubmission"("schoolId", "assignmentId", "studentId");


-- CreateIndex
CREATE UNIQUE INDEX "QuizAnswer_schoolId_submissionId_questionId_key" ON "QuizAnswer"("schoolId", "submissionId", "questionId");


-- CreateIndex
CREATE UNIQUE INDEX "AnnouncementRead_schoolId_announcementId_userId_key" ON "AnnouncementRead"("schoolId", "announcementId", "userId");


-- CreateIndex
CREATE UNIQUE INDEX "CourseEnrollment_schoolId_courseId_studentId_key" ON "CourseEnrollment"("schoolId", "courseId", "studentId");


-- CreateIndex
CREATE UNIQUE INDEX "PageResponse_schoolId_attemptId_pageId_key" ON "PageResponse"("schoolId", "attemptId", "pageId");


-- CreateIndex
CREATE UNIQUE INDEX "CourseAttendance_schoolId_sessionId_studentId_key" ON "CourseAttendance"("schoolId", "sessionId", "studentId");


-- CreateIndex
CREATE UNIQUE INDEX "LessonView_schoolId_lessonId_studentId_key" ON "LessonView"("schoolId", "lessonId", "studentId");


-- Tighten schoolId to NOT NULL now that every row is backfilled
ALTER TABLE "User" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "Class" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "Student" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "CardAlias" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "Attendance" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "Notification" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "ParentLinkRequest" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "ClassRegistration" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "ClassRegistrationSettings" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "ClassRegistrationField" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "StaffAttendance" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "SessionConfig" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "StaffWeeklySchedule" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "StudyYear" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "Holiday" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "Department" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "RefreshToken" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "AuditLog" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "AuditCleanupSchedule" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "CardTemplate" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "AttendanceFormatRule" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "FeeRecord" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "FeePayment" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "Timetable" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "TimetableSubject" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "TimetableClass" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "TimetableClassroom" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "TimetableTeacher" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "TimetableLesson" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "TimetableEntry" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "TimetableTeacherAttendance" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "ScoreSheet" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "ScoreSheetClass" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "ScoreSubject" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "ScoreExamTab" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "ScoreEntry" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "Salary" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "StaffProfile" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "StaffEducation" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "StaffWorkExperience" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "StaffCertification" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "Bus" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "BusRoute" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "BusStop" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "BusLocation" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "Exam" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "ExamQuestion" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "ExamAttempt" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "Assignment" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "AssignmentSubmission" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "QuizQuestion" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "QuizAnswer" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "Message" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "Announcement" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "AnnouncementRead" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "NotificationPreference" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "Course" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "CourseLesson" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "LessonPage" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "CourseEnrollment" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "LessonAttempt" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "PageResponse" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "CourseSession" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "CourseAttendance" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "LessonView" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "FeeSettings" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "SiteSetting" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "Post" ALTER COLUMN "schoolId" SET NOT NULL;
