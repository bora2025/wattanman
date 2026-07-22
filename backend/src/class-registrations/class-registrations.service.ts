import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../database/prisma.service';
import { NotificationService } from '../notification/notification.service';

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_CODE_ATTEMPTS = 5;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Injectable()
export class ClassRegistrationsService {
  constructor(
    private prisma: PrismaService,
    private notificationService: NotificationService,
  ) {}

  // ─── Public: browse open classes ──────────────────────────────────────
  async listPublicClasses() {
    return this.prisma.class.findMany({
      where: { registrationStatus: { not: 'HIDDEN' } },
      select: {
        id: true,
        name: true,
        subject: true,
        registrationStatus: true,
        studyYear: { select: { label: true, year: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  // ─── Public: email verification ───────────────────────────────────────
  async sendVerificationCode(rawEmail: string) {
    const email = (rawEmail || '').trim().toLowerCase();
    if (!email || !EMAIL_RE.test(email)) {
      throw new BadRequestException('Invalid email address');
    }

    const code = crypto.randomInt(100000, 1000000).toString();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + CODE_TTL_MS);

    await this.prisma.emailVerificationCode.create({
      data: { email, codeHash, purpose: 'CLASS_REGISTRATION', expiresAt },
    });

    const result = await this.notificationService.sendEmail(
      email,
      'Your verification code',
      `Your class registration verification code is ${code}. It expires in 10 minutes.`,
    );

    // No SendGrid configured locally — surface the code in server logs so the
    // flow is still testable without real email delivery.
    if (process.env.NODE_ENV !== 'production' && (result as any)?.skipped) {
      console.log(`[class-registrations] Verification code for ${email}: ${code}`);
    }

    return { sent: true };
  }

  // ─── Public: submit a registration ────────────────────────────────────
  async createRegistration(body: {
    classId: string;
    nameKh: string;
    nameEn: string;
    email: string;
    phone: string;
    photo?: string;
    code: string;
  }) {
    const email = (body?.email || '').trim().toLowerCase();
    const nameKh = (body?.nameKh || '').trim();
    const nameEn = (body?.nameEn || '').trim();
    const phone = (body?.phone || '').trim();
    const code = (body?.code || '').trim();

    if (!body?.classId) throw new BadRequestException('classId is required');
    if (!nameKh) throw new BadRequestException('Khmer name is required');
    if (!nameEn) throw new BadRequestException('English name is required');
    if (!email || !EMAIL_RE.test(email)) throw new BadRequestException('Invalid email address');
    if (!phone) throw new BadRequestException('Phone number is required');
    if (!code) throw new BadRequestException('Verification code is required');

    // Verify the code
    const record = await this.prisma.emailVerificationCode.findFirst({
      where: { email, purpose: 'CLASS_REGISTRATION', consumedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!record || record.attempts >= MAX_CODE_ATTEMPTS) {
      throw new BadRequestException('Verification code expired or not requested. Please request a new code.');
    }
    const matches = await bcrypt.compare(code, record.codeHash);
    if (!matches) {
      await this.prisma.emailVerificationCode.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException('Invalid verification code');
    }
    await this.prisma.emailVerificationCode.update({
      where: { id: record.id },
      data: { consumedAt: new Date() },
    });

    // Re-validate the class server-side — don't trust the client's cached status
    const cls = await this.prisma.class.findUnique({ where: { id: body.classId } });
    if (!cls) throw new BadRequestException('Class not found');
    if (cls.registrationStatus !== 'AVAILABLE') {
      throw new BadRequestException('Registration is not currently open for this class');
    }

    // Dedup: a pending request for the same class+email is returned as-is
    const existing = await this.prisma.classRegistration.findFirst({
      where: { classId: body.classId, email, status: 'PENDING' },
    });
    if (existing) return existing;

    const created = await this.prisma.classRegistration.create({
      data: { classId: body.classId, nameKh, nameEn, email, phone, photo: body.photo || undefined },
    });

    try {
      const admins = await this.prisma.user.findMany({ where: { role: 'ADMIN' }, select: { id: true } });
      if (admins.length) {
        await this.prisma.notification.createMany({
          data: admins.map(a => ({
            userId: a.id,
            type: 'class_registration_request',
            message: `${nameEn} requested to register for class ${cls.name}`,
          })),
        });
      }
    } catch {}

    return created;
  }

  // ─── Admin: list & resolve ─────────────────────────────────────────────
  async listRegistrations(status?: string, actorRole?: string, actorUserId?: string) {
    const where: any = {};
    if (status) where.status = status;
    if (actorRole === 'CLASS_ADMIN' && actorUserId) {
      where.class = { classAdminId: actorUserId };
    }
    return this.prisma.classRegistration.findMany({
      where,
      include: { class: { select: { id: true, name: true } } },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 200,
    });
  }

  async resolveRegistration(
    adminUserId: string,
    id: string,
    body: { action: 'APPROVE' | 'REJECT'; rejectReason?: string },
  ) {
    const reg = await this.prisma.classRegistration.findUnique({
      where: { id },
      include: { class: true },
    });
    if (!reg) throw new NotFoundException('Registration not found');
    if (reg.status !== 'PENDING') throw new BadRequestException('Registration already resolved');

    if (body.action === 'REJECT') {
      const updated = await this.prisma.classRegistration.update({
        where: { id },
        data: {
          status: 'REJECTED',
          rejectReason: body.rejectReason?.trim() || null,
          resolvedAt: new Date(),
          resolvedBy: adminUserId,
        },
      });
      try {
        await this.notificationService.sendEmail(
          reg.email,
          'Your class registration was not approved',
          `Hi ${reg.nameEn}, your registration for ${reg.class.name} was not approved${body.rejectReason ? `: ${body.rejectReason}` : '.'}`,
        );
      } catch {}
      return updated;
    }

    // APPROVE — create the User + Student accounts
    const existingUser = await this.prisma.user.findUnique({ where: { email: reg.email } });
    if (existingUser) {
      throw new BadRequestException('A user with this email already exists. Link the student manually instead.');
    }

    const tempPassword = crypto.randomBytes(6).toString('hex');
    const hashedPassword = await bcrypt.hash(tempPassword, 12);

    const user = await this.prisma.user.create({
      data: { email: reg.email, password: hashedPassword, name: reg.nameEn, phone: reg.phone, role: 'STUDENT' },
    });

    const count = await this.prisma.student.count({ where: { classId: reg.classId } });
    const studentNumber = String(count + 1).padStart(4, '0');

    const student = await this.prisma.student.create({
      data: {
        userId: user.id,
        classId: reg.classId,
        studentNumber,
        nameKh: reg.nameKh,
        photo: reg.photo || undefined,
      },
    });

    const updated = await this.prisma.classRegistration.update({
      where: { id },
      data: { status: 'APPROVED', studentId: student.id, resolvedAt: new Date(), resolvedBy: adminUserId },
    });

    try {
      await this.notificationService.sendEmail(
        reg.email,
        'Your class registration is approved',
        `Hi ${reg.nameEn}, welcome to ${reg.class.name}! Your login email is ${reg.email} and your temporary password is ${tempPassword}. Please log in and change your password.`,
      );
    } catch {}

    return updated;
  }
}
