import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../database/prisma.service';
import { AuditService } from '../audit/audit.service';
import { generatePassword, isValidEmail } from '../common/identity';
import { PLATFORM_SCHOOL_SUBDOMAIN } from '../tenancy/constants';
import { RailwayDomainService } from './railway-domain.service';
import { SchoolDomainService } from '../tenancy/school-domain.service';
import { AuthDeliveryService } from '../auth/auth-delivery.service';
import { dateIdPage, decodeDateIdCursor, parsePageLimit } from '../common/cursor-pagination';

const SUBDOMAIN_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const RESERVED_SUBDOMAINS = new Set([PLATFORM_SCHOOL_SUBDOMAIN, 'www', 'api', 'app']);

// Explicit `=== true`/`=== false` checks, not truthy narrowing — this
// backend's tsconfig has strictNullChecks off, which (verified directly,
// this is not obvious) means `if (domainResult.ok)`/a ternary on it fails to
// narrow this union, while `===` comparisons narrow correctly.
function formatDomainResult(domainResult: { ok: true; domain: string } | { ok: false; reason: string }) {
  if (domainResult.ok === true) {
    return { domain: domainResult.domain, domainProvisioned: true, domainError: null };
  }
  return { domain: null, domainProvisioned: false, domainError: domainResult.reason };
}

@Injectable()
export class SchoolsService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private audit: AuditService,
    private railwayDomain: RailwayDomainService,
    private schoolDomains: SchoolDomainService,
    private delivery: AuthDeliveryService,
  ) {}

  /** Every real school — the platform sentinel row is never a management target. */
  async list(input: { cursor?: string; limit?: string; search?: string; status?: string } = {}) {
    const limit = parsePageLimit(input.limit);
    const cursor = decodeDateIdCursor(input.cursor);
    const search = input.search?.trim().slice(0, 100);
    const status = input.status?.trim();
    const rows = await this.prisma.school.findMany({
      where: {
        subdomain: { not: PLATFORM_SCHOOL_SUBDOMAIN },
        ...(status && status !== 'all' ? { status } : {}),
        AND: [
          ...(search ? [{ OR: [{ name: { contains: search, mode: 'insensitive' as const } }, { subdomain: { contains: search, mode: 'insensitive' as const } }] }] : []),
          ...(cursor ? [{ OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] }] : []),
        ],
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    return dateIdPage(rows, limit);
  }

  /** Cross-school aggregates for the Platform dashboard — the kind of genuine
   * unscoped aggregate Phase 6a reserves `mode: 'unscoped'` for, rather than
   * per-school data. */
  async stats() {
    const schoolFilter = { subdomain: { not: PLATFORM_SCHOOL_SUBDOMAIN } };
    const [totalSchools, activeSchools, suspendedSchools, provisioningSchools, totalStudents, totalStaff] = await Promise.all([
      this.prisma.school.count({ where: schoolFilter }),
      this.prisma.school.count({ where: { ...schoolFilter, status: 'ACTIVE' } }),
      this.prisma.school.count({ where: { ...schoolFilter, status: 'SUSPENDED' } }),
      this.prisma.school.count({ where: { ...schoolFilter, status: 'PROVISIONING' } }),
      this.prisma.user.count({ where: { role: 'STUDENT', school: schoolFilter } }),
      this.prisma.user.count({ where: { role: { not: 'STUDENT' }, school: schoolFilter } }),
    ]);
    return { totalSchools, activeSchools, suspendedSchools, provisioningSchools, totalStudents, totalStaff };
  }

  async checkSubdomainAvailable(slug: string): Promise<{ available: boolean; reason?: string }> {
    const normalized = (slug || '').trim().toLowerCase();
    if (!SUBDOMAIN_PATTERN.test(normalized)) {
      return { available: false, reason: 'Must be lowercase letters, numbers, and hyphens only' };
    }
    if (RESERVED_SUBDOMAINS.has(normalized)) {
      return { available: false, reason: 'This subdomain is reserved' };
    }
    const existing = await this.prisma.school.findUnique({ where: { subdomain: normalized } });
    return existing ? { available: false, reason: 'Already taken' } : { available: true };
  }

  async getOne(id: string) {
    const school = await this.prisma.school.findUnique({
      where: { id },
      include: { provisioningJobs: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
    if (!school || school.subdomain === PLATFORM_SCHOOL_SUBDOMAIN) {
      throw new NotFoundException('School not found');
    }
    // Lightweight usage counts for the Overview tab — cheap enough to compute
    // on read given these are simple indexed counts, no need to cache yet.
    const [students, staff] = await Promise.all([
      this.prisma.user.count({ where: { schoolId: id, role: 'STUDENT' } }),
      this.prisma.user.count({ where: { schoolId: id, role: { not: 'STUDENT' } } }),
    ]);
    return { ...school, counts: { students, staff } };
  }

  /** Create a school and its first ADMIN account,
   * all in one step (the onboarding wizard's final submit). Runs while the
   * caller is on the platform host — mode is 'unscoped' there (see
   * PlatformScopeGuard), so nothing here can rely on ambient tenant context;
   * every schoolId below is explicit.
   *
   * with no feature extensions installed by default. */
  async create(data: { name: string; subdomain: string; adminName: string; adminEmail: string; adminPhone?: string }, idempotencyKey?: string) {
    const name = (data.name || '').trim();
    const subdomain = (data.subdomain || '').trim().toLowerCase();
    const adminName = (data.adminName || '').trim();
    const adminEmail = (data.adminEmail || '').trim().toLowerCase();
    const requestKey = (idempotencyKey || `school:${subdomain}`).trim();

    if (!name) throw new BadRequestException('School name is required');
    if (!adminName) throw new BadRequestException("Admin's name is required");
    if (!adminEmail || !isValidEmail(adminEmail)) throw new BadRequestException('A valid admin email is required');
    if (!requestKey || requestKey.length > 200) throw new BadRequestException('Invalid idempotency key');

    const existingJob = await this.prisma.schoolProvisioningJob.findUnique({
      where: { requestKey },
      include: { school: true },
    });
    if (existingJob) {
      return {
        school: existingJob.school,
        admin: null,
        temporaryPassword: null,
        provisioning: existingJob,
        idempotentReplay: true,
        domain: null,
        domainProvisioned: existingJob.status === 'COMPLETED',
        domainError: existingJob.lastError,
      };
    }

    const availability = await this.checkSubdomainAvailable(subdomain);
    if (!availability.available) throw new ConflictException(availability.reason || 'Subdomain unavailable');

    const tempPassword = generatePassword(12);
    const hashed = await bcrypt.hash(tempPassword, 12);

    const result = await this.prisma.$transaction(async (tx) => {
      const createdSchool = await tx.school.create({
        data: { name, subdomain, status: 'PROVISIONING', storagePrefix: `pending:${requestKey}` },
      });
      const school = await tx.school.update({
        where: { id: createdSchool.id },
        data: { storagePrefix: `schools/${createdSchool.id}` },
      });
      const admin = await tx.user.create({
        data: {
          schoolId: school.id,
          name: adminName,
          email: adminEmail,
          phone: data.adminPhone || undefined,
          password: hashed,
          role: 'ADMIN',
        },
      });
      const provisioning = await tx.schoolProvisioningJob.create({
        data: { schoolId: school.id, requestKey, status: 'RUNNING', attempts: 1, startedAt: new Date() },
      });
      await tx.siteSetting.create({ data: { schoolId: school.id } });
      return { school, admin, provisioning };
    });

    await this.schoolDomains.registerManagedDomain(result.school.id, subdomain);

    // Best-effort — this deployment has no wildcard DNS, so a school is only
    // actually reachable once a matching Railway domain exists (Phase 18).
    // Never blocks/fails school creation itself: the DB row + first admin
    // account above are the important, already-durable part.
    const domainResult = await this.railwayDomain.provisionDomain(subdomain);
    if (domainResult.ok === true) {
      await this.schoolDomains.registerVerifiedDomain(
        result.school.id,
        domainResult.domain,
        'MANAGED',
      );
    }

    const provisioning = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      await tx.school.update({
        where: { id: result.school.id },
        data: { status: domainResult.ok === true ? 'ACTIVE' : 'PROVISIONING' },
      });
      return tx.schoolProvisioningJob.update({
        where: { id: result.provisioning.id },
        data: domainResult.ok === true
          ? { status: 'COMPLETED', completedAt: now, lastError: null }
          : { status: 'FAILED', lastError: domainResult.reason },
      });
    });

    if (domainResult.ok === true) {
      await this.notifySchoolReady(result.admin.email, result.school.name, domainResult.domain, result.school.id);
    }

    return {
      school: { ...result.school, status: domainResult.ok === true ? 'ACTIVE' : 'PROVISIONING' },
      admin: { id: result.admin.id, name: result.admin.name, email: result.admin.email },
      temporaryPassword: tempPassword,
      provisioning,
      ...formatDomainResult(domainResult),
    };
  }

  /** Retries domain provisioning for a school that already exists — covers
   * both a failed auto-provision at creation time and backfilling a school
   * that predates this automation (Phase 18). */
  async retryDomainProvisioning(id: string) {
    const school = await this.getOne(id);
    const job = school.provisioningJobs[0];
    if (job) {
      await this.prisma.schoolProvisioningJob.update({
        where: { id: job.id },
        data: { status: 'RUNNING', attempts: { increment: 1 }, startedAt: new Date(), lastError: null },
      });
    }
    const domainResult = await this.railwayDomain.provisionDomain(school.subdomain);
    if (domainResult.ok === true) {
      await this.schoolDomains.registerVerifiedDomain(
        school.id,
        domainResult.domain,
        'MANAGED',
      );
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.school.update({
        where: { id },
        data: { status: domainResult.ok === true ? 'ACTIVE' : 'PROVISIONING' },
      });
      if (job) {
        await tx.schoolProvisioningJob.update({
          where: { id: job.id },
          data: domainResult.ok === true
            ? { status: 'COMPLETED', completedAt: new Date(), lastError: null }
            : { status: 'FAILED', lastError: domainResult.reason },
        });
      }
    });
    if (domainResult.ok === true && job?.status !== 'COMPLETED') {
      const admin = await this.prisma.user.findFirst({
        where: { schoolId: id, role: { in: ['ADMIN', 'SUPER_ADMIN'] }, email: { not: null } },
        orderBy: { createdAt: 'asc' },
        select: { email: true },
      });
      if (admin?.email) {
        await this.notifySchoolReady(admin.email, school.name, domainResult.domain, school.id);
      }
    }
    return { ...formatDomainResult(domainResult), status: domainResult.ok === true ? 'ACTIVE' : 'PROVISIONING' };
  }

  private async notifySchoolReady(email: string, schoolName: string, domain: string, schoolId: string) {
    try {
      await this.delivery.sendEmail(
        email,
        `${schoolName} is ready on Wattaman`,
        `${schoolName} is ready. Sign in at https://${domain}/login using the administrator credentials provided securely by your platform operator.`,
      );
      await this.audit.log({
        action: 'NOTIFY',
        resource: 'SCHOOL_PROVISIONING',
        resourceId: schoolId,
        resourceLabel: schoolName,
        metadata: { channel: 'EMAIL', recipient: email, readiness: 'READY' },
      });
    } catch (error: any) {
      await this.audit.log({
        action: 'NOTIFY',
        resource: 'SCHOOL_PROVISIONING',
        resourceId: schoolId,
        resourceLabel: schoolName,
        success: false,
        errorMessage: error?.message || 'Onboarding email delivery failed',
        metadata: { channel: 'EMAIL', recipient: email, readiness: 'READY' },
      });
    }
  }

  async listDomains(id: string) {
    await this.getOne(id);
    return this.schoolDomains.listForSchool(id);
  }

  async registerDomain(id: string, hostname: string) {
    await this.getOne(id);
    return this.schoolDomains.requestCustomDomain(id, hostname);
  }

  async verifyDomain(id: string, domainId: string) {
    await this.getOne(id);
    const verification = await this.schoolDomains.verifyCustomDomain(id, domainId);
    if (!verification.verified) return verification;

    const routing = await this.railwayDomain.provisionHostname(
      verification.domain.hostname,
    );
    const domain = await this.schoolDomains.updateRoutingState(
      id,
      domainId,
      routing.ok === true ? { ok: true } : routing,
    );
    return {
      verified: true,
      routed: routing.ok === true,
      domain,
      routingError: routing.ok === true ? null : routing.reason,
    };
  }

  async retryDomainRouting(id: string, domainId: string) {
    await this.getOne(id);
    const domains = await this.schoolDomains.listForSchool(id);
    const domain = domains.find((candidate) => candidate.id === domainId);
    if (!domain) throw new NotFoundException('School domain not found');
    if (domain.status !== 'VERIFIED') {
      throw new BadRequestException('Verify domain ownership before routing');
    }
    const routing = await this.railwayDomain.provisionHostname(domain.hostname);
    const updated = await this.schoolDomains.updateRoutingState(
      id,
      domainId,
      routing.ok === true ? { ok: true } : routing,
    );
    return {
      routed: routing.ok === true,
      domain: updated,
      routingError: routing.ok === true ? null : routing.reason,
    };
  }

  async update(id: string, data: { name?: string; status?: string }) {
    const school = await this.getOne(id);
    if (data.status && !['ACTIVE', 'SUSPENDED', 'DELETION_SCHEDULED'].includes(data.status)) {
      throw new BadRequestException('status must be one of ACTIVE, SUSPENDED, DELETION_SCHEDULED');
    }
    const updated = await this.prisma.school.update({
      where: { id },
      data: { name: data.name?.trim() || undefined, status: data.status },
    });
    this.schoolDomains.invalidateSchool(id);
    return updated;
  }

  /** Irreversible — requires the caller to echo the school's exact current
   * name as a server-enforced type-to-confirm, not just a frontend nicety. */
  async remove(id: string, confirmName: string) {
    const school = await this.getOne(id);
    if (confirmName !== school.name) {
      throw new BadRequestException('Confirmation name does not match');
    }
    // onDelete: Cascade on every schoolId relation (Phase 1) removes every row
    // this school owns across every tenant-scoped table.
    await this.prisma.school.delete({ where: { id } });
    // Best-effort cleanup (Phase 18/2a-iii) — a stale Railway domain left
    // pointed at this app after the school is gone is a subdomain-takeover
    // risk, but the DB deletion above is the irreversible part; this must
    // never block or fail it.
    await this.railwayDomain.deregisterDomain(school.subdomain);
    return { deleted: true, id };
  }

  /** Issues a short-lived, school-scoped session for "view as this school"
   * support tooling — reuses the normal `scoped` request path pointed at the
   * chosen school rather than the `unscoped` platform mode (Phase 6a), and is
   * mandatorily audited with a reason, since this is functionally an
   * authorized backdoor into every school (Phase 2a-iv).
   *
   * Issues the token as one of the SCHOOL'S OWN real admin accounts, not the
   * platform admin's own user id — the platform admin's user row lives under
   * the platform sentinel schoolId, so every per-school query (starting with
   * `GET /auth/me`) would fail to find it once scoped to the target school.
   * `impersonatedBy` in the payload preserves who's really behind the wheel
   * for audit purposes, without needing a synthetic user that doesn't exist
   * in this school's own data. */
  async impersonate(platformAdminId: string, schoolId: string, reason: string) {
    if (!reason || !reason.trim()) {
      throw new BadRequestException('A reason is required to impersonate a school');
    }
    const school = await this.getOne(schoolId);
    const [targetAdmin, actor] = await Promise.all([
      this.prisma.user.findFirst({
        where: { schoolId: school.id, role: { in: ['ADMIN', 'SUPER_ADMIN'] } },
        orderBy: { createdAt: 'asc' },
      }),
      // The JWT payload only carries userId/email/role/schoolId (see
      // jwt.strategy.ts) — no display name — so the audit row needs an
      // explicit lookup rather than trusting whatever the controller has on
      // hand, to avoid exactly the actorName-gets-an-email mixup this
      // replaced.
      this.prisma.user.findUnique({ where: { id: platformAdminId }, select: { name: true, email: true } }),
    ]);
    if (!targetAdmin) {
      throw new NotFoundException('This school has no admin account to impersonate');
    }

    const payload = {
      sub: targetAdmin.id,
      email: targetAdmin.email,
      role: targetAdmin.role,
      schoolId: school.id,
      impersonatedBy: platformAdminId,
    };
    const token = this.jwtService.sign(payload, { expiresIn: '30m' });

    await this.audit.log({
      action: 'IMPERSONATION_START',
      resource: 'SCHOOL',
      resourceId: school.id,
      resourceLabel: school.name,
      actorId: platformAdminId,
      actorName: actor?.name ?? null,
      actorEmail: actor?.email ?? null,
      actorRole: 'PLATFORM_ADMIN',
      metadata: { reason: reason.trim() },
    });

    return { access_token: token, school: { id: school.id, name: school.name, subdomain: school.subdomain } };
  }

  /** Resets a school's admin password to a fresh, randomly-generated
   * temporary one — the self-service replacement for what was, until now,
   * a manual "generate a bcrypt hash and UPDATE the row by hand" operation.
   * Same "find the school's oldest ADMIN/SUPER_ADMIN" targeting as
   * impersonate(); if a school ever has more than one, this always resets
   * the same (first-created) one, matching what impersonate() would log
   * into. Mandatorily audited — this is a real account-takeover-shaped
   * capability (Phase 2a-iv's reasoning for impersonation applies just as
   * much here), so it gets the same reason-required, actor-logged pattern. */
  async resetAdminPassword(platformAdminId: string, schoolId: string, reason: string) {
    if (!reason || !reason.trim()) {
      throw new BadRequestException('A reason is required to reset a school admin password');
    }
    const school = await this.getOne(schoolId);
    const [targetAdmin, actor] = await Promise.all([
      this.prisma.user.findFirst({
        where: { schoolId: school.id, role: { in: ['ADMIN', 'SUPER_ADMIN'] } },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.user.findUnique({ where: { id: platformAdminId }, select: { name: true, email: true } }),
    ]);
    if (!targetAdmin) {
      throw new NotFoundException('This school has no admin account to reset');
    }

    const tempPassword = generatePassword(12);
    const hashed = await bcrypt.hash(tempPassword, 12);
    await this.prisma.user.update({ where: { id: targetAdmin.id }, data: { password: hashed } });

    await this.audit.log({
      action: 'PASSWORD_RESET',
      resource: 'SCHOOL',
      resourceId: school.id,
      resourceLabel: school.name,
      actorId: platformAdminId,
      actorName: actor?.name ?? null,
      actorEmail: actor?.email ?? null,
      actorRole: 'PLATFORM_ADMIN',
      metadata: { reason: reason.trim(), targetUserId: targetAdmin.id, targetUserEmail: targetAdmin.email },
    });

    return { email: targetAdmin.email, temporaryPassword: tempPassword };
  }

  async endImpersonation(platformAdminId: string, schoolId: string) {
    const [school, actor] = await Promise.all([
      this.prisma.school.findUnique({ where: { id: schoolId } }),
      this.prisma.user.findUnique({ where: { id: platformAdminId }, select: { name: true, email: true } }),
    ]);
    await this.audit.log({
      action: 'IMPERSONATION_END',
      resource: 'SCHOOL',
      resourceId: schoolId,
      resourceLabel: school?.name ?? schoolId,
      actorId: platformAdminId,
      actorName: actor?.name ?? null,
      actorEmail: actor?.email ?? null,
      actorRole: 'PLATFORM_ADMIN',
    });
    return { ok: true };
  }
}
