import { NextRequest, NextResponse } from 'next/server';

/**
 * Frontend tenant routing (Phase 5b of the multi-tenant conversion plan).
 *
 * Deliberately minimal: this does NOT decide whether a subdomain corresponds
 * to a real, active school — that stays server-side (backend's
 * TenantHostMiddleware, which is the actual source of truth and the only
 * place a `SUSPENDED` school's access is enforced). A second, edge-cached
 * copy of tenant existence here would go stale independently of the backend
 * and require its own invalidation story for no real benefit. All this does
 * is keep the *shape* of routes sane for the two host classes:
 *   - platform host: role dashboards (which need a resolved school) make no
 *     sense here, so redirect them toward /platform.
 *   - school subdomains: /platform/* makes no sense here either — redirected
 *     as defense-in-depth only. The real boundary is the backend's
 *     PlatformScopeGuard; a determined client can't get anywhere by bypassing
 *     this, since every Platform API call still requires a PLATFORM_ADMIN JWT
 *     issued on the platform host in the first place.
 */

const ROLE_DASHBOARD_PREFIXES = [
  '/admin',
  '/teacher',
  '/student',
  '/parent',
  '/accounter',
  '/employee',
  '/reporter',
  '/wattaman',
];

function matchesAnyPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function middleware(req: NextRequest) {
  const host = (req.headers.get('host') || '').split(':')[0].toLowerCase();
  const platformHost = (process.env.PLATFORM_HOST || '').split(':')[0].toLowerCase();
  const isPlatformHost = !!platformHost && host === platformHost;
  const { pathname } = req.nextUrl;

  const isRoleDashboardPath = matchesAnyPrefix(pathname, ROLE_DASHBOARD_PREFIXES);
  const isPlatformPath = pathname === '/platform' || pathname.startsWith('/platform/');

  if (isPlatformHost && isRoleDashboardPath) {
    return NextResponse.redirect(new URL('/platform', req.url));
  }

  if (!isPlatformHost && isPlatformPath) {
    return NextResponse.redirect(new URL('/login', req.url));
  }

  // `/` on a school subdomain renders the same page.tsx as the platform
  // host, but it's already fully per-tenant: it fetches this school's own
  // SiteSettings (logo, hero, about, posts) via the Host-resolved
  // /api/site-settings, same as everywhere else in the app, and already has
  // "Sign In" links through to /login throughout. No redirect needed.

  return NextResponse.next();
}

export const config = {
  // Skip static assets and the API proxy route — redirect logic here would
  // be meaningless (or actively harmful, for the API) on those paths.
  matcher: ['/((?!_next/static|_next/image|favicon\\.svg|logo\\.png|manifest\\.webmanifest|sw\\.js|api/).*)'],
};
