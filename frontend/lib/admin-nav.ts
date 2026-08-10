import { NavItem } from '../components/Sidebar'

export const adminNav: NavItem[] = [
  { label: 'nav.dashboard', href: '/admin', icon: 'dashboard', section: 'nav.section.overview' },
  { label: 'nav.search', href: '/admin/search', icon: 'search' },
  { label: 'nav.manageUsers', href: '/admin/users', icon: 'users', section: 'nav.section.people' },
  { label: 'Manage Extensions', href: '/admin/extensions/manage', icon: 'settings', section: 'Extensions' },
  { label: 'Backup & Restore', href: '/admin/backup', icon: 'briefcase', section: 'nav.section.settings' },
  { label: 'Audit Logs', href: '/admin/audit', icon: 'clipboard' },
  { label: 'nav.settings', href: '/admin/settings', icon: 'settings' },
  { label: 'Appearance', href: '/admin/appearance', icon: 'paint', section: 'Appearance' },
  { label: 'Posts', href: '/admin/appearance/posts', icon: 'edit' },
]

export const classAdminNav: NavItem[] = []
