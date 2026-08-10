'use client'

import Link from 'next/link'
import AuthGuard from '../../components/AuthGuard'
import Sidebar from '../../components/Sidebar'
import { adminNav } from '../../lib/admin-nav'

const quickLinks = [
  { href: '/admin/users', title: 'Manage Users', description: 'Create and manage school user accounts.' },
  { href: '/admin/extensions/manage', title: 'Manage Extensions', description: 'Install and control school capabilities.' },
  { href: '/admin/backup', title: 'Backup & Restore', description: 'Protect and recover school configuration.' },
  { href: '/admin/audit', title: 'Audit Logs', description: 'Review administrative and security activity.' },
]

function BaseSchoolDashboard() {
  return (
    <div className="page-shell">
      <Sidebar title="Admin" subtitle="School Management" navItems={adminNav} accentColor="brand" />
      <main className="page-content">
        <div className="h-14 lg:hidden" />
        <header className="page-header">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand-600">Overview</p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900 dark:text-white">School Dashboard</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-500">
            This school starts with a secure administration shell. Install extensions to add academic, finance, people, communication, or operational features.
          </p>
        </header>

        <div className="page-body">
          <section className="grid gap-4 sm:grid-cols-2">
            {quickLinks.map(link => (
              <Link key={link.href} href={link.href} className="card block p-6 transition hover:-translate-y-0.5 hover:shadow-lg">
                <h2 className="font-bold text-slate-900 dark:text-white">{link.title}</h2>
                <p className="mt-2 text-sm text-slate-500">{link.description}</p>
              </Link>
            ))}
          </section>

          <section className="card mt-6 p-6">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Add school capabilities</h2>
            <p className="mt-2 text-sm text-slate-500">
              Request extensions from the marketplace. Features only become available after platform approval, installation, and activation.
            </p>
            <Link href="/admin/extensions" className="btn-primary mt-5 inline-flex">Browse extensions</Link>
          </section>
        </div>
      </main>
    </div>
  )
}

export default function AdminDashboardPage() {
  return <AuthGuard requiredRole="ADMIN"><BaseSchoolDashboard /></AuthGuard>
}
