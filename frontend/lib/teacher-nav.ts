export const teacherNav = [
  { label: 'nav.dashboard', href: '/teacher', icon: 'dashboard' },
  { label: 'nav.myClasses', href: '/teacher/classes', icon: 'graduation' },
  { label: 'nav.takeAttendance', href: '/teacher/camera', icon: 'camera' },
  { label: 'nav.staffAttendance', href: '/teacher/staff-attendance', icon: 'clipboard' },
  { label: 'nav.reports', href: '/teacher/reports', icon: 'chart' },
  { label: 'nav.sessionSettings', href: '/teacher/session-settings', icon: 'settings' },
  { label: 'Assignments', href: '/teacher/assignments', icon: 'book' },
  { label: 'Examinations', href: '/teacher/exams', icon: 'clipboard' },
  { label: 'Gradebook', href: '/teacher/gradebook', icon: 'chart' },
  { label: 'Messages', href: '/teacher/messages', icon: 'clipboard', badgeKey: 'messages' as const },
  { label: 'Announcements', href: '/teacher/announcements', icon: 'clipboard', badgeKey: 'announcements' as const },
]
