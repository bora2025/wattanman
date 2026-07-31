'use client'

import Link from 'next/link';
import AuthGuard from '../../../../components/AuthGuard';
import Sidebar from '../../../../components/Sidebar';
import CardEditor from '../../../../components/card-designer/CardEditor';
import { adminNav } from '../../../../lib/admin-nav';
import { useAccentColor } from '../../../../lib/accentColor'

export default function StaffCardDesignerPage() {
  const { accentColor } = useAccentColor()
  return (
    <AuthGuard requiredRole="ADMIN">
      <div className="page-shell">
        <Sidebar
          title="Admin Panel"
          subtitle="Wattanman"
          navItems={adminNav}
          accentColor={accentColor}
        />
        <div className="page-content lg:ml-0 flex flex-col">
          <div className="h-14 lg:hidden" />
          <div className="px-6 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center gap-3 shrink-0">
            <Link href="/admin/card-designer" className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
              <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M10 4L6 8l4 4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
            <span className="text-xs text-slate-400 dark:text-slate-500">/</span>
            <Link href="/admin/card-designer" className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">Designer</Link>
            <span className="text-xs text-slate-400 dark:text-slate-500">/</span>
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1">
              <span>👨‍🏫</span> Staff ID Card Workspace
            </span>
            <span className="ml-2 text-[10px] text-slate-400 dark:text-slate-500 hidden sm:inline">• Staff designs only</span>
          </div>
          <div className="flex-1 overflow-hidden">
            <CardEditor initialCardType="staff" />
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
