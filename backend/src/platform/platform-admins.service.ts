import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../database/prisma.service';
import { generatePassword, isValidEmail } from '../common/identity';
import { PLATFORM_SCHOOL_SUBDOMAIN } from '../tenancy/constants';
import { dateIdPage, decodeDateIdCursor, parsePageLimit } from '../common/cursor-pagination';

/**
 * Manages PLATFORM_ADMIN accounts — Wattaman's own staff, not school users.
 * Platform staff remain a bounded operational collection even when multiple
 * support teams and automation identities are added.
 */
@Injectable()
export class PlatformAdminsService {
  constructor(private prisma: PrismaService) {}

  private async sentinelSchoolId(): Promise<string> {
    const sentinel = await this.prisma.school.findUnique({ where: { subdomain: PLATFORM_SCHOOL_SUBDOMAIN } });
    if (!sentinel) throw new Error('Platform sentinel school row is missing — was the database seeded?');
    return sentinel.id;
  }

  async list(cursorValue?: string, limitValue?: string) {
    const schoolId = await this.sentinelSchoolId();
    const limit = parsePageLimit(limitValue);
    const cursor = decodeDateIdCursor(cursorValue);
    const rows = await this.prisma.user.findMany({
      where: {
        schoolId,
        role: 'PLATFORM_ADMIN',
        ...(cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}),
      },
      select: { id: true, name: true, email: true, mfaEnabled: true, createdAt: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    return dateIdPage(rows, limit);
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
