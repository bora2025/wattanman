import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../database/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { isValidEmail, normalizePhone } from '../common/identity';

const MIN_PASSWORD_LENGTH = 6;
const FIELD_MODES = ['REQUIRED', 'OPTIONAL', 'HIDDEN'] as const;
type FieldMode = (typeof FIELD_MODES)[number];

function slugify(label: string): string {
  return (
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'field'
  );
}

@Injectable()
export class ClassRegistrationsService {
  constructor(
    private prisma: PrismaService,
    private notificationService: NotificationService,
  ) {}

  // ─── Public: form configuration ────────────────────────────────────────
  async getFormConfig() {
    const settings = await this.getOrCreateSettings();
    const fields = await this.prisma.classRegistrationField.findMany({
      where: { enabled: true },
      orderBy: { order: 'asc' },
    });
    return { settings, fields };
  }

  private async getOrCreateSettings() {
    return this.prisma.classRegistrationSettings.upsert({
      where: { id: 'singleton' },
      update: {},
      create: { id: 'singleton' },
    });
  }

  // ─── Admin: settings ────────────────────────────────────────────────────
  async getSettings() {
    return this.getOrCreateSettings();
  }

  async updateSettings(body: { khmerNameMode?: string; phoneMode?: string; emailMode?: string; photoMode?: string }) {
    const data: Record<string, string> = {};
    for (const key of ['khmerNameMode', 'phoneMode', 'emailMode', 'photoMode'] as const) {
      const v = body?.[key];
      if (v === undefined) continue;
      if (!FIELD_MODES.includes(v as FieldMode)) {
        throw new BadRequestException(`${key} must be one of ${FIELD_MODES.join(', ')}`);
      }
      data[key] = v;
    }
    const current = await this.getOrCreateSettings();
    const nextEmailMode = data.emailMode ?? current.emailMode;
    const nextPhoneMode = data.phoneMode ?? current.phoneMode;
    if (nextEmailMode === 'HIDDEN' && nextPhoneMode === 'HIDDEN') {
      throw new BadRequestException('Email and Phone cannot both be hidden — a student needs at least one to create a login');
    }
    return this.prisma.classRegistrationSettings.update({ where: { id: 'singleton' }, data });
  }

  // ─── Admin: custom fields CRUD ──────────────────────────────────────────
  async listFields() {
    return this.prisma.classRegistrationField.findMany({ orderBy: { order: 'asc' } });
  }

  async createField(body: { label: string; required?: boolean }) {
    const label = (body?.label || '').trim();
    if (!label) throw new BadRequestException('label is required');

    const base = slugify(label);
    let key = base;
    let n = 1;
    while (await this.prisma.classRegistrationField.findUnique({ where: { key } })) {
      key = `${base}_${++n}`;
    }

    const maxOrder = await this.prisma.classRegistrationField.aggregate({ _max: { order: true } });
    return this.prisma.classRegistrationField.create({
      data: {
        key,
        label,
        required: !!body.required,
        order: (maxOrder._max.order ?? -1) + 1,
      },
    });
  }

  async updateField(id: string, body: { label?: string; required?: boolean; enabled?: boolean }) {
    const field = await this.prisma.classRegistrationField.findUnique({ where: { id } });
    if (!field) throw new NotFoundException('Field not found');
    const data: Record<string, any> = {};
    if (body.label !== undefined) {
      const label = body.label.trim();
      if (!label) throw new BadRequestException('label cannot be empty');
      data.label = label;
    }
    if (body.required !== undefined) data.required = !!body.required;
    if (body.enabled !== undefined) data.enabled = !!body.enabled;
    return this.prisma.classRegistrationField.update({ where: { id }, data });
  }

  async deleteField(id: string) {
    const field = await this.prisma.classRegistrationField.findUnique({ where: { id } });
    if (!field) throw new NotFoundException('Field not found');
    await this.prisma.classRegistrationField.delete({ where: { id } });
    return { success: true };
  }

  async reorderFields(ids: string[]) {
    if (!Array.isArray(ids) || ids.length === 0) throw new BadRequestException('ids is required');
    await this.prisma.$transaction(
      ids.map((id, index) =>
        this.prisma.classRegistrationField.update({ where: { id }, data: { order: index } }),
      ),
    );
    return this.listFields();
  }

  // ─── Public: browse open classes ──────────────────────────────────────
  async listPublicClasses() {
    const classes = await this.prisma.class.findMany({
      where: { registrationStatus: { not: 'HIDDEN' } },
      select: {
        id: true,
        name: true,
        subject: true,
        registrationStatus: true,
        thumbnail: true,
        description: true,
        price: true,
        showPrice: true,
        studyYear: { select: { label: true, year: true } },
      },
      orderBy: { name: 'asc' },
    });
    // Never leak a price the admin chose to hide, even though the UI wouldn't render it.
    return classes.map(c => ({ ...c, price: c.showPrice ? c.price : null }));
  }

