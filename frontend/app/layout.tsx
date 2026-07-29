import type { Metadata, Viewport } from 'next'
import { Inter, Noto_Sans_Khmer } from 'next/font/google'
import Providers from './providers'
import { getSiteSettings } from '../lib/getSiteSettings'
import './styles.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const notoSansKhmer = Noto_Sans_Khmer({
  subsets: ['khmer'],
  variable: '--font-khmer',
  weight: ['400', '500', '600', '700'],
})

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
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href={khmerFontsUrl} rel="stylesheet" />
      </head>
      <body className={`${inter.variable} ${notoSansKhmer.variable} font-sans`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
