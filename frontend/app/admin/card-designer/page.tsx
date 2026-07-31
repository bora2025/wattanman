'use client'

import AuthGuard from '../../../components/AuthGuard';
import Sidebar from '../../../components/Sidebar';
import CardEditor from '../../../components/card-designer/CardEditor';
import { adminNav } from '../../../lib/admin-nav';
import { useAccentColor } from '../../../lib/accentColor'

export default function CardDesignerPage() {
  const { accentColor } = useAccentColor()
  return (
    <AuthGuard requiredRole="ADMIN">
      <div className="flex h-screen overflow-hidden">
        <Sidebar
          title="Admin Panel"
          subtitle="Wattanman"
          navItems={adminNav}
          accentColor={accentColor}
        />
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          <div className="h-14 lg:hidden shrink-0" />
          <div className="flex-1 overflow-hidden min-h-0">
            <CardEditor />
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}

