'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useLanguage } from '../lib/i18n'
import { IconShield, IconBook, IconGraduation, IconBriefcase, IconCamera, IconBarChart } from '../components/Icons'

/* ─── Types ─────────────────────────────────────────────── */
interface HeroSlide {
  id: string
  imageUrl: string
  title: string
  subtitle: string
  ctaLabel: string
  ctaHref: string
}
interface SiteSettings {
  siteName: string
  siteTagline: string
  logoUrl: string
  heroSlides: HeroSlide[]
  footerAddress: string
  footerPhone: string
  footerEmail: string
  footerFacebook: string
  footerInstagram: string
  footerTwitter: string
  footerYoutube: string
  footerCopyright: string
  primaryColor: string
}

const DEFAULT_SETTINGS: SiteSettings = {
  siteName: 'Wattaman',
  siteTagline: 'Smart School Management System',
  logoUrl: '',
  heroSlides: [],
  footerAddress: '',
  footerPhone: '',
  footerEmail: '',
  footerFacebook: '',
  footerInstagram: '',
  footerTwitter: '',
  footerYoutube: '',
  footerCopyright: `© ${new Date().getFullYear()} Wattaman School. All rights reserved.`,
  primaryColor: '#FF6B2C',
}

/* ─── Portal definitions ─────────────────────────────────── */
const portals = [
  {
    titleKey: 'home.adminPortal',
    descKey: 'home.adminDesc',
    href: '/admin',
    IconComp: IconShield,
    color: '#7C3AED',
    bg: 'from-violet-500 to-indigo-600',
    light: '#EDE9FE',
    emoji: '🛡️',
  },
  {
    titleKey: 'home.teacherPortal',
    descKey: 'home.teacherDesc',
    href: '/teacher',
    IconComp: IconBook,
    color: '#059669',
    bg: 'from-emerald-500 to-teal-600',
    light: '#D1FAE5',
    emoji: '📚',
  },
  {
    titleKey: 'home.studentPortal',
    descKey: 'home.studentDesc',
    href: '/student',
    IconComp: IconGraduation,
    color: '#0284C7',
    bg: 'from-sky-500 to-blue-600',
    light: '#E0F2FE',
    emoji: '🎓',
  },
  {
    titleKey: 'home.employeePortal',
    descKey: 'home.employeeDesc',
    href: '/employee',
    IconComp: IconBriefcase,
    color: '#D97706',
    bg: 'from-amber-400 to-orange-500',
    light: '#FEF3C7',
    emoji: '💼',
  },
  {
    titleKey: 'home.wattamanPortal',
    descKey: 'home.wattamanDesc',
    href: '/wattaman',
    IconComp: IconCamera,
    color: '#0F766E',
    bg: 'from-teal-500 to-cyan-500',
    light: '#CCFBF1',
    emoji: '📷',
  },
  {
    titleKey: 'home.reporterPortal',
    descKey: 'home.reporterDesc',
    href: '/reporter',
    IconComp: IconBarChart,
    color: '#DB2777',
    bg: 'from-pink-500 to-rose-600',
    light: '#FCE7F3',
    emoji: '📊',
  },
]

/* ─── Default hero slides (shown before settings load) ───── */
const DEFAULT_SLIDES: HeroSlide[] = [
  {
    id: 'default-1',
    imageUrl: '',
    title: 'Welcome to Wattaman School',
    subtitle: 'A modern, smart school management system for students, teachers & parents.',
    ctaLabel: 'Sign In',
    ctaHref: '/login',
  },
  {
    id: 'default-2',
    imageUrl: '',
    title: 'Smart Attendance & Tracking',
    subtitle: 'Real-time QR-code attendance, live dashboards, and instant notifications.',
    ctaLabel: 'Learn More',
    ctaHref: '/login',
  },
  {
    id: 'default-3',
    imageUrl: '',
    title: 'All-in-One School Portal',
    subtitle: 'Exams, timetables, salary, fees, reports — everything in one place.',
    ctaLabel: 'Get Started',
    ctaHref: '/login',
  },
]

/* ─── Slide gradient backgrounds (when no image set) ──────── */
const SLIDE_GRADIENTS = [
  'from-orange-500 via-rose-500 to-pink-600',
  'from-indigo-600 via-purple-600 to-pink-500',
  'from-teal-500 via-cyan-500 to-blue-600',
]

