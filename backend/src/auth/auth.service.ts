import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { authenticator } from 'otplib';
import { PrismaService } from '../database/prisma.service';
import { AuthDeliveryService } from './auth-delivery.service';
import { isValidEmail, looksLikeEmail, normalizePhone } from '../common/identity';
import { getCurrentSchoolId } from '../tenancy/tenant-context';
import { dateIdPageBy, decodeDateIdCursor, parsePageLimit } from '../common/cursor-pagination';

const PLATFORM_ADMIN_ROLE = 'PLATFORM_ADMIN';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
    private notifications: AuthDeliveryService,
  ) {}

  /** `identifier` is whatever the user typed into the login field — an email
   * address or a phone number. Routed to the matching unique column.
   * Case-insensitive email match (not just a .toLowerCase() before the lookup)
   * because existing accounts predate any case normalization on write — an
   * exact-match lookup would silently break login for any account whose stored
   * email has uppercase characters. */
  async validateUser(identifier: string, password: string): Promise<any> {
    const trimmed = (identifier || '').trim();
    let user: any = null;
    if (looksLikeEmail(trimmed)) {
      user = await this.prisma.user.findFirst({ where: { email: { equals: trimmed, mode: 'insensitive' } } });
    } else {
      const normalized = normalizePhone(trimmed);
      if (normalized) {
        user = await this.prisma.user.findFirst({ where: { phoneNormalized: normalized } });
      }
    }
    if (user && (await bcrypt.compare(password, user.password))) {
      const { password, ...result } = user;
      return result;
    }
    return null;
  }

  /** Issue an access token (default 2h) */
  signAccessToken(user: any): string {
    // schoolId is the authoritative tenant claim JwtAuthGuard checks against the
    // Host-resolved tenant context on every subsequent request — see
    // backend/src/tenancy/tenant-host.middleware.ts and jwt-auth.guard.ts.
    const payload = { email: user.email, sub: user.id, role: user.role, schoolId: user.schoolId };
    return this.jwtService.sign(payload, {
      expiresIn: process.env.JWT_ACCESS_EXPIRY || '2h',
    });
  }

  /** Create a secure random refresh token, store in DB, return the raw token.
   * PLATFORM_ADMIN sessions get a deliberately shorter lifetime (default 1 day vs
   * 7) — per Phase 2a, that account type can reach every school, so its sessions
   * shouldn't linger as long as an ordinary school user's. */
  async createRefreshToken(userId: string, schoolId: string, role?: string): Promise<string> {
    const raw = crypto.randomBytes(40).toString('hex');
    const expiresAt = new Date();
    const days = role === PLATFORM_ADMIN_ROLE
      ? parseInt(process.env.JWT_REFRESH_EXPIRY_PLATFORM_ADMIN_DAYS || '1', 10) || 1
      : parseInt(process.env.JWT_REFRESH_EXPIRY || '7', 10) || 7;
    expiresAt.setDate(expiresAt.getDate() + days);

    await this.prisma.refreshToken.create({
      data: { schoolId, token: raw, userId, expiresAt },
    });
    return raw;
  }

  /** Validate a refresh token — returns the user or throws */
  async validateRefreshToken(token: string) {
    const record = await this.prisma.refreshToken.findUnique({
      where: { token },
      include: { user: true },
    });
    if (!record || record.expiresAt < new Date()) {
      if (record) {
        await this.prisma.refreshToken.delete({ where: { id: record.id } });
      }
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    return record.user;
  }

  /** Rotate: delete old refresh token, issue new pair */
  async rotateRefreshToken(oldToken: string) {
    const user = await this.validateRefreshToken(oldToken);
    // Delete the old token (rotation)
    await this.prisma.refreshToken.deleteMany({ where: { token: oldToken } });
    const accessToken = this.signAccessToken(user);
    const refreshToken = await this.createRefreshToken(user.id, user.schoolId, user.role);
    return { accessToken, refreshToken, user };
  }

  /** Revoke all refresh tokens for a user (logout everywhere) */
  async revokeAllRefreshTokens(userId: string) {
    await this.prisma.refreshToken.deleteMany({ where: { userId } });
  }

  async login(user: any) {
    const accessToken = this.signAccessToken(user);
    const refreshToken = await this.createRefreshToken(user.id, user.schoolId, user.role);
    return { access_token: accessToken, refresh_token: refreshToken };
  }

  /** Verify a TOTP code against a stored secret. Reused by both the login-time
   * MFA check and Phase 6's future step-up re-auth for destructive Platform
   * actions (school delete, unscoped backup/restore). */
  verifyMfaCode(secret: string, code: string): boolean {
    if (!secret || !code) return false;
    try {
      return authenticator.check(code, secret);
    } catch {
      return false;
    }
  }

  /** Step 1 of MFA enrollment: generate a new TOTP secret and store it
   * (NOT yet enabled — enabling happens only after the first code is verified,
   * so a user can't get locked out by an enrollment that never completed). */
  async setupMfa(userId: string): Promise<{ secret: string; otpauthUrl: string }> {
    const secret = authenticator.generateSecret();
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { mfaSecret: secret },
      select: { email: true, name: true },
    });
    const otpauthUrl = authenticator.keyuri(user.email || user.name || userId, 'Wattaman', secret);
    return { secret, otpauthUrl };
  }

  /** Step 2: verify the first code against the just-generated secret, then flip
   * mfaEnabled — the point after which login-time MFA enforcement kicks in. */
  async verifyAndEnableMfa(userId: string, code: string): Promise<{ ok: true }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { mfaSecret: true } });
    if (!user?.mfaSecret) {
      throw new UnauthorizedException('Run MFA setup before verifying a code');
    }
    if (!this.verifyMfaCode(user.mfaSecret, code)) {
      throw new UnauthorizedException('Invalid code');
    }
    await this.prisma.user.update({ where: { id: userId }, data: { mfaEnabled: true } });
    return { ok: true };
  }

  /** Verifies a signed JWT handed to us in a request body rather than via the
   * normal cookie/Bearer extraction (JwtStrategy) — the one legitimate use is
   * the platform-tier "view as school X" bridge (see AuthController's
   * `session/consume`): the impersonation token is issued on the platform
   * host but must become a same-origin cookie on the *school's* subdomain, so
   * the browser has to carry it there via a URL, not a cookie the platform
   * origin can't set for a different host. Rejects anything that isn't
   * specifically an impersonation token — this must never become a generic
   * "log in with a bearer token" bypass of the password/MFA login flow. */
  verifyImpersonationToken(token: string): { sub: string; email: string; role: string; schoolId: string; impersonatedBy: string; exp: number } {
    let payload: any;
    try {
      payload = this.jwtService.verify(token, { secret: process.env.JWT_SECRET || 'change-me-in-production-use-a-strong-random-key' });
    } catch {
      throw new UnauthorizedException('Invalid or expired session token');
    }
    if (!payload?.impersonatedBy) {
      throw new UnauthorizedException('Not an impersonation token');
    }
    return payload;
  }

  /** Starts the forgot-password flow. Deliberately silent on whether the
   * identifier matched an account — the caller (AuthController) always returns
   * the same generic response either way, so this can't be used to enumerate
   * which emails/phones have accounts. The school is resolved implicitly via
   * PrismaService's tenant-scoping middleware (the request already carries a
   * tenant context from TenantHostMiddleware by the time this runs), same as
   * ordinary login. */
  async requestPasswordReset(identifier: string): Promise<void> {
    const trimmed = (identifier || '').trim();
    if (!trimmed) return;

    let user: any = null;
    if (looksLikeEmail(trimmed)) {
      user = await this.prisma.user.findFirst({ where: { email: { equals: trimmed, mode: 'insensitive' } } });
    } else {
      const normalized = normalizePhone(trimmed);
      if (normalized) {
        user = await this.prisma.user.findFirst({ where: { phoneNormalized: normalized } });
      }
    }
    if (!user) return;

    const raw = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await this.prisma.passwordResetToken.create({
      data: { schoolId: user.schoolId, token: raw, userId: user.id, expiresAt },
    });

    // Build a per-school link, not a single global one — the reset must land back
    // on the same school's subdomain (email/phone are only unique within a school,
    // so the token lookup itself is tenant-scoped once the link is visited).
    const school = await this.prisma.school.findUnique({ where: { id: user.schoolId }, select: { subdomain: true } });
    const rootDomain = (process.env.SCHOOL_ROOT_DOMAIN || '').replace(/^\./, '');
    const resetBase = school && rootDomain ? `https://${school.subdomain}.${rootDomain}` : '';
    const resetUrl = `${resetBase}/reset-password?token=${raw}`;
    if (user.email) {
      await this.notifications.sendEmail(
        user.email,
        'Reset your Wattaman password',
        `We received a request to reset your password. This link expires in 1 hour and can only be used once:\n\n${resetUrl}\n\nIf you didn't request this, you can ignore this message.`,
      );
    } else if (user.phone) {
      await this.notifications.sendSms(user.phone, `Reset your Wattaman password (expires in 1 hour): ${resetUrl}`);
    }
  }

  /** Completes the forgot-password flow: consumes a single-use token and sets
   * the new password. Revokes every existing refresh token for the account,
   * same as an admin-triggered password reset — an attacker who had a stale
   * session shouldn't survive a password reset they didn't initiate. */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const record = await this.prisma.passwordResetToken.findUnique({ where: { token: token || '' } });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired reset link');
    }
    const hashed = await bcrypt.hash(newPassword, 12);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: record.userId }, data: { password: hashed } }),
      this.prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      this.prisma.refreshToken.deleteMany({ where: { userId: record.userId } }),
    ]);
  }

  async register(email: string | undefined, password: string, name: string, role: string, phone?: string) {
    const normalizedRole = role.trim();
    if (!normalizedRole || normalizedRole.startsWith('__')) {
      throw new Error('Invalid role');
    }
    const trimmedEmail = (email || '').trim().toLowerCase();
    const normalizedPhone = normalizePhone(phone);
    if (!trimmedEmail && !normalizedPhone) {
      throw new Error('Email or phone is required');
    }
    if (trimmedEmail && !isValidEmail(trimmedEmail)) {
      throw new Error('Invalid email address');
    }
    try {
      const hashedPassword = await bcrypt.hash(password, 12);
      const user = await this.prisma.user.create({
        data: {
          schoolId: getCurrentSchoolId(),
          email: trimmedEmail || undefined,
          phone: phone || undefined,
          phoneNormalized: normalizedPhone || undefined,
          password: hashedPassword, name, role: normalizedRole as any,
        },
      });
      const loginResult = await this.login(user);
      return {
        ...loginResult,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      };
    } catch (error: any) {
      if (error.code === 'P2002') {
        const target = Array.isArray(error.meta?.target) ? error.meta.target.join(',') : String(error.meta?.target || '');
        throw new Error(target.includes('phone') ? 'Phone number already registered' : 'Email already exists');
      }
      throw error;
    }
  }

  async getUserById(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, phone: true, role: true, photo: true, mfaEnabled: true },
    });
  }

  async getUsers(role?: string, roles?: string[], page: { cursor?: string; limit?: string } = {}) {
    const limit = parsePageLimit(page.limit);
    const cursor = decodeDateIdCursor(page.cursor);
    let where: any = {};
    if (roles && roles.length > 0) {
      where.role = { in: roles };
    } else if (role) {
      where.role = role.toUpperCase();
    }
    if (cursor) where.OR = [{ updatedAt: { lt: cursor.createdAt } }, { updatedAt: cursor.createdAt, id: { lt: cursor.id } }];
    const rows = await this.prisma.user.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true, email: true, name: true, phone: true, role: true, photo: true,
        createdAt: true, updatedAt: true,
      },
    });
    return dateIdPageBy(rows, limit, (row) => row.updatedAt);
  }

  async bulkRegister(users: { email: string; password: string; name: string; role: string; photo?: string }[]) {
    const schoolId = getCurrentSchoolId();
    const hashedUsers = await Promise.all(
      users.map(async (u) => ({
        schoolId,
        email: u.email,
        name: u.name,
        role: u.role,
        password: await bcrypt.hash(u.password, 12),
        ...(u.photo ? { photo: u.photo } : {}),
      }))
    );
    return this.prisma.user.createMany({ data: hashedUsers });
  }

  async updateUserPhoto(userId: string, photo: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { photo },
      select: { id: true, email: true, name: true, role: true, photo: true },
    });
  }

  async findById(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true },
    });
  }

  async resetUserPassword(userId: string, newPassword: string) {
    const hashed = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({ where: { id: userId }, data: { password: hashed } });
    // Revoke all existing refresh tokens so old sessions cannot continue.
    await this.prisma.refreshToken.deleteMany({ where: { userId } });
    return { ok: true };
  }

  async deleteUser(userId: string) {
    await this.prisma.$transaction([
      this.prisma.refreshToken.deleteMany({ where: { userId } }),
      this.prisma.passwordResetToken.deleteMany({ where: { userId } }),
      this.prisma.user.delete({ where: { id: userId } }),
    ]);

    return { ok: true, id: userId };
  }

  async updateUser(userId: string, data: { name?: string; email?: string; role?: string; phone?: string }) {
    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.phone !== undefined) {
      updateData.phone = data.phone;
      updateData.phoneNormalized = normalizePhone(data.phone) || null;
    }
    if (data.role) {
      const trimmed = data.role.trim();
      if (!trimmed || trimmed.startsWith('__')) {
        throw new Error('Invalid role');
      }
      updateData.role = trimmed;
    }
    try {
      return await this.prisma.user.update({
        where: { id: userId },
        data: updateData,
        select: { id: true, email: true, name: true, phone: true, role: true, photo: true, createdAt: true },
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        const target = Array.isArray(error.meta?.target) ? error.meta.target.join(',') : String(error.meta?.target || '');
        throw new Error(target.includes('phone') ? 'Phone number already registered' : 'Email already exists');
      }
      throw error;
    }
  }

  async searchUsers(query: string, role?: string) {
    const where: any = {};
    if (role) {
      where.role = role.toUpperCase();
    }
    if (query) {
      where.OR = [
        { name: { contains: query, mode: 'insensitive' } },
        { email: { contains: query, mode: 'insensitive' } },
        { phone: { contains: query } },
      ];
    }

    const users = await this.prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        photo: true,
        role: true,
        createdAt: true,
      },
      orderBy: { name: 'asc' },
      take: 50,
    });

    return users;
  }

}
