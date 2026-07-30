export const adminNav = [
  // ── Overview ──
  { label: 'nav.dashboard', href: '/admin', icon: 'dashboard', section: 'nav.section.overview' },
  { label: 'nav.search', href: '/admin/search', icon: 'search' },

  // ── Academics ──
  { label: 'nav.manageClasses', href: '/admin/classes', icon: 'book', section: 'nav.section.academics', moduleKey: 'CLASSES' },
  { label: 'nav.studyYears', href: '/admin/study-years', icon: 'layers', moduleKey: 'CLASSES' },
  { label: 'nav.timetable', href: '/admin/timetable', icon: 'calendar', moduleKey: 'CLASSES' },
  { label: 'nav.scoring', href: '/admin/scoring', icon: 'trophy', moduleKey: 'EXAMS' },
  { label: 'Examinations', href: '/admin/exams', icon: 'book', moduleKey: 'EXAMS' },

  // ── Attendance ──
  { label: 'nav.takeAttendance', href: '/admin/camera', icon: 'camera', section: 'nav.section.attendance', moduleKey: 'ATTENDANCE' },
  { label: 'nav.officerAttendance', href: '/admin/staff-attendance', icon: 'clipboard', moduleKey: 'ATTENDANCE' },
  { label: 'nav.editAttendance', href: '/admin/attendance/edit', icon: 'edit', moduleKey: 'ATTENDANCE' },
  { label: 'nav.editOfficerAttendance', href: '/admin/staff-attendance/edit', icon: 'edit', moduleKey: 'ATTENDANCE' },

  // ── People ──
  { label: 'nav.manageUsers', href: '/admin/users', icon: 'users', section: 'nav.section.people' },
  { label: 'Teacher Portal', href: '/admin/teachers', icon: 'graduation' },
  { label: 'Student Portal', href: '/admin/students', icon: 'users' },
  { label: 'Parent Portal', href: '/admin/parents', icon: 'users' },
  { label: 'nav.manageHub', href: '/admin/manage-hub', icon: 'briefcase' },
  { label: 'nav.manageOfficer', href: '/admin/employees', icon: 'briefcase' },
  { label: 'nav.manageTeachers', href: '/wattaman/scheduled-teacher', icon: 'graduation', moduleKey: 'CLASSES' },

  // ── Communication ──
  { label: 'Communication Hub', href: '/admin/communication', icon: 'clipboard', section: 'Communication', badgeKey: 'messages' as const },
  { label: 'Parent Link Requests', href: '/admin/parent-requests', icon: 'users' },
  { label: 'Class Registrations', href: '/admin/class-registrations', icon: 'clipboard', badgeKey: 'class-registrations' as const },

  // ── Finance ──
  { label: 'Finance Dashboard', href: '/admin/budget-report', icon: 'bar-chart', section: 'Finance', moduleKey: 'FEES' },
  { label: 'nav.feeManagement', href: '/admin/fees', icon: 'money', moduleKey: 'FEES' },
  { label: 'Salary Management', href: '/admin/salary', icon: 'money', moduleKey: 'SALARY' },

  // ── Reports ──
  { label: 'nav.studentReport', href: '/admin/reports', icon: 'chart', section: 'nav.section.reports' },
  { label: 'nav.officerReport', href: '/admin/staff-reports', icon: 'bar-chart' },
  { label: 'nav.teacherReports', href: '/wattaman/teacher-reports', icon: 'clipboard', moduleKey: 'CLASSES' },

  // ── Designer ──
  { label: 'nav.cardDesigner', href: '/admin/card-designer', icon: 'design', section: 'Designer', moduleKey: 'CARD_DESIGNER' },
  { label: 'nav.studentCards', href: '/admin/student-cards', icon: 'id-card', moduleKey: 'CARD_DESIGNER' },
  { label: 'nav.staffCards', href: '/admin/staff-cards', icon: 'id-card', moduleKey: 'CARD_DESIGNER' },
  { label: 'Certificate', href: '/admin/certificate', icon: 'certificate', moduleKey: 'CARD_DESIGNER' },

  // ── Modules ──
  { label: 'School Bus', href: '/admin/bus', icon: 'calendar', section: 'Modules', moduleKey: 'BUS' },
  { label: 'Add-ons', href: '/admin/addons', icon: 'design' },

  // ── Tools ──
  { label: 'LaTeX Editor', href: '/tools/latex-editor', icon: '∑', section: 'Tools' },

  // ── Settings ──
  { label: 'nav.sessionSettings', href: '/admin/session-settings', icon: 'clock', section: 'nav.section.settings' },
  { label: 'nav.holidays', href: '/admin/holidays', icon: 'holiday' },
  { label: 'Backup & Restore', href: '/admin/backup', icon: 'briefcase' },
  { label: 'Audit Logs', href: '/admin/audit', icon: 'clipboard' },
  { label: 'nav.settings', href: '/admin/settings', icon: 'settings' },
  { label: 'Appearance', href: '/admin/appearance', icon: 'paint', section: 'Appearance' },
  { label: 'Posts', href: '/admin/appearance/posts', icon: 'edit' },
  { label: 'About', href: '/admin/appearance/about', icon: 'users' },
]

/** Navigation for CLASS_ADMIN — limited to classes, scoring, and student attendance only. */
export const classAdminNav = [
  // ── Academics ──
  { label: 'nav.manageClasses', href: '/admin/classes', icon: 'book', section: 'nav.section.academics', moduleKey: 'CLASSES' },
  { label: 'nav.scoring', href: '/admin/scoring', icon: 'trophy', moduleKey: 'EXAMS' },
  { label: 'Class Registrations', href: '/admin/class-registrations', icon: 'clipboard', badgeKey: 'class-registrations' as const },

  // ── Attendance ──
  { label: 'nav.takeAttendance', href: '/admin/attendance', icon: 'camera', section: 'nav.section.attendance', moduleKey: 'ATTENDANCE' },
  { label: 'nav.editAttendance', href: '/admin/attendance/edit', icon: 'edit', moduleKey: 'ATTENDANCE' },
  { label: 'nav.selfScan', href: '/employee/scan', icon: 'camera' },
]
