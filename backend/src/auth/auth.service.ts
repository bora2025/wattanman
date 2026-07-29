import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { authenticator } from 'otplib';
import { PrismaService } from '../database/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { isValidEmail, looksLikeEmail, normalizePhone } from '../common/identity';
import { getCurrentSchoolId } from '../tenancy/tenant-context';

const PLATFORM_ADMIN_ROLE = 'PLATFORM_ADMIN';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
    private notifications: NotificationService,
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

  async register(email: string | undefined, password: string, name: string, role: string, departmentId?: string, phone?: string) {
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
          ...(departmentId ? { departmentId } : {}),
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
      select: { id: true, email: true, name: true, phone: true, role: true, photo: true, departmentId: true, mfaEnabled: true, department: { select: { id: true, name: true, nameKh: true } } },
    });
  }

  async getUsers(role?: string, roles?: string[]) {
    let where: any = {};
    if (roles && roles.length > 0) {
      where.role = { in: roles };
    } else if (role) {
      where.role = role.toUpperCase();
    }
    return this.prisma.user.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true, email: true, name: true, phone: true, role: true, photo: true,
        departmentId: true, createdAt: true, updatedAt: true,
        department: { select: { id: true, name: true, nameKh: true } },
        studentProfile: {
          select: {
            id: true, studentNumber: true, parentId: true,
            class: { select: { id: true, name: true } },
            parent: { select: { id: true, name: true, email: true, phone: true } },
          },
        },
        parentStudents: { select: { id: true, user: { select: { name: true } } } },
      },
    });
  }

  async setStudentParent(studentUserId: string, parentId: string | null) {
    const student = await this.prisma.student.findUnique({ where: { userId: studentUserId } });
    if (!student) throw new Error('Student profile not found for this user');
    if (parentId) {
      const parent = await this.prisma.user.findUnique({
        where: { id: parentId },
        select: { id: true, role: true },
      });
      if (!parent || parent.role !== 'PARENT') {
        throw new Error('parentId must reference a user with role PARENT');
      }
    }
    await this.prisma.student.update({
      where: { id: student.id },
      data: { parentId: parentId || null },
    });
    return { ok: true };
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
    // Detach the student profile (if any) and its attendance.
    const student = await this.prisma.student.findUnique({ where: { userId } });

    // Wipe every record that references this user, in dependency order.
    await this.prisma.$transaction([
      // Detach any classes this user was teaching (do not delete the classes;
      // students/attendance stay intact, an admin can reassign a teacher later).
      this.prisma.class.updateMany({ where: { teacherId: userId }, data: { teacherId: null } }),
      // Student-side
      ...(student
        ? [
            this.prisma.attendance.deleteMany({ where: { studentId: student.id } }),
            this.prisma.feeRecord.deleteMany({ where: { studentId: student.id } }),
            this.prisma.student.delete({ where: { id: student.id } }),
          ]
        : []),

      // As parent: detach children (do not delete the students)
      this.prisma.student.updateMany({ where: { parentId: userId }, data: { parentId: null } }),

      // Attendance marker (student + staff)
      this.prisma.attendance.deleteMany({ where: { markedById: userId } }),
      this.prisma.staffAttendance.deleteMany({ where: { markedById: userId } }),
      this.prisma.staffAttendance.deleteMany({ where: { userId } }),

      // Communication
      this.prisma.message.deleteMany({ where: { OR: [{ senderId: userId }, { receiverId: userId }] } }),
      this.prisma.announcementRead.deleteMany({ where: { userId } }),
      this.prisma.announcement.deleteMany({ where: { authorId: userId } }),

      // Modules
      this.prisma.salary.deleteMany({ where: { userId } }),
      this.prisma.exam.deleteMany({ where: { createdById: userId } }),
      this.prisma.assignment.deleteMany({ where: { createdById: userId } }),

      // Preferences / notifications / sessions
      this.prisma.notification.deleteMany({ where: { userId } }),
      this.prisma.notificationPreference.deleteMany({ where: { userId } }),
      this.prisma.refreshToken.deleteMany({ where: { userId } }),

      // Finally the user
      this.prisma.user.delete({ where: { id: userId } }),
    ].filter(Boolean) as any);

    return { ok: true, id: userId };
  }

  async updateUser(userId: string, data: { name?: string; email?: string; role?: string; phone?: string; departmentId?: string | null }) {
    const updateData: any = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.phone !== undefined) {
      updateData.phone = data.phone;
      updateData.phoneNormalized = normalizePhone(data.phone) || null;
    }
    if (data.departmentId !== undefined) updateData.departmentId = data.departmentId || null;
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
        select: { id: true, email: true, name: true, phone: true, role: true, photo: true, departmentId: true, createdAt: true, department: { select: { id: true, name: true, nameKh: true } } },
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
        department: { select: { id: true, name: true } },
        studentProfile: {
          select: {
            id: true,
            studentNumber: true,
            sex: true,
            photo: true,
            dateOfBirth: true,
            address: true,
            class: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
      take: 50,
    });

    return users;
  }

  private _ttClassInclude() {
    return {
      timetable: {
        select: {
          id: true, name: true, academicYear: true, status: true,
          periodsPerDay: true, numberOfDays: true,
          periodTimes: true, weekend: true,
        },
      },
      entries: {
        include: {
          subject: { select: { name: true, short: true, color: true } },
          teacher: { select: { firstName: true, lastName: true, short: true, color: true } },
          classroom: { select: { name: true, short: true } },
        },
        orderBy: [{ day: 'asc' }, { period: 'asc' }] as any,
      },
    };
  }

  async getTeacherSchedule(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user?.email) {
      return { _debug: { reason: 'User not found or has no email' } };
    }
    const include = {
      timetable: {
        select: {
          id: true, name: true, academicYear: true, status: true,
          periodsPerDay: true, numberOfDays: true,
          periodTimes: true, weekend: true,
        },
      },
      entries: {
        include: {
          subject: { select: { name: true, short: true, color: true } },
          class: { select: { name: true, short: true, color: true } },
          classroom: { select: { name: true, short: true } },
        },
        orderBy: [{ day: 'asc' }, { period: 'asc' }] as any,
      },
    };
    let ttTeacher = await this.prisma.timetableTeacher.findFirst({
      where: { email: { equals: user.email, mode: 'insensitive' }, timetable: { status: 'PUBLISHED' } },
      include,
      orderBy: { timetable: { createdAt: 'desc' } } as any,
    });
    if (!ttTeacher) {
      ttTeacher = await this.prisma.timetableTeacher.findFirst({
        where: { email: { equals: user.email, mode: 'insensitive' } },
        include,
        orderBy: { timetable: { createdAt: 'desc' } } as any,
      });
    }
    if (!ttTeacher) {
      return { _debug: { reason: 'No timetable teacher found matching your email', email: user.email } };
    }
    return ttTeacher;
  }

  async getStudentSchedule(userId: string) {
    const student = await this.prisma.student.findUnique({
      where: { userId },
      include: { class: { select: { name: true } } },
    });

    const studentClass = student?.class?.name ?? null;

    if (!studentClass) {
      return { _debug: { studentClass: null, reason: 'Student has no class assigned', allPublishedClasses: [] } };
    }

    const include = this._ttClassInclude();

    // 1️⃣ Try exact match in PUBLISHED timetable
    let ttClass = await this.prisma.timetableClass.findFirst({
      where: { name: { equals: studentClass, mode: 'insensitive' }, timetable: { status: 'PUBLISHED' } },
      include,
      orderBy: { timetable: { createdAt: 'desc' } },
    });

    // 2️⃣ Fallback: DRAFT timetable (show with warning)
    if (!ttClass) {
      ttClass = await this.prisma.timetableClass.findFirst({
        where: { name: { equals: studentClass, mode: 'insensitive' } },
        include,
        orderBy: { timetable: { createdAt: 'desc' } },
      });
    }

    // 3️⃣ If still nothing, return debug info with available class names
    if (!ttClass) {
      const allClasses = await this.prisma.timetableClass.findMany({
        select: { name: true, timetable: { select: { name: true, status: true } } },
        orderBy: { timetable: { createdAt: 'desc' } },
      });
      return {
        _debug: {
          studentClass,
          reason: 'No timetable class name matches the student class name',
          allClasses: allClasses.map(c => ({ className: c.name, timetableName: c.timetable.name, status: c.timetable.status })),
        },
      };
    }

    return ttClass;
  }

  async getFullProfile(userId: string) {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, email: true, name: true, phone: true, photo: true,
        role: true, createdAt: true,
        department: { select: { id: true, name: true, nameKh: true } },
        studentProfile: {
          select: {
            id: true, studentNumber: true, sex: true, photo: true,
            dateOfBirth: true, address: true,
            class: { select: { id: true, name: true } },
            feeRecords: {
              select: {
                id: true, totalAmount: true, paidAmount: true, dueDate: true,
                term: true, notes: true, createdAt: true,
                payments: {
                  select: { id: true, amount: true, note: true, createdAt: true },
                  orderBy: { createdAt: 'desc' },
                },
              },
              orderBy: { createdAt: 'desc' },
            },
            attendances: {
              where: { date: { gte: thirtyDaysAgo } },
              select: { date: true, session: true, status: true, checkInTime: true, permissionType: true },
              orderBy: [{ date: 'asc' }, { session: 'asc' }],
            },
          },
        },
        staffAttendances: {
          where: { date: { gte: thirtyDaysAgo } },
          select: { date: true, session: true, status: true, checkInTime: true, permissionType: true },
          orderBy: [{ date: 'asc' }, { session: 'asc' }],
        },
      },
    });

    if (!user) return null;

    const base = {
      ...user,
      scoreEntries: [] as any[],
      rankingMap: {} as Record<string, { rank: number; total: number }>,
    };
    if (!user.studentProfile) return base;

    const scoreEntries = await this.prisma.scoreEntry.findMany({
      where: { studentId: user.studentProfile.id },
      select: {
        score: true,
        subject: { select: { name: true, maxScore: true, color: true } },
        examTab: {
          select: {
            id: true, label: true, type: true, order: true,
            scoreSheet: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ examTab: { order: 'asc' } }, { subject: { order: 'asc' } }],
    });

    const classId = user.studentProfile.class?.id;
    const rankingMap: Record<string, { rank: number; total: number }> = {};

    if (classId && scoreEntries.length > 0) {
      const classStudentIds = await this.prisma.student
        .findMany({ where: { classId }, select: { id: true } })
        .then(ss => ss.map(s => s.id));

      const uniqueTabIds = [...new Set(scoreEntries.map(e => e.examTab.id))];
      // Fetch all tab rankings in parallel instead of sequential loop
      await Promise.all(uniqueTabIds.map(async (examTabId) => {
        const grouped = await this.prisma.scoreEntry.groupBy({
          by: ['studentId'],
          where: { examTabId, studentId: { in: classStudentIds } },
          _sum: { score: true },
          orderBy: { _sum: { score: 'desc' } },
        });
        const myIdx = grouped.findIndex(g => g.studentId === user.studentProfile!.id);
        rankingMap[examTabId] = { rank: myIdx >= 0 ? myIdx + 1 : 0, total: grouped.length };
      }));
    }

    return { ...user, scoreEntries, rankingMap };
  }
}