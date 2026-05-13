'use client'

import Link from 'next/link';
import AuthGuard from '../../../components/AuthGuard';
import Sidebar from '../../../components/Sidebar';
import { adminNav } from '../../../lib/admin-nav';
import { useLanguage } from '../../../lib/i18n';

const DESIGNER_CARDS = [
  {
    href: '/admin/card-designer/new',
    icon: '✏️',
    title: 'New Blank / Certificate',
    description: 'Start from a blank canvas or create a certificate. Choose your size, purpose, and data source.',
    badge: null,
    color: 'indigo',
    gradient: 'from-indigo-500 to-violet-500',
  },
  {
    href: '/admin/card-designer/student',
    icon: '🎓',
    title: 'Student ID Card',
    description: 'Edit the active student ID card design. Changes will apply when printing student cards.',
    badge: 'ID Card',
    color: 'blue',
    gradient: 'from-blue-500 to-indigo-500',
  },
  {
    href: '/admin/card-designer/staff',
    icon: '👨‍🏫',
    title: 'Staff ID Card',
    description: 'Edit the active staff ID card design. Changes will apply when printing staff cards.',
    badge: 'ID Card',
    color: 'emerald',
    gradient: 'from-emerald-500 to-teal-500',
  },
];

export default function CardDesignerPage() {
  const { t } = useLanguage();
  return (
    <AuthGuard requiredRole="ADMIN">
      <div className="page-shell">
        <Sidebar
          title="Admin Panel"
          subtitle="Wattanman"
          navItems={adminNav}
          accentColor="indigo"
        />
        <div className="page-content lg:ml-0">
          <div className="h-14 lg:hidden" />
          <div className="page-header">
            <h1 className="text-2xl font-bold text-slate-800">{t('cardDesigner.title')}</h1>
            <p className="text-sm text-slate-500 mt-1">
              Choose a design type to get started.
            </p>
          </div>

          <div className="px-6 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 max-w-4xl">
              {DESIGNER_CARDS.map((card) => (
                <Link
                  key={card.href}
                  href={card.href}
                  className="group relative bg-white rounded-2xl border border-slate-200 hover:border-slate-300 hover:shadow-lg transition-all overflow-hidden flex flex-col"
                >
                  {/* Top gradient strip */}
                  <div className={`h-2 bg-gradient-to-r ${card.gradient}`} />

                  <div className="p-6 flex flex-col flex-1">
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${card.gradient} flex items-center justify-center text-2xl mb-4 shadow-sm`}>
                      {card.icon}
                    </div>

                    <div className="flex items-start justify-between gap-2 mb-2">
                      <h3 className="text-base font-bold text-slate-800 leading-tight">{card.title}</h3>
                      {card.badge && (
                        <span className="shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200 mt-0.5">
                          {card.badge}
                        </span>
                      )}
                    </div>

                    <p className="text-sm text-slate-500 leading-relaxed flex-1">{card.description}</p>

                    <div className="mt-5 flex items-center gap-1.5 text-sm font-semibold text-indigo-600 group-hover:text-indigo-700">
                      Open Designer
                      <svg viewBox="0 0 16 16" className="w-4 h-4 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth={2}>
                        <path d="M3 8h10M9 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}

