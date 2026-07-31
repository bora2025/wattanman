'use client'

import AuthGuard from '../../../../components/AuthGuard'
import Sidebar from '../../../../components/Sidebar'
import { adminNav } from '../../../../lib/admin-nav'
import { FeeSettingsDashboard } from '../../../../components/FeeSettingsDashboard'
import { useAccentColor } from '../../../../lib/accentColor'

export default function FeeSettingsPage() {
  const { accentColor } = useAccentColor()
  return (
    <AuthGuard allowedRoles={['ADMIN', 'ACCOUNTER']}>
      <div className="flex min-h-screen lg:h-screen bg-gray-50 dark:bg-slate-800 pt-14 lg:pt-0 pb-[72px] lg:pb-0">
        <Sidebar title="Admin" navItems={adminNav} accentColor={accentColor} />
        <FeeSettingsDashboard />
      </div>
    </AuthGuard>
  )
}
