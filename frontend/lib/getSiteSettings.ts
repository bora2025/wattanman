import { headers } from 'next/headers';

export interface ResolvedSiteSettings {
  siteName: string;
  siteTagline: string;
  logoUrl: string;
  primaryColor: string;
}

/**
 * Server-only helper for per-tenant branding (Phase 5c of the multi-tenant
 * conversion plan). Reads the incoming request's Host header and forwards it
 * to the backend as `x-tenant-host` — the same header the API proxy route
 * (app/api/[...path]/route.ts) forwards for ordinary client-side calls — so
 * `TenantHostMiddleware` on the backend resolves the same school a browser
 * hitting this same host would see. This calls the backend directly (not
 * through the proxy route) since it runs during server-side
 * rendering/metadata generation, before there's a browser request to proxy.
 *
 * Next.js automatically memoizes identical fetch calls within one render
 * pass, so calling this from generateMetadata, generateViewport, and
 * app/manifest.ts on the same request results in a single network call.
 */
export async function getSiteSettings(): Promise<ResolvedSiteSettings | null> {
  try {
    const hdrs = await headers();
    const host = hdrs.get('host') || '';
    const apiBase = (process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/+$/, '');
    const res = await fetch(`${apiBase}/site-settings`, {
      headers: { 'x-tenant-host': host },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    // Platform host, unknown host during local dev, or backend unreachable —
    // callers fall back to Wattaman's own static defaults either way.
    return null;
  }
}