/* ─── Feature / value items ──────────────────────────────── */
const features = [
  { icon: '⚡', title: 'QR Attendance', desc: 'Instant check-in via QR code scanning — no paper, no delay.', color: '#FF6B2C' },
  { icon: '📡', title: 'Real-time Tracking', desc: 'Live dashboards updated instantly as students check in.', color: '#7C3AED' },
  { icon: '📊', title: 'Smart Reports', desc: 'Auto-generated CSV & PDF reports for classes and staff.', color: '#0284C7' },
  { icon: '🔔', title: 'Instant Alerts', desc: 'Parents receive push notifications for absences and events.', color: '#059669' },
  { icon: '🏫', title: 'Multi-campus', desc: 'Manage multiple schools, branches, and departments.', color: '#DB2777' },
  { icon: '🔒', title: 'Secure & Reliable', desc: 'Role-based access controls with JWT auth and audit logs.', color: '#D97706' },
]

const stats = [
  { value: '1,000+', label: 'Active Students', icon: '👨‍🎓' },
  { value: '50+', label: 'Teachers', icon: '👩‍🏫' },
  { value: '99.9%', label: 'Uptime', icon: '⚡' },
  { value: '24/7', label: 'Support', icon: '🛡️' },
]

/* ─── Hero Slider component ──────────────────────────────── */

