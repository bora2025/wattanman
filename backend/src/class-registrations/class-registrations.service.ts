import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../database/prisma.service';
import { NotificationService } from '../notification/notification.service';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6;

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

  // ─── Public: submit a registration ────────────────────────────────────
  async createRegistration(body: {
    classId: string;
    nameKh: string;
    nameEn: string;
    email: string;
    phone: string;
    password: string;
    photo?: string;
  }) {
    const email = (body?.email || '').trim().toLowerCase();
    const nameKh = (body?.nameKh || '').trim();
    const nameEn = (body?.nameEn || '').trim();
    const phone = (body?.phone || '').trim();
    const password = body?.password || '';

    if (!body?.classId) throw new BadRequestException('classId is required');
    if (!nameKh) throw new BadRequestException('Khmer name is required');
    if (!nameEn) throw new BadRequestException('English name is required');
    if (!email || !EMAIL_RE.test(email)) throw new BadRequestException('Invalid email address');
    if (!phone) throw new BadRequestException('Phone number is required');
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestException(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }

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

    const passwordHash = await bcrypt.hash(password, 12);
    const created = await this.prisma.classRegistration.create({
      data: { classId: body.classId, nameKh, nameEn, email, phone, passwordHash, photo: body.photo || undefined },
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

    // APPROVE — create the User + Student accounts using the password the student set at registration
    const existingUser = await this.prisma.user.findUnique({ where: { email: reg.email } });
    if (existingUser) {
      throw new BadRequestException('A user with this email already exists. Link the student manually instead.');
    }

    const user = await this.prisma.user.create({
      data: { email: reg.email, password: reg.passwordHash, name: reg.nameEn, phone: reg.phone, role: 'STUDENT' },
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
        `Hi ${reg.nameEn}, welcome to ${reg.class.name}! Your registration has been approved — log in at your school portal with the email and password you registered with.`,
      );
    } catch {}

    return updated;
  }
}
