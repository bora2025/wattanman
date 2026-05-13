'use client'

import AuthGuard from '../../../components/AuthGuard';
import Sidebar from '../../../components/Sidebar';
import CardEditor from '../../../components/card-designer/CardEditor';
import { adminNav } from '../../../lib/admin-nav';
import { useLanguage } from '../../../lib/i18n';

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
              Design and customize ID cards for students and staff. New Project dialog, Live Preview, Layers panel, Undo/Redo and multi-format Export.
            </p>
          </div>
          <div className="overflow-hidden">
            <CardEditor />
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