function HeroSlider({ slides, primaryColor }: { slides: HeroSlide[]; primaryColor: string }) {
  const [current, setCurrent] = useState(0)
  const [animating, setAnimating] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const goTo = useCallback((idx: number) => {
    if (animating) return
    setAnimating(true)
    setCurrent(idx)
    setTimeout(() => setAnimating(false), 600)
  }, [animating])

  const next = useCallback(() => goTo((current + 1) % slides.length), [goTo, current, slides.length])
  const prev = useCallback(() => goTo((current - 1 + slides.length) % slides.length), [goTo, current, slides.length])

  useEffect(() => {
    if (slides.length <= 1) return
    timerRef.current = setTimeout(next, 5500)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [next, slides.length])

  if (slides.length === 0) return null
  const slide = slides[current]
  const gradClass = SLIDE_GRADIENTS[current % SLIDE_GRADIENTS.length]

  return (
    <div className="relative w-full h-[520px] md:h-[640px] overflow-hidden">
      {/* Background image or gradient */}
      {slide.imageUrl ? (
        <div className="absolute inset-0">
          <img
            src={slide.imageUrl}
            alt={slide.title}
            className="w-full h-full object-cover"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-transparent" />
        </div>
      ) : (
        <div className={`absolute inset-0 bg-gradient-to-br ${gradClass}`}>
          {/* Decorative circles */}
          <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full bg-white/10" />
          <div className="absolute -bottom-32 -left-16 w-96 h-96 rounded-full bg-white/10" />
          <div className="absolute top-1/3 right-1/4 w-40 h-40 rounded-full bg-white/10" />
        </div>
      )}

      {/* Slide content */}
      <div className="relative z-10 h-full flex items-center">
        <div className="max-w-7xl mx-auto px-6 md:px-12 w-full">
          <div
            key={current}
            className="max-w-2xl"
            style={{ animation: 'slideInLeft 0.6s ease-out' }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/20 backdrop-blur-sm text-white text-sm font-semibold mb-5">
              <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
              Wattaman School
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white leading-tight mb-5 drop-shadow-md">
              {slide.title}
            </h1>
            <p className="text-white/85 text-lg leading-relaxed mb-8 max-w-xl">
              {slide.subtitle}
            </p>
            {slide.ctaLabel && (
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href={slide.ctaHref || '/login'}
                  className="inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl font-bold text-white text-base transition-all hover:shadow-2xl hover:-translate-y-0.5 active:translate-y-0"
                  style={{ backgroundColor: primaryColor, boxShadow: `0 8px 24px ${primaryColor}55` }}
                >
                  {slide.ctaLabel}
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                  </svg>
                </Link>
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl font-semibold bg-white/20 backdrop-blur-sm text-white text-sm border border-white/30 hover:bg-white/30 transition-all"
                >
                  Sign In →
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Arrows */}
      {slides.length > 1 && (
        <>
          <button
            onClick={prev}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-20 w-11 h-11 flex items-center justify-center rounded-full bg-white/20 backdrop-blur-sm border border-white/30 text-white hover:bg-white/35 transition-all"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={next}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-20 w-11 h-11 flex items-center justify-center rounded-full bg-white/20 backdrop-blur-sm border border-white/30 text-white hover:bg-white/35 transition-all"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </>
      )}

      {/* Dots */}
      {slides.length > 1 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex gap-2">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className={`transition-all rounded-full ${i === current ? 'w-8 h-2.5' : 'w-2.5 h-2.5 opacity-50'} bg-white`}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── Main page ──────────────────────────────────────────── */

export default function Home() {
  const { lang, setLang, t } = useLanguage()
  const [settings, setSettings] = useState<SiteSettings>(DEFAULT_SETTINGS)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    fetch('/api/site-settings')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => { if (data) setSettings({ ...DEFAULT_SETTINGS, ...data }) })
      .catch(() => {})
  }, [])

  const slides = settings.heroSlides?.length > 0 ? settings.heroSlides : DEFAULT_SLIDES
  const primary = settings.primaryColor || '#FF6B2C'

  return (
    <div className="min-h-screen bg-white" style={{ fontFamily: 'var(--font-inter), sans-serif' }}>

      {/* ══════════════ TOP BAR ══════════════ */}
      {(settings.footerPhone || settings.footerEmail) && (
        <div className="hidden md:block text-white text-sm py-2" style={{ backgroundColor: primary }}>
          <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
            <div className="flex items-center gap-6">
              {settings.footerPhone && (
                <span className="flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
                  </svg>
                  {settings.footerPhone}
                </span>
              )}
              {settings.footerEmail && (
                <span className="flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                  </svg>
                  {settings.footerEmail}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {settings.footerFacebook && <a href={settings.footerFacebook} target="_blank" rel="noopener noreferrer" className="hover:opacity-75 transition-opacity">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/></svg>
              </a>}
              {settings.footerInstagram && <a href={settings.footerInstagram} target="_blank" rel="noopener noreferrer" className="hover:opacity-75 transition-opacity">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="0.5" fill="white"/></svg>
              </a>}
              {settings.footerTwitter && <a href={settings.footerTwitter} target="_blank" rel="noopener noreferrer" className="hover:opacity-75 transition-opacity">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
              </a>}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ HEADER ══════════════ */}
      <header className="sticky top-0 z-50 bg-white shadow-sm border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-6 py-3.5 flex items-center justify-between">
          {/* Logo + name */}
          <Link href="/" className="flex items-center gap-3 group">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm overflow-hidden transition-transform group-hover:scale-105"
              style={{ background: `linear-gradient(135deg, ${primary}, ${primary}cc)` }}
            >
              {settings.logoUrl ? (
                <img src={settings.logoUrl} alt={settings.siteName} className="w-full h-full object-contain" />
              ) : (
                <Image src="/logo.png" alt="Wattaman" width={24} height={24} className="brightness-0 invert" />
              )}
            </div>
            <div className="leading-tight">
              <p className="font-extrabold text-gray-900 text-[17px] tracking-tight">{settings.siteName}</p>
              {settings.siteTagline && (
                <p className="text-[10px] text-gray-400 font-medium leading-none">{settings.siteTagline}</p>
              )}
            </div>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {[
              { label: 'Home', href: '/' },
              { label: 'Admin', href: '/admin' },
              { label: 'Teacher', href: '/teacher' },
              { label: 'Student', href: '/student' },
              { label: 'Parent', href: '/parent' },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="px-3.5 py-2 rounded-lg text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-all"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Right actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLang(lang === 'en' ? 'kh' : 'en')}
              className="hidden md:flex px-3.5 py-1.5 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-100 transition-colors items-center gap-1"
            >
              🌐 {lang === 'en' ? 'ភាសាខ្មែរ' : 'English'}
            </button>
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl text-sm font-bold text-white transition-all hover:shadow-lg hover:-translate-y-px"
              style={{ background: `linear-gradient(135deg, ${primary}, ${primary}cc)`, boxShadow: `0 4px 14px ${primary}44` }}
            >
              {t('common.signIn')}
            </Link>
            {/* Mobile hamburger */}
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="md:hidden w-9 h-9 flex items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                {menuOpen
                  ? <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                  : <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16"/>}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="md:hidden border-t border-gray-100 bg-white px-6 py-4 space-y-1">
            {[
              { label: 'Home', href: '/' },
              { label: 'Admin', href: '/admin' },
              { label: 'Teacher', href: '/teacher' },
              { label: 'Student', href: '/student' },
              { label: 'Parent', href: '/parent' },
            ].map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setMenuOpen(false)}
                className="block px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50">
                {item.label}
              </Link>
            ))}
            <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
              <button onClick={() => setLang(lang === 'en' ? 'kh' : 'en')} className="text-sm text-gray-500">
                🌐 {lang === 'en' ? 'ភាសាខ្មែរ' : 'English'}
              </button>
            </div>
          </div>
        )}
      </header>

      {/* ══════════════ HERO SLIDER ══════════════ */}
      <HeroSlider slides={slides} primaryColor={primary} />

      {/* ══════════════ STATS BAR ══════════════ */}
      <div className="py-10" style={{ background: primary }}>
        <div className="max-w-5xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-6 text-center text-white">
          {stats.map((s) => (
            <div key={s.label} className="space-y-1">
              <div className="text-3xl">{s.icon}</div>
              <p className="text-2xl font-extrabold">{s.value}</p>
              <p className="text-white/75 text-sm font-medium">{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ══════════════ PORTALS / PROGRAMS ══════════════ */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-6">
          {/* Section header */}
          <div className="text-center mb-12">
            <span
              className="inline-block px-4 py-1.5 rounded-full text-sm font-bold mb-3"
              style={{ backgroundColor: `${primary}18`, color: primary }}
            >
              Access Your Portal
            </span>
            <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-3">
              All Portals in One Place
            </h2>
            <p className="text-gray-500 max-w-xl mx-auto">
              Sign in to your role-specific portal for attendance, grades, reports, and more.
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-5">
            {portals.map((portal) => (
              <Link
                key={portal.href}
                href={portal.href}
                className="group flex flex-col items-center text-center gap-3 p-5 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-xl hover:-translate-y-2 transition-all duration-300"
              >
                {/* Circle icon */}
                <div
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white bg-gradient-to-br ${portal.bg} shadow-md group-hover:scale-110 transition-transform`}
                >
                  <portal.IconComp size={24} />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-800 leading-snug">{t(portal.titleKey)}</p>
                  <p className="text-xs text-gray-400 mt-0.5 leading-snug">{t(portal.descKey)}</p>
                </div>
                <span
                  className="text-xs font-bold flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ color: portal.color }}
                >
                  Enter →
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════ ABOUT / INTRO SECTION ══════════════ */}
      <section className="py-20 bg-white overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-2 gap-12 items-center">
          {/* Left: image / illustration */}
          <div className="relative order-2 md:order-1">
            <div
              className="absolute -left-8 -top-8 w-64 h-64 rounded-full opacity-15"
              style={{ backgroundColor: primary }}
            />
            <div
              className="absolute -right-4 -bottom-4 w-48 h-48 rounded-full opacity-10"
              style={{ backgroundColor: '#7C3AED' }}
            />
            <div className="relative rounded-3xl overflow-hidden shadow-2xl bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-100 flex items-center justify-center"
              style={{ minHeight: 340 }}>
              <div className="text-center p-10">
                <div className="text-8xl mb-4">🏫</div>
                <p className="text-2xl font-bold text-gray-700">{settings.siteName}</p>
                <p className="text-gray-500 mt-2">{settings.siteTagline}</p>
              </div>
            </div>
          </div>

          {/* Right: text */}
          <div className="order-1 md:order-2 space-y-6">
            <div>
              <span
                className="inline-block px-4 py-1.5 rounded-full text-sm font-bold mb-3"
                style={{ backgroundColor: `${primary}18`, color: primary }}
              >
                About Wattaman
              </span>
              <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 leading-tight mb-4">
                A Smarter Way to <span style={{ color: primary }}>Manage Your School</span>
              </h2>
              <p className="text-gray-500 leading-relaxed mb-4">
                Wattaman is an all-in-one school management platform designed for modern educational institutions.
                From QR-code attendance to fee management, timetables, and parent communication — everything runs
                seamlessly in one place.
              </p>
              <p className="text-gray-500 leading-relaxed">
                Our platform empowers administrators, teachers, students, and parents with real-time data and
                smart tools so that everyone stays informed and connected.
              </p>
            </div>
            <ul className="space-y-3">
              {['Full-day & session attendance tracking', 'Automated reports & CSV exports', 'Parent portal with push notifications', 'Role-based access for every user type'].map((item) => (
                <li key={item} className="flex items-center gap-3 text-sm text-gray-700">
                  <span
                    className="w-6 h-6 rounded-full flex items-center justify-center flex-none"
                    style={{ backgroundColor: primary }}
                  >
                    <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7"/>
                    </svg>
                  </span>
                  {item}
                </li>
              ))}
            </ul>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl font-bold text-white transition-all hover:shadow-lg hover:-translate-y-0.5"
              style={{ background: `linear-gradient(135deg, ${primary}, ${primary}bb)`, boxShadow: `0 6px 20px ${primary}44` }}
            >
              Get Started Today
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* ══════════════ FEATURES / VALUES ══════════════ */}
      <section className="py-20" style={{ background: 'linear-gradient(135deg, #FFF7F0 0%, #FFF0F9 100%)' }}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-12">
            <span
              className="inline-block px-4 py-1.5 rounded-full text-sm font-bold mb-3"
              style={{ backgroundColor: `${primary}18`, color: primary }}
            >
              Our Core Features
            </span>
            <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 mb-3">
              Everything Your School Needs
            </h2>
            <p className="text-gray-500 max-w-xl mx-auto">
              Built for real schools. Designed for real people.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f) => (
              <div
                key={f.title}
                className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all group"
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl mb-4 shadow-sm group-hover:scale-110 transition-transform"
                  style={{ backgroundColor: `${f.color}15` }}
                >
                  {f.icon}
                </div>
                <h3 className="text-base font-bold text-gray-900 mb-2" style={{ color: f.color }}>{f.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════ CTA BANNER ══════════════ */}
      <section
        className="py-16 relative overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${primary} 0%, #7C3AED 100%)` }}
      >
        <div className="absolute -top-16 -right-16 w-72 h-72 rounded-full bg-white/10" />
        <div className="absolute -bottom-20 -left-12 w-64 h-64 rounded-full bg-white/10" />
        <div className="relative max-w-4xl mx-auto px-6 text-center text-white">
          <h2 className="text-3xl md:text-4xl font-extrabold mb-4">
            Ready to Transform Your School?
          </h2>
          <p className="text-white/80 text-lg mb-8 max-w-2xl mx-auto">
            Join thousands of students, teachers, and parents already using Wattaman every day.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-8 py-3.5 rounded-2xl font-bold bg-white transition-all hover:shadow-2xl hover:-translate-y-0.5"
              style={{ color: primary }}
            >
              Sign In Now
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
              </svg>
            </Link>
            <Link
              href="/admin"
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl font-semibold bg-white/20 text-white border border-white/30 hover:bg-white/30 transition-all text-sm"
            >
              Admin Dashboard →
            </Link>
          </div>
        </div>
      </section>

      {/* ══════════════ FOOTER ══════════════ */}
      <footer className="bg-gray-900 text-white">
        <div className="max-w-7xl mx-auto px-6 py-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
          {/* Brand */}
          <div className="lg:col-span-1 space-y-4">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: `linear-gradient(135deg, ${primary}, ${primary}cc)` }}
              >
                {settings.logoUrl ? (
                  <img src={settings.logoUrl} alt={settings.siteName} className="w-full h-full object-contain rounded-xl" />
                ) : (
                  <Image src="/logo.png" alt="Wattaman" width={22} height={22} className="brightness-0 invert" />
                )}
              </div>
              <span className="font-extrabold text-lg">{settings.siteName}</span>
            </div>
            <p className="text-gray-400 text-sm leading-relaxed">{settings.siteTagline}</p>
            {/* Social icons */}
            <div className="flex gap-3 pt-1">
              {settings.footerFacebook && (
                <a href={settings.footerFacebook} target="_blank" rel="noopener noreferrer"
                  className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-blue-600 transition-colors">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M18 2h-3a5 5 0 00-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 011-1h3z"/></svg>
                </a>
              )}
              {settings.footerInstagram && (
                <a href={settings.footerInstagram} target="_blank" rel="noopener noreferrer"
                  className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-pink-600 transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="0.5" fill="white" strokeWidth={0}/>
                  </svg>
                </a>
              )}
              {settings.footerTwitter && (
                <a href={settings.footerTwitter} target="_blank" rel="noopener noreferrer"
                  className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-sky-500 transition-colors">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                </a>
              )}
              {settings.footerYoutube && (
                <a href={settings.footerYoutube} target="_blank" rel="noopener noreferrer"
                  className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-red-600 transition-colors">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M22.54 6.42a2.78 2.78 0 00-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46a2.78 2.78 0 00-1.95 1.96A29 29 0 001 12a29 29 0 00.46 5.58a2.78 2.78 0 001.95 1.96C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 001.95-1.96A29 29 0 0023 12a29 29 0 00-.46-5.58zM9.75 15.02V8.98L15.5 12l-5.75 3.02z"/></svg>
                </a>
              )}
            </div>
          </div>

          {/* Quick links */}
          <div>
            <h4 className="font-bold text-white mb-4 text-sm uppercase tracking-wider">Quick Links</h4>
            <ul className="space-y-2.5">
              {[
                { label: 'Home', href: '/' },
                { label: 'Admin Portal', href: '/admin' },
                { label: 'Teacher Portal', href: '/teacher' },
                { label: 'Student Portal', href: '/student' },
                { label: 'Parent Portal', href: '/parent' },
                { label: 'Sign In', href: '/login' },
              ].map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="text-gray-400 hover:text-white text-sm transition-colors flex items-center gap-1.5">
                    <span style={{ color: primary }}>›</span> {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Portals */}
          <div>
            <h4 className="font-bold text-white mb-4 text-sm uppercase tracking-wider">Management</h4>
            <ul className="space-y-2.5">
              {[
                { label: 'Attendance Tracking', href: '/admin/attendance' },
                { label: 'Fee Management', href: '/admin/fees' },
                { label: 'Exam & Scoring', href: '/admin/exams' },
                { label: 'Timetables', href: '/admin/timetable' },
                { label: 'Reports & Analytics', href: '/admin/reports' },
                { label: 'Settings', href: '/admin/settings' },
              ].map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="text-gray-400 hover:text-white text-sm transition-colors flex items-center gap-1.5">
                    <span style={{ color: primary }}>›</span> {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-bold text-white mb-4 text-sm uppercase tracking-wider">Contact</h4>
            <ul className="space-y-3">
              {settings.footerAddress && (
                <li className="flex gap-2.5 text-sm text-gray-400">
                  <svg className="w-4 h-4 flex-none mt-0.5" style={{ color: primary }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
                  </svg>
                  {settings.footerAddress}
                </li>
              )}
              {settings.footerPhone && (
                <li className="flex gap-2.5 text-sm text-gray-400">
                  <svg className="w-4 h-4 flex-none mt-0.5" style={{ color: primary }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"/>
                  </svg>
                  {settings.footerPhone}
                </li>
              )}
              {settings.footerEmail && (
                <li className="flex gap-2.5 text-sm text-gray-400">
                  <svg className="w-4 h-4 flex-none mt-0.5" style={{ color: primary }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                  </svg>
                  {settings.footerEmail}
                </li>
              )}
              {!settings.footerAddress && !settings.footerPhone && !settings.footerEmail && (
                <li className="text-sm text-gray-500 italic">Configure contact info in Admin → Appearance</li>
              )}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-gray-800">
          <div className="max-w-7xl mx-auto px-6 py-5 flex flex-col md:flex-row items-center justify-between gap-3 text-sm text-gray-500">
            <p>{settings.footerCopyright || `© ${new Date().getFullYear()} Wattaman School. All rights reserved.`}</p>
            <div className="flex items-center gap-4">
              <button onClick={() => setLang(lang === 'en' ? 'kh' : 'en')} className="flex items-center gap-1.5 hover:text-white transition-colors">
                🌐 {lang === 'en' ? 'ភាសាខ្មែរ' : 'English'}
              </button>
              <Link href="/login" className="hover:text-white transition-colors">Sign In</Link>
            </div>
          </div>
        </div>
      </footer>

      {/* Slide-in animation keyframe */}
      <style jsx global>{`
        @keyframes slideInLeft {
          from { opacity: 0; transform: translateX(-40px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  )
}