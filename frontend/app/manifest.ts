import type { MetadataRoute } from 'next';
import { getSiteSettings } from '../lib/getSiteSettings';

// Dynamic replacement for the old static public/manifest.json — Next.js
// serves this at /manifest.webmanifest and links it automatically, no
// `manifest:` field needed in generateMetadata. See Phase 5c of the
// multi-tenant conversion plan: PWA installs now reflect the school actually
// being visited instead of being permanently branded "Wattaman".
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const settings = await getSiteSettings();
  const name = settings?.siteName || 'Wattaman';
  const themeColor = settings?.primaryColor || '#00C9A7';

  return {
    name,
    short_name: name,
    description: settings?.siteTagline || 'Modern school attendance management system',
    start_url: '/',
    display: 'standalone',
    background_color: themeColor,
    theme_color: themeColor,
    icons: settings?.logoUrl
      ? [{ src: settings.logoUrl, sizes: '512x512', type: 'image/png', purpose: 'any' }]
      : [
          { src: '/logo.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
        ],
  };
}
