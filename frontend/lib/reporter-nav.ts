import { NavItem } from '../components/Sidebar';

export const reporterNav: NavItem[] = [
  { label: 'nav.dashboard', href: '/reporter', icon: 'dashboard' },
  { label: 'nav.selfScan', href: '/employee/scan', icon: 'camera', moduleKey: 'ATTENDANCE' },
  { label: 'nav.officerReport', href: '/admin/staff-reports', icon: 'bar-chart', moduleKey: 'ATTENDANCE' },
  { label: 'nav.studentReport', href: '/admin/reports', icon: 'chart', moduleKey: 'ATTENDANCE' },
  { label: 'nav.teacherReports', href: '/wattaman/teacher-reports', icon: 'clipboard', moduleKey: 'PART_TIME_TEACHER' },
  { label: 'nav.editOfficerAttendance', href: '/admin/staff-attendance/edit', icon: 'edit', moduleKey: 'ATTENDANCE' },
  { label: 'nav.editAttendance', href: '/admin/attendance/edit', icon: 'edit', moduleKey: 'ATTENDANCE' },
]
