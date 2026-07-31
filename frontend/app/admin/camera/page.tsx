"use client"

import Link from 'next/link'
import AuthGuard from '../../../components/AuthGuard'
import Sidebar from '../../../components/Sidebar'
import { adminNav } from '../../../lib/admin-nav'
import { useLanguage } from '../../../lib/i18n'

function AdminCameraHubContent() {
  const { t } = useLanguage()

  return (
    <div className="page-shell">
      <Sidebar title="Admin Panel" subtitle="Wattaman" navItems={adminNav} accentColor="indigo" />
      <div className="page-content">
        <div className="h-14 lg:hidden" />

        <div className="page-header">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-slate-100">{t('nav.takeAttendance')}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t('camera.chooseWhereToScan')}</p>
        </div>

        <div className="page-body">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Link href="/admin/attendance" className="card-hover p-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
              <div className="w-12 h-12 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-xl">📘</div>
              <h2 className="mt-4 text-lg font-semibold text-slate-800 dark:text-slate-100">{t('camera.classAttendanceTitle')}</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('camera.classAttendanceDesc')}</p>
            </Link>

            <Link href="/admin/staff-attendance" className="card-hover p-5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
              <div className="w-12 h-12 rounded-xl bg-cyan-50 dark:bg-cyan-950/40 text-cyan-600 dark:text-cyan-400 flex items-center justify-center text-xl">👔</div>
              <h2 className="mt-4 text-lg font-semibold text-slate-800 dark:text-slate-100">{t('camera.staffAttendanceTitle')}</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t('camera.staffAttendanceDesc')}</p>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function AdminCameraHubPage() {
  return (
    <AuthGuard requiredRole="ADMIN">
      <AdminCameraHubContent />
    </AuthGuard>
  )
}
