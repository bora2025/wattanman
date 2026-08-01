import type { Metadata, Viewport } from 'next'
import { Inter, Noto_Sans_Khmer, Poppins, Nunito, Manrope, Roboto } from 'next/font/google'
import Providers from './providers'
import { getSiteSettings } from '../lib/getSiteSettings'
import './styles.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const notoSansKhmer = Noto_Sans_Khmer({
  subsets: ['khmer'],
  variable: '--font-khmer',
  weight: ['400', '500', '600', '700'],
})

// The 4 additional curated theme fonts (Phase 19) — next/font/google is a
// build-time API, so a theme can only ever switch between fonts imported
// here, not fetch an arbitrary Google Font at runtime. Next.js only ships
// the woff files a page's rendered classNames actually reference, so having
// all 5 imported unconditionally doesn't bloat pages that end up using just
// one. `frontend/lib/appearance/themeFonts.ts` is the single source of truth
// mapping each font id to its CSS variable — keep that file in sync with
// this list.
const poppins = Poppins({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-poppins' })
const nunito = Nunito({ subsets: ['latin'], variable: '--font-nunito' })
const manrope = Manrope({ subsets: ['latin'], variable: '--font-manrope' })
const roboto = Roboto({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-roboto' })

const khmerFontsUrl = 'https://fonts.googleapis.com/css2?family=Battambang:wght@400;700&family=Bokor&family=Chenla&family=Content&family=Hanuman:wght@400;700&family=Koulen&family=Moul&family=Siemreap&display=swap';

// Per-tenant branding (Phase 5c of the multi-tenant conversion plan) — falls
// back to Wattaman's own static defaults on the platform host, during local
// dev without a resolvable tenant, or if the backend is unreachable. See
// lib/getSiteSettings.ts for how the current school is resolved.
export async function generateViewport(): Promise<Viewport> {
  const settings = await getSiteSettings();
  return {
    width: 'device-width',
    initialScale: 1,
    maximumScale: 1,
    themeColor: settings?.primaryColor || '#00C9A7',
  };
}

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();
  const siteName = settings?.siteName || 'Wattaman';
  return {
    title: siteName,
    description: settings?.siteTagline || 'Modern school attendance management system',
    // No `manifest:` field — app/manifest.ts's file-convention route is
    // linked automatically by Next.js.
    icons: {
      icon: settings?.logoUrl || '/favicon.svg',
      apple: settings?.logoUrl || '/logo.png',
    },
  };
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        {/* Applies a saved dark-mode preference before first paint, so there's
            no flash of the light theme while React hydrates. Default stays
            light if nothing is saved — see lib/theme.tsx. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem('theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}`,
          }}
        />
        {/* Same anti-flash approach as dark mode above, for the personal
            (device-local) theme knobs from Phase 19 — reads what was last
            applied via the Appearance tab and sets the CSS variables before
            first paint. A school's public site (app/page.tsx) sets these
            server-side instead, from SiteSettings — see Branch F. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var s=localStorage.getItem('themeVars');if(s){var v=JSON.parse(s);var r=document.documentElement.style;if(v.primaryColor)r.setProperty('--brand-600',v.primaryColor);if(v.secondaryColor)r.setProperty('--brand-secondary-600',v.secondaryColor);if(v.font)r.setProperty('--font-theme','var(--font-'+v.font+')');if(v.radiusCard)r.setProperty('--radius-card',v.radiusCard);if(v.radiusBtn)r.setProperty('--radius-btn',v.radiusBtn)}}catch(e){}`,
          }}
        />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href={khmerFontsUrl} rel="stylesheet" />
      </head>
      <body className={`${inter.variable} ${notoSansKhmer.variable} ${poppins.variable} ${nunito.variable} ${manrope.variable} ${roboto.variable} font-sans`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
