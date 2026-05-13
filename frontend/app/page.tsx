'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useLanguage } from '../lib/i18n'
import { IconShield, IconBook, IconGraduation, IconBriefcase, IconCamera } from '../components/Icons'

const portals = [
  {
    titleKey: 'home.adminPortal',
    descKey: 'home.adminDesc',
    href: '/admin',
    IconComp: IconShield,
    gradient: 'from-violet-500 to-indigo-600',
    accentText: '#4F46E5',
    borderColor: 'rgba(99,102,241,0.25)',
    glowColor: 'rgba(99,102,241,0.12)',
  },
  {
    titleKey: 'home.teacherPortal',
    descKey: 'home.teacherDesc',
    href: '/teacher',
    IconComp: IconBook,
    gradient: 'from-emerald-500 to-teal-600',
    accentText: '#059669',
    borderColor: 'rgba(16,185,129,0.25)',
    glowColor: 'rgba(16,185,129,0.1)',
  },
  {
    titleKey: 'home.studentPortal',
    descKey: 'home.studentDesc',
    href: '/student',
    IconComp: IconGraduation,
    gradient: 'from-sky-500 to-blue-600',
    accentText: '#0284C7',
    borderColor: 'rgba(14,165,233,0.25)',
    glowColor: 'rgba(14,165,233,0.1)',
  },
  {
    titleKey: 'home.employeePortal',
    descKey: 'home.employeeDesc',
    href: '/employee',
    IconComp: IconBriefcase,
    gradient: 'from-amber-500 to-orange-500',
    accentText: '#D97706',
    borderColor: 'rgba(245,158,11,0.25)',
    glowColor: 'rgba(245,158,11,0.1)',
  },
  {
    titleKey: 'home.wattamanPortal',
    descKey: 'home.wattamanDesc',
    href: '/wattaman',
    IconComp: IconCamera,
    gradient: 'from-teal-500 to-cyan-500',
    accentText: '#0F766E',
    borderColor: 'rgba(0,201,167,0.25)',
    glowColor: 'rgba(0,201,167,0.1)',
  },
]