  // ─── Public: submit a registration ────────────────────────────────────
  async createRegistration(body: {
    classId: string;
    nameKh?: string;
    nameEn: string;
    email?: string;
    phone?: string;
    password: string;
    photo?: string;
    customFieldValues?: Record<string, string>;
  }) {
    const email = (body?.email || '').trim().toLowerCase();
    const nameKh = (body?.nameKh || '').trim();
    const nameEn = (body?.nameEn || '').trim();
    const phone = (body?.phone || '').trim();
    const password = body?.password || '';

    if (!body?.classId) throw new BadRequestException('classId is required');
    if (!nameEn) throw new BadRequestException('English name is required');
    if (email && !isValidEmail(email)) throw new BadRequestException('Invalid email address');
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new BadRequestException(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
    }

    const settings = await this.getOrCreateSettings();
    if (settings.khmerNameMode === 'REQUIRED' && !nameKh) {
      throw new BadRequestException('Khmer name is required');
    }
    if (settings.emailMode === 'REQUIRED' && !email) {
      throw new BadRequestException('Email is required');
    }
    if (settings.phoneMode === 'REQUIRED' && !phone) {
      throw new BadRequestException('Phone number is required');
    }
    // Baseline safety net regardless of mode — e.g. both set to Optional and the
    // student left both blank — since the account still needs one identifier.
    if (!email && !phone) {
      throw new BadRequestException('Email or phone number is required');
    }
    if (settings.photoMode === 'REQUIRED' && !body.photo) {
      throw new BadRequestException('Photo is required');
    }

    // Custom fields: reject unknown keys, enforce required, drop values for disabled/removed fields
    const enabledFields = await this.prisma.classRegistrationField.findMany({ where: { enabled: true } });
    const customFieldValues: Record<string, string> = {};
    const submitted = body.customFieldValues || {};
    for (const f of enabledFields) {
      const v = (submitted[f.key] ?? '').toString().trim();
      if (f.required && !v) throw new BadRequestException(`${f.label} is required`);
      if (v) customFieldValues[f.key] = v;
    }

    // Re-validate the class server-side — don't trust the client's cached status
    const cls = await this.prisma.class.findUnique({ where: { id: body.classId } });
    if (!cls) throw new BadRequestException('Class not found');
    if (cls.registrationStatus !== 'AVAILABLE') {
      throw new BadRequestException('Registration is not currently open for this class');
    }

    // Dedup: a pending request for the same class+identifier (whichever was given) is returned as-is
    const existing = await this.prisma.classRegistration.findFirst({
      where: {
        classId: body.classId,
        status: 'PENDING',
        OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])],
      },
    });
    if (existing) return existing;

    const passwordHash = await bcrypt.hash(password, 12);
    const created = await this.prisma.classRegistration.create({
      data: {
        classId: body.classId,
        nameKh: settings.khmerNameMode === 'HIDDEN' ? undefined : nameKh || undefined,
        nameEn,
        email: settings.emailMode === 'HIDDEN' ? undefined : email || undefined,
        phone: settings.phoneMode === 'HIDDEN' ? undefined : phone || undefined,
        passwordHash,
        photo: settings.photoMode === 'HIDDEN' ? undefined : body.photo || undefined,
        customFieldValues: Object.keys(customFieldValues).length ? customFieldValues : undefined,
      },
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
      if (reg.email) {
        try {
          await this.notificationService.sendEmail(
            reg.email,
            'Your class registration was not approved',
            `Hi ${reg.nameEn}, your registration for ${reg.class.name} was not approved${body.rejectReason ? `: ${body.rejectReason}` : '.'}`,
          );
        } catch {}
      }
      return updated;
    }

    // APPROVE — create the User + Student accounts using the password the student set at registration
    const normalizedPhone = normalizePhone(reg.phone);
    const existingUser = reg.email
      ? await this.prisma.user.findUnique({ where: { email: reg.email } })
      : normalizedPhone
        ? await this.prisma.user.findUnique({ where: { phoneNormalized: normalizedPhone } })
        : null;
    if (existingUser) {
      throw new BadRequestException(`A user with this ${reg.email ? 'email' : 'phone number'} already exists. Link the student manually instead.`);
    }

    const user = await this.prisma.user.create({
      data: {
        email: reg.email || undefined,
        password: reg.passwordHash,
        name: reg.nameEn,
        phone: reg.phone || undefined,
        phoneNormalized: normalizedPhone || undefined,
        role: 'STUDENT',
      },
    });

    const count = await this.prisma.student.count({ where: { classId: reg.classId } });
    const studentNumber = String(count + 1).padStart(4, '0');

    const student = await this.prisma.student.create({
      data: {
        userId: user.id,
        classId: reg.classId,
        studentNumber,
        nameKh: reg.nameKh || undefined,
        photo: reg.photo || undefined,
        customFieldValues: reg.customFieldValues ?? undefined,
      },
    });

    const updated = await this.prisma.classRegistration.update({
      where: { id },
      data: { status: 'APPROVED', studentId: student.id, resolvedAt: new Date(), resolvedBy: adminUserId },
    });

    if (reg.email) {
      try {
        await this.notificationService.sendEmail(
          reg.email,
          'Your class registration is approved',
          `Hi ${reg.nameEn}, welcome to ${reg.class.name}! Your registration has been approved — log in at your school portal with the email and password you registered with.`,
        );
      } catch {}
    }

    return updated;
  }
}
