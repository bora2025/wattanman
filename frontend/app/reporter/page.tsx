'use client'

import Link from 'next/link'
import AuthGuard from '../../components/AuthGuard'
import Sidebar from '../../components/Sidebar'
import { reporterNav } from '../../lib/reporter-nav'
import { getCurrentUser } from '../../lib/api'
import { useState, useEffect } from 'react'

function ReporterDashboardContent() {
  const [userName, setUserName] = useState('')

  useEffect(() => {
    getCurrentUser().then(u => { if (u?.name) setUserName(u.name) }).catch(() => {})
  }, [])

  const reports = [
    {
      title: 'My Attendance Scan',
      desc: 'Scan your QR card to record your own daily attendance check-in.',
      href: '/employee/scan',
      icon: '📷',
      accent: 'teal',
    },
    {
      title: 'Staff Attendance Report',
      desc: 'View and print daily, weekly, monthly, and yearly attendance reports for all staff members.',
      href: '/admin/staff-reports',
      icon: '📋',
      accent: 'indigo',
    },
    {
      title: 'Student Attendance Report',
      desc: 'View and print attendance records for students, grouped by class.',
      href: '/admin/reports',
      icon: '🎓',
      accent: 'emerald',
    },
    {
      title: 'Teacher Attendance Report',
      desc: 'View and print teacher lesson attendance and monthly summaries.',
      href: '/wattaman/teacher-reports',
      icon: '📚',
      accent: 'sky',
    },
  ]

  return (
    <div className="page-shell">
      <Sidebar title="Reporter" subtitle="Wattaman" navItems={reporterNav} accentColor="teal" />
      <div className="page-content">
        <div className="h-14 lg:hidden" />
        <div className="page-header">
          <h1 className="text-2xl font-bold text-slate-800">
            {userName ? `Welcome, ${userName}` : 'Reporter Portal'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">View and print attendance reports for staff and students.</p>
        </div>
        <div className="page-body">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-2">
            {reports.map(r => (
              <Link key={r.href} href={r.href} className="card p-6 hover:shadow-md transition-shadow group block">
                <div className="text-3xl mb-3">{r.icon}</div>
                <h2 className="text-base font-semibold text-slate-800 group-hover:text-indigo-600 transition-colors mb-1">
                  {r.title}
                </h2>
                <p className="text-sm text-slate-500">{r.desc}</p>
                <div className="mt-4 text-xs font-medium text-indigo-600 group-hover:underline">
                  Open report →
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ReporterPage() {
  return (
    <AuthGuard allowedRoles={['WATTAMAN_REPORTER', 'ADMIN']}>
      <ReporterDashboardContent />
    </AuthGuard>
  )
}