export default function Home() {
  const { lang, setLang, t } = useLanguage()

  return (
    <div className="min-h-screen">

      {/* ═══════════════════════════════════════ MOBILE ═══ */}
      <div className="lg:hidden min-h-screen relative overflow-hidden flex flex-col">
        {/* Animated background orbs */}
        <div className="absolute inset-0 pointer-events-none" aria-hidden>
          <div className="absolute -top-24 -right-16 w-72 h-72 rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(0,201,167,0.28) 0%, transparent 70%)', animation: 'blob-drift 10s ease-in-out infinite' }} />
          <div className="absolute -bottom-20 -left-12 w-60 h-60 rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(56,189,248,0.22) 0%, transparent 70%)', animation: 'blob-drift 13s ease-in-out infinite reverse' }} />
          <div className="absolute top-1/2 right-0 w-36 h-36 rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.14) 0%, transparent 70%)' }} />
        </div>
        {/* Mobile background base */}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(155deg, #EEFFF7 0%, #E8F8FF 55%, #F0F4FF 100%)' }} />

        {/* Content */}
        <div className="flex-1 flex flex-col items-center justify-center px-8 relative z-10 pt-10">
          {/* Logo with glow */}
          <div className="relative mb-7 animate-fade-in-up">
            <div className="absolute inset-0 rounded-2xl"
              style={{ background: 'radial-gradient(circle, rgba(0,201,167,0.35), transparent)', transform: 'scale(1.6)', filter: 'blur(20px)' }} />
            <div className="w-24 h-24 rounded-2xl flex items-center justify-center relative shadow-2xl"
              style={{ background: 'linear-gradient(145deg, rgba(255,255,255,0.98), rgba(240,255,250,0.95))', boxShadow: '0 0 0 1px rgba(0,201,167,0.28), 0 20px 48px rgba(0,201,167,0.24), 0 4px 12px rgba(0,0,0,0.08)' }}>
              <Image src="/logo.png" alt="Wattaman" width={64} height={64} priority />
            </div>
          </div>

          <h1 className="text-4xl font-extrabold mb-2 tracking-tight text-center animate-fade-in-up-1"
            style={{ background: 'linear-gradient(135deg, #0F766E 0%, #00C9A7 60%, #38BDF8 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
            Wattaman
          </h1>
          <p className="text-sm text-center leading-relaxed max-w-xs animate-fade-in-up-2" style={{ color: 'var(--color-text-secondary)' }}>
            {t('home.heroDesc')}
          </p>

          {/* Feature chips */}
          <div className="flex flex-wrap gap-2 mt-5 justify-center animate-fade-in-up-3">
            {['QR Scan', 'Real-time', 'Multi-role'].map(feat => (
              <span key={feat} className="px-3 py-1 rounded-full text-xs font-semibold"
                style={{ background: 'rgba(0,201,167,0.1)', color: '#0F766E', border: '1px solid rgba(0,201,167,0.22)' }}>
                ✓ {feat}
              </span>
            ))}
          </div>
        </div>

        {/* Bottom actions */}
        <div className="px-8 pb-12 relative z-10 space-y-3">
          <Link href="/login"
            className="flex items-center justify-center gap-2 w-full text-white font-bold text-base py-4 transition-all active:scale-[0.97]"
            style={{ background: 'linear-gradient(135deg, #00C9A7, #00A88A)', borderRadius: '16px', boxShadow: '0 8px 28px rgba(0,168,138,0.35)' }}>
            {t('common.signIn')}
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
            </svg>
          </Link>
          <button
            onClick={() => setLang(lang === 'en' ? 'kh' : 'en')}
            className="w-full text-center text-sm py-2.5 font-medium rounded-xl transition-colors"
            style={{ color: 'var(--color-text-secondary)', background: 'rgba(255,255,255,0.62)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.75)' }}>
            🌐 {lang === 'en' ? 'ភាសាខ្មែរ' : 'English'}
          </button>
        </div>
      </div>

      {/* ══════════════════════════════════════ DESKTOP ═══ */}
      <div className="hidden lg:flex lg:flex-col min-h-screen">
        {/* Mesh background */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden>
          <div className="absolute w-[900px] h-[900px] -top-72 -left-72 rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(79,70,229,0.055) 0%, transparent 65%)', animation: 'blob-drift 18s ease-in-out infinite' }} />
          <div className="absolute w-[700px] h-[700px] -top-40 -right-56 rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.055) 0%, transparent 65%)', animation: 'blob-drift 22s ease-in-out infinite reverse' }} />
          <div className="absolute w-[600px] h-[600px] top-1/2 -right-40 rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(0,201,167,0.045) 0%, transparent 65%)' }} />
          <div className="absolute w-[500px] h-[500px] bottom-0 left-1/3 rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(245,158,11,0.04) 0%, transparent 65%)' }} />
        </div>

        {/* Glass Navbar */}
        <header className="relative z-20 sticky top-0"
          style={{ background: 'rgba(255,255,255,0.82)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(226,232,240,0.65)' }}>
          <div className="max-w-7xl mx-auto px-6 py-3.5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shadow-sm overflow-hidden"
                style={{ background: 'linear-gradient(135deg, #00C9A7, #0F766E)' }}>
                <Image src="/logo.png" alt="Wattaman" width={22} height={22} priority className="brightness-0 invert" />
              </div>
              <span className="font-bold text-slate-900 text-[17px] tracking-tight">Wattaman</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setLang(lang === 'en' ? 'kh' : 'en')}
                className="px-3.5 py-1.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100/80 transition-colors">
                🌐 {lang === 'en' ? 'ភាសាខ្មែរ' : 'English'}
              </button>
              <Link href="/login"
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl text-sm font-semibold text-white transition-all hover:shadow-lg hover:-translate-y-px active:translate-y-0"
                style={{ background: 'linear-gradient(135deg, #00C9A7, #00A88A)', boxShadow: '0 4px 12px rgba(0,168,138,0.3)' }}>
                {t('common.signIn')}
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
              </Link>
            </div>
          </div>
        </header>

        <main className="relative z-10 flex-1 max-w-7xl mx-auto w-full px-6 py-14 lg:py-20">
          {/* ── Hero ── */}
          <div className="text-center mb-16 animate-fade-in-up">
            {/* Live badge */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold mb-6"
              style={{ background: 'rgba(0,201,167,0.08)', color: '#0F766E', border: '1px solid rgba(0,201,167,0.22)' }}>
              <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#00C9A7' }} />
              {t('home.title')}
            </div>

            <h1 className="text-5xl md:text-6xl xl:text-7xl font-extrabold leading-[1.06] tracking-tight text-slate-900 mb-5">
              {t('home.heroLine1')}
              <br />
              <span style={{ background: 'linear-gradient(135deg, #4F46E5 0%, #0F766E 48%, #00C9A7 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
                {t('home.heroLine2')}
              </span>
            </h1>

            <p className="text-lg text-slate-500 max-w-xl mx-auto leading-relaxed mb-9">
              {t('home.heroDesc')}
            </p>

            <div className="flex items-center justify-center gap-3 flex-wrap">
              <Link href="/login"
                className="inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl font-bold text-white text-base transition-all hover:shadow-2xl hover:-translate-y-0.5"
                style={{ background: 'linear-gradient(135deg, #4F46E5, #6366F1)', boxShadow: '0 8px 24px rgba(79,70,229,0.32)' }}>
                {t('common.signIn')}
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                </svg>
              </Link>
              <Link href="/admin"
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl font-semibold text-slate-700 text-sm transition-all hover:shadow-md hover:-translate-y-0.5"
                style={{ background: 'rgba(255,255,255,0.85)', border: '1px solid rgba(226,232,240,0.9)', backdropFilter: 'blur(8px)', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                {t('home.adminPortal')} →
              </Link>
            </div>
          </div>

          {/* ── Portal Cards ── */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-10">
            {portals.map((portal, i) => (
              <Link key={portal.href} href={portal.href} className="group block"
                style={{ animationDelay: `${i * 0.08}s` }}>
                <div className="relative overflow-hidden bg-white/85 rounded-2xl p-5 h-full transition-all duration-300 group-hover:-translate-y-2 group-hover:shadow-2xl"
                  style={{ border: `1px solid ${portal.borderColor}`, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', backdropFilter: 'blur(4px)' }}>
                  {/* Gradient top accent bar */}
                  <div className={`absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r ${portal.gradient} rounded-t-2xl`} />
                  {/* Icon */}
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-white mb-4 shadow-md bg-gradient-to-br ${portal.gradient}`}>
                    <portal.IconComp size={20} />
                  </div>
                  <h2 className="text-sm font-bold text-slate-800 mb-1.5 leading-snug">{t(portal.titleKey)}</h2>
                  <p className="text-xs text-slate-500 leading-relaxed">{t(portal.descKey)}</p>
                  <div className="mt-3.5 text-xs font-bold flex items-center gap-1 transition-all group-hover:gap-2"
                    style={{ color: portal.accentText }}>
                    {t('common.openPortal')}
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                    </svg>
                  </div>
                  {/* Hover glow */}
                  <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                    style={{ background: `radial-gradient(circle at 50% 0%, ${portal.glowColor}, transparent 70%)` }} />
                </div>
              </Link>
            ))}
          </div>

          {/* ── Stats Bar ── */}
          <div className="rounded-2xl p-6 grid grid-cols-3 divide-x divide-slate-200/60"
            style={{ background: 'rgba(255,255,255,0.78)', border: '1px solid rgba(226,232,240,0.7)', backdropFilter: 'blur(14px)', boxShadow: '0 4px 20px rgba(0,0,0,0.05)' }}>
            {[
              { icon: '⚡', value: t('home.qrScan'), label: t('home.instantCheckIn') },
              { icon: '📡', value: t('home.realTime'), label: t('home.liveTracking') },
              { icon: '📊', value: t('home.reports'), label: t('home.csvAnalytics') },
            ].map((stat, i) => (
              <div key={i} className="text-center px-6 first:pl-0 last:pr-0">
                <div className="text-3xl mb-2">{stat.icon}</div>
                <p className="text-xl font-extrabold text-slate-800">{stat.value}</p>
                <p className="text-sm text-slate-500 mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>
        </main>

        <footer className="relative z-10 py-5 text-center text-xs text-slate-400 border-t border-slate-200/50">
          {t('home.footer')}
        </footer>
      </div>

    </div>
  )
}