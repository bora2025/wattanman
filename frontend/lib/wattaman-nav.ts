import { NavItem } from '../components/Sidebar';

export const wattamanNav: NavItem[] = [
  { label: 'nav.dashboard', href: '/wattaman', icon: 'dashboard' },
  { label: 'nav.scanAttendance', href: '/wattaman/scan', icon: 'camera', moduleKey: 'ATTENDANCE' },
  { label: 'nav.usbScanner', href: '/wattaman/usb-scan', icon: 'doc-scanner', moduleKey: 'ATTENDANCE' },
  { label: 'nav.scanTeacher', href: '/wattaman/teacher-scan', icon: 'camera' },
  { label: 'nav.teacherReports', href: '/wattaman/teacher-reports', icon: 'clipboard', moduleKey: 'PART_TIME_TEACHER' },
]
