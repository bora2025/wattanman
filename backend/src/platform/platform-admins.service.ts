import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../database/prisma.service';
import { generatePassword, isValidEmail } from '../common/identity';
import { PLATFORM_SCHOOL_SUBDOMAIN } from '../tenancy/constants';

/**
 * Manages PLATFORM_ADMIN accounts — Wattaman's own staff, not school users.
 * Deliberately a short, simple list: this is expected to stay small (a
 * handful of ops/support staff), unlike per-school user management, which is
 * why there's no pagination/search here the way auth.service.ts's getUsers
 * has for the (potentially large) per-school user list.
 */
@Injectable()
export class PlatformAdminsService {
  constructor(private prisma: PrismaService) {}

  private async sentinelSchoolId(): Promise<string> {
    const sentinel = await this.prisma.school.findUnique({ where: { subdomain: PLATFORM_SCHOOL_SUBDOMAIN } });
    if (!sentinel) throw new Error('Platform sentinel school row is missing — was the database seeded?');
    return sentinel.id;
  }

  async list() {
    const schoolId = await this.sentinelSchoolId();
    return this.prisma.user.findMany({
      where: { schoolId, role: 'PLATFORM_ADMIN' },
      select: { id: true, name: true, email: true, mfaEnabled: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async invite(data: { name: string; email: string }) {
    const name = (data.name || '').trim();
    const email = (data.email || '').trim().toLowerCase();
    if (!name) throw new BadRequestException('Name is required');
    if (!email || !isValidEmail(email)) throw new BadRequestException('A valid email is required');

    const schoolId = await this.sentinelSchoolId();
    const existing = await this.prisma.user.findFirst({ where: { schoolId, email } });
    if (existing) throw new ConflictException('A platform admin with this email already exists');

    const tempPassword = generatePassword(12);
    const hashed = await bcrypt.hash(tempPassword, 12);
    const user = await this.prisma.user.create({
      data: { schoolId, name, email, password: hashed, role: 'PLATFORM_ADMIN' },
      select: { id: true, name: true, email: true },
    });
    const publisher = await this.prisma.extensionPublisher.findUnique({ where: { key: 'WATTAMAN' } });
    if (publisher) {
      await this.prisma.extensionPublisherMember.upsert({
        where: { publisherId_userId: { publisherId: publisher.id, userId: user.id } },
        update: { roles: ['UPLOAD', 'REVIEW', 'PUBLISH', 'MANAGE'], status: 'ACTIVE' },
        create: { publisherId: publisher.id, userId: user.id, roles: ['UPLOAD', 'REVIEW', 'PUBLISH', 'MANAGE'], status: 'ACTIVE' },
      });
    }
    return { admin: user, temporaryPassword: tempPassword };
  }

  async remove(id: string, callerId: string) {
    if (id === callerId) {
      throw new BadRequestException('Cannot remove your own platform admin account');
    }
    await this.prisma.user.delete({ where: { id } });
    return { ok: true };
  }
}
