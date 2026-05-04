'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useLanguage } from '../lib/i18n';
import { iconMap, IconDashboard, IconGlobe, IconLogout } from './Icons';

/** Renders an icon: if `key` maps to an SVG component, uses it; otherwise falls back to text/emoji. */
function NavIcon({ icon, size = 20, className }: { icon: string; size?: number; className?: string }) {
  const Comp = iconMap[icon];
  if (Comp) return <Comp size={size} className={className} />;
  return <span className={`leading-none ${className || ''}`} style={{ fontSize: size }}>{icon}</span>;
}

interface NavItem {
  label: string;
  href: string;
  icon: string;
}

interface SidebarProps {
  title: string;
  subtitle?: string;
  navItems: NavItem[];
  accentColor?: string;
  /** Which nav hrefs to show in the mobile bottom tab bar (max 5). Defaults to first 4 + settings/more. */
  bottomTabs?: string[];
}

const colorMap: Record<string, { bg: string; text: string; hover: string; active: string; ring: string; gradient: string }> = {
  indigo: {
    bg: 'bg-indigo-600',
    text: 'text-indigo-100',
    hover: 'hover:bg-indigo-700/50',
    active: 'bg-white/15 text-white font-semibold',
    ring: 'ring-indigo-500',
    gradient: 'from-indigo-700 to-indigo-900',
  },
  emerald: {
    bg: 'bg-emerald-600',
    text: 'text-emerald-100',
    hover: 'hover:bg-emerald-700/50',
    active: 'bg-white/15 text-white font-semibold',
    ring: 'ring-emerald-500',
    gradient: 'from-emerald-700 to-emerald-900',
  },
  sky: {
    bg: 'bg-sky-600',
    text: 'text-sky-100',
    hover: 'hover:bg-sky-700/50',
    active: 'bg-white/15 text-white font-semibold',
    ring: 'ring-sky-500',
    gradient: 'from-sky-700 to-sky-900',
  },
};

function pickBottomTabs(navItems: NavItem[], bottomTabs?: string[]): NavItem[] {
  if (bottomTabs) {
    return bottomTabs.map(href => navItems.find(n => n.href === href)).filter(Boolean) as NavItem[];
  }

  // UX-specific fixed tab order where camera stays centered.
  const hasAdminRoot = navItems.some(n => n.href === '/admin');
  const hasTeacherRoot = navItems.some(n => n.href === '/teacher');

  if (hasTeacherRoot) {
    const teacherOrder = ['/teacher', '/teacher/classes', '/teacher/camera', '/teacher/reports', '/teacher/session-settings'];
    const teacherTabs = teacherOrder.map(href => navItems.find(n => n.href === href)).filter(Boolean) as NavItem[];
    if (teacherTabs.length === 5) return teacherTabs;
  }

  if (hasAdminRoot) {
    const adminOrder = ['/admin', '/admin/manage-hub', '/admin/camera', '/admin/reports'];
    const adminTabs = adminOrder.map(href => navItems.find(n => n.href === href)).filter(Boolean) as NavItem[];
    if (adminTabs.length === 4) {
      return [...adminTabs, { label: 'common.more', href: '__more__', icon: 'settings' }];
    }
  }

  // Auto-pick: first item (dashboard) + up to 3 most important + last (settings)
  if (navItems.length <= 5) return navItems;
  const picked = [navItems[0]];
  // Find scan/attendance, reports, classes/users
  const priorities = ['camera', 'manage-hub', 'scan', 'reports', 'classes', 'users', 'search', 'attendance'];
  for (const p of priorities) {
    if (picked.length >= 4) break;
    const match = navItems.find(n => n.href.includes(p) && !picked.includes(n));
    if (match) picked.push(match);
  }
  // Fill remaining slots
  for (const n of navItems.slice(1)) {
    if (picked.length >= 4) break;
    if (!picked.includes(n)) picked.push(n);
  }
  // Add a "More" entry
  picked.push({ label: 'common.more', href: '__more__', icon: 'settings' });
  return picked;
}

