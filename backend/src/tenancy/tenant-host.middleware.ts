import { ForbiddenException, Injectable, NestMiddleware, NotFoundException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PrismaService } from '../database/prisma.service';
import { tenantContext } from './tenant-context';
import { PLATFORM_SCHOOL_SUBDOMAIN } from './constants';
import { SchoolDomainService } from './school-domain.service';

/**
 * Resolves which school a request is for, from the Host header, and opens the
 * AsyncLocalStorage tenant context for the rest of the request before any
 * routing/guards/controllers run — including pre-auth endpoints like
 * /auth/login, since login itself needs to know which school's users to look
 * up against (email/phone are unique per-school, not globally, per Phase 1).
 *
 * The Host header used here is a *claim*, not yet authenticated — a client can
 * send any Host it likes. That's fine for this middleware's job (deciding which
 * school's login page / branding / pre-auth lookups apply), but it must NOT be
 * trusted as the authorization boundary for already-authenticated requests.
 * JwtAuthGuard (backend/src/auth/jwt-auth.guard.ts) re-establishes the
 * authoritative schoolId from the verified JWT claim once a token is checked,
 * and rejects if it disagrees with what this middleware resolved.
 */
@Injectable()
export class TenantHostMiddleware implements NestMiddleware {
  constructor(
    private prisma: PrismaService,
    private schoolDomains: SchoolDomainService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    // The frontend's API proxy (frontend/app/api/[...path]/route.ts) forwards the
    // browser's original Host as `x-tenant-host`, since it strips the raw `host`
    // header (which would otherwise just describe the proxy's own hostname, not
    // the tenant the browser actually visited). Direct backend callers without a
    // proxy in front (e.g. the mobile app) fall back to the raw Host header.
    const trustTenantProxyHeader =
      process.env.TRUST_TENANT_PROXY_HEADER !== 'false';
    const forwardedTenantHost = req.headers['x-tenant-host'];
    const rawHost =
      trustTenantProxyHeader && typeof forwardedTenantHost === 'string'
        ? forwardedTenantHost
        : req.headers.host || '';
    if (!rawHost) {
      throw new NotFoundException('Unable to determine school from request host');
    }

    // Intentionally the one unscoped School lookup in the codebase outside the
    // Platform module — this is the query that *establishes* tenancy, so there's
    // no tenant context yet for it to be scoped by.
    let school = await this.schoolDomains.resolve(rawHost);

    // Transition fallback: the Railway service domain (e.g.
    // wattanman-production.up.railway.app) doesn't match the subdomain a school
    // was seeded with (e.g. "default" via SEED_SCHOOL_SUBDOMAIN), so the lookup
    // above fails for every request even though the production data clearly
    // belongs to exactly one real school. Rather than 404 pre-auth logins for
    // existing users while the proper multi-tenant domain migration (custom
    // domains / re-seeding with the right subdomain) happens separately, fall
    // back to "the one non-Platform school" when it's unambiguous.
    //
    // This only ever applies to the sentinel-less case: if the host resolved to
    // PLATFORM_SCHOOL_SUBDOMAIN it already matched above (the Platform row
    // always exists), so we never accidentally fall back for Platform requests.
    const allowLegacyFallback = process.env.ALLOW_SINGLE_SCHOOL_HOST_FALLBACK !== 'false';
    if (!school && allowLegacyFallback) {
      const candidates = await this.prisma.school.findMany({
        where: { subdomain: { not: PLATFORM_SCHOOL_SUBDOMAIN } },
        take: 2,
      });
      if (candidates.length === 1) {
        school = candidates[0];
      }
    }

    if (!school) {
      throw new NotFoundException('Unknown school');
    }
    if (school.status === 'SUSPENDED') {
      // Blocks everything for this school, including an already-logged-in
      // user with a still-valid JWT — suspension needs to take effect
      // immediately, not just prevent new logins. Checked here rather than
      // only in AuthService.validateUser so it applies to every request, not
      // just /auth/login.
      throw new ForbiddenException("This school's access has been suspended. Contact Wattaman support.");
    }

    (req as any).tenantSchool = school;

    return tenantContext.run({ schoolId: school.id, mode: 'scoped' }, () => next());
  }
}
