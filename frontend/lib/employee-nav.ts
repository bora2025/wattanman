import { NavItem } from '../components/Sidebar';

export const employeeNav: NavItem[] = [
  { label: 'nav.dashboard', href: '/employee', icon: 'dashboard' },
  { label: 'nav.scanAttendance', href: '/employee/scan', icon: 'camera', moduleKey: 'ATTENDANCE' },
  { label: 'nav.myReports', href: '/employee/reports', icon: 'chart' },
]
