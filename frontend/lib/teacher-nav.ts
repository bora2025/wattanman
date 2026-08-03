import { NavItem } from '../components/Sidebar';

export const teacherNav: NavItem[] = [
  { label: 'nav.dashboard', href: '/teacher', icon: 'dashboard' },
  { label: 'nav.myClasses', href: '/teacher/classes', icon: 'graduation', moduleKey: 'CLASSES' },
  { label: 'nav.takeAttendance', href: '/teacher/camera', icon: 'camera', moduleKey: 'ATTENDANCE' },
  { label: 'nav.staffAttendance', href: '/teacher/staff-attendance', icon: 'clipboard', moduleKey: 'ATTENDANCE' },
  { label: 'nav.reports', href: '/teacher/reports', icon: 'chart', moduleKey: 'ATTENDANCE' },
  { label: 'Assignments', href: '/teacher/assignments', icon: 'book' },
  { label: 'Courses', href: '/teacher/courses', icon: 'book' },
  { label: 'Examinations', href: '/teacher/exams', icon: 'clipboard', moduleKey: 'EXAMS' },
  { label: 'Gradebook', href: '/teacher/gradebook', icon: 'chart' },
  { label: 'Messages', href: '/teacher/messages', icon: '💬', badgeKey: 'messages' as const },
  { label: 'Announcements', href: '/teacher/announcements', icon: '📣', badgeKey: 'announcements' as const },
  { label: 'LaTeX Editor', href: '/tools/latex-editor', icon: '∑', moduleKey: 'LATEX_EDITOR' },
]