export default function Sidebar({ title, subtitle, navItems, accentColor = 'indigo', bottomTabs }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const colors = colorMap[accentColor] || colorMap.indigo;
  const { lang, setLang, t } = useLanguage();

  const tabs = pickBottomTabs(navItems, bottomTabs);
  const hasMore = tabs.some(t => t.href === '__more__');

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch { /* ignore */ }
    localStorage.removeItem('role');
    router.push('/login');
  };

  return (
    <>
      {/* ── Mobile: Top greeting bar ── */}
      <div className="lg:hidden print:hidden mobile-topbar-wrap">
        <div className="mobile-topbar" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div>
            <h1 className="font-bold text-lg leading-tight" style={{ color: 'var(--color-text)' }}>{title}</h1>
            {subtitle && <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{subtitle}</p>}
          </div>
          <div className="flex items-center gap-2">
          <button
            onClick={() => setLang(lang === 'en' ? 'kh' : 'en')}
            className="w-10 h-10 rounded-full bg-white/90 backdrop-blur flex items-center justify-center shadow-sm ring-1 ring-white/70"
            style={{ color: 'var(--color-icon)' }}
            aria-label="Language"
          >
            <IconGlobe size={20} />
          </button>
          <button
            onClick={handleLogout}
            className="w-10 h-10 rounded-full bg-white/90 backdrop-blur flex items-center justify-center shadow-sm ring-1 ring-white/70"
            style={{ color: 'var(--color-icon)' }}
            aria-label="Logout"
          >
            <IconLogout size={20} />
          </button>
          </div>
        </div>
      </div>

      {/* ── Mobile: Bottom tab bar (matches mobile app) ── */}
      <div className="lg:hidden print:hidden mobile-bottomnav-wrap" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <nav className="mobile-bottomnav">
          {tabs.map((tab, idx) => {
            if (tab.href === '__more__') {
              return (
                <button
                  key="more"
                  onClick={() => { setShowMore(true); setCollapsed(true); }}
                  className="mobile-tab-btn"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  <NavIcon icon={tab.icon} size={24} />
                </button>
              );
            }
            const isActive = pathname === tab.href;
            const isCameraCenter = tabs.length === 5 && idx === 2;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`mobile-tab-btn ${isCameraCenter ? 'mobile-tab-camera' : ''}`}
                style={{ color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)' }}
              >
                <NavIcon icon={tab.icon} size={24} />
                {isActive && <span className="mobile-tab-indicator" style={{ background: 'var(--color-primary)' }} />}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* ── Mobile: Full-screen "More" drawer ── */}
      {collapsed && showMore && (
        <>
          <div className="lg:hidden fixed inset-0 bg-black/40 z-50" onClick={() => { setCollapsed(false); setShowMore(false); }} />
          <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl max-h-[80vh] overflow-y-auto" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
            <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: 'var(--color-input-border)' }}>
              <h2 className="font-bold text-lg" style={{ color: 'var(--color-text)' }}>{t('common.more') || 'More'}</h2>
              <button
                onClick={() => { setCollapsed(false); setShowMore(false); }}
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: 'var(--color-input-bg)' }}
              >✕</button>
            </div>
            <nav className="px-3 py-3 space-y-0.5">
              {navItems.filter(item => !tabs.some(t => t.href === item.href)).map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => { setCollapsed(false); setShowMore(false); }}
                    className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm transition-all"
                    style={{
                      background: isActive ? 'var(--color-primary-light)' : 'transparent',
                      color: isActive ? 'var(--color-primary-dark)' : 'var(--color-text)',
                      fontWeight: isActive ? 600 : 400,
                    }}
                  >
                    <NavIcon icon={item.icon} size={22} />
                    <span>{t(item.label)}</span>
                  </Link>
                );
              })}
            </nav>
            <div className="px-3 pb-4 space-y-0.5">
              <Link
                href="/"
                onClick={() => { setCollapsed(false); setShowMore(false); }}
                className="flex items-center gap-3 px-4 py-3.5 rounded-xl text-sm"
                style={{ color: 'var(--color-text-secondary)' }}
              >
                <NavIcon icon="dashboard" size={22} />
                <span>{t('common.backToHome')}</span>
              </Link>
            </div>
          </div>
        </>
      )}

      {/* ── Mobile: Slide-in sidebar for hamburger (legacy, hidden if bottom nav is used) ── */}
      {collapsed && !showMore && (
        <div className="lg:hidden fixed inset-0 bg-black/40 z-40" onClick={() => setCollapsed(false)} />
      )}

      {/* ── Desktop: Full sidebar ── */}
      <aside className={`
        hidden lg:flex lg:sticky top-0 left-0 z-50 lg:z-auto
        h-screen w-64 bg-gradient-to-b ${colors.gradient} text-white
        flex-col shadow-xl
      `}>
        {/* Logo area */}
        <div className="px-5 py-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-lg font-bold backdrop-blur-sm">
              {title.charAt(0)}
            </div>
            <div>
              <h1 className="font-bold text-base leading-tight">{title}</h1>
              {subtitle && <p className="text-xs text-white/60 mt-0.5">{subtitle}</p>}
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto overscroll-contain">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 ${
                  isActive
                    ? colors.active
                    : `${colors.text} ${colors.hover}`
                }`}
              >
                <NavIcon icon={item.icon} size={18} />
                <span>{t(item.label)}</span>
              </Link>
            );
          })}
        </nav>

        {/* Bottom */}
        <div className="px-3 py-4 border-t border-white/10 space-y-0.5">
          <button
            onClick={() => setLang(lang === 'en' ? 'kh' : 'en')}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm w-full text-left ${colors.text} ${colors.hover} transition-colors`}
          >
            <IconGlobe size={18} />
            <span>{lang === 'en' ? 'ភាសាខ្មែរ' : 'English'}</span>
          </button>
          <Link
            href="/"
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm ${colors.text} ${colors.hover} transition-colors`}
          >
            <IconDashboard size={18} />
            <span>{t('common.backToHome')}</span>
          </Link>
          <button
            onClick={handleLogout}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm w-full text-left ${colors.text} ${colors.hover} transition-colors`}
          >
            <IconLogout size={18} />
            <span>{t('common.logout')}</span>
          </button>
        </div>
      </aside>
    </>
  );
}
