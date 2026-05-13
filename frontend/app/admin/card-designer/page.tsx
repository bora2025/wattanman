'use client'

import AuthGuard from '../../../components/AuthGuard';
import Sidebar from '../../../components/Sidebar';
import CardEditor from '../../../components/card-designer/CardEditor';
import { adminNav } from '../../../lib/admin-nav';

export default function CardDesignerPage() {
  return (
    <AuthGuard requiredRole="ADMIN">
      <div className="page-shell">
        <Sidebar
          title="Admin Panel"
          subtitle="Wattanman"
          navItems={adminNav}
          accentColor="indigo"
        />
        <div className="page-content lg:ml-0 flex flex-col">
          <div className="h-14 lg:hidden" />
          <div className="flex-1 overflow-hidden">
            <CardEditor />
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}

