import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { resolveTxt } from 'dns/promises';
import { PrismaService } from '../database/prisma.service';
import { PLATFORM_SCHOOL_SUBDOMAIN } from './constants';

export function normalizeHostname(rawHost: string): string {
  const firstValue = (rawHost || '').split(',')[0].trim().toLowerCase();
  if (!firstValue) return '';

  if (firstValue.startsWith('[')) {
    const closingBracket = firstValue.indexOf(']');
    return closingBracket >= 0
      ? firstValue.slice(1, closingBracket)
      : firstValue;
  }

  return firstValue.split(':')[0].replace(/\.$/, '');
}

@Injectable()
export class SchoolDomainService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(rawHost: string) {
    const hostname = normalizeHostname(rawHost);
    if (!hostname) return null;

    const platformHost = normalizeHostname(process.env.PLATFORM_HOST || '');
    if (platformHost && hostname === platformHost) {
      return this.prisma.school.findUnique({
        where: { subdomain: PLATFORM_SCHOOL_SUBDOMAIN },
      });
    }

    const domain = await this.prisma.schoolDomain.findFirst({
      where: { hostname, status: 'VERIFIED' },
      include: { school: true },
    });
    if (domain) return domain.school;

    const rootDomain = normalizeHostname(process.env.SCHOOL_ROOT_DOMAIN || '');
    if (rootDomain && hostname.endsWith(`.${rootDomain}`)) {
      const subdomain = hostname.slice(0, -(rootDomain.length + 1));
      if (subdomain && !subdomain.includes('.')) {
        const legacyAlias = await this.prisma.schoolDomain.findFirst({
          where: {
            hostname: subdomain,
            type: 'LEGACY_ALIAS',
            status: 'VERIFIED',
          },
          include: { school: true },
        });
        if (legacyAlias) return legacyAlias.school;
      }
    }

    return null;
  }

  async registerManagedDomain(schoolId: string, subdomain: string) {
    const rootDomain = normalizeHostname(process.env.SCHOOL_ROOT_DOMAIN || '');
    const hostname = rootDomain ? `${subdomain}.${rootDomain}` : subdomain;
    return this.prisma.schoolDomain.upsert({
      where: { hostname },
      update: { schoolId, type: rootDomain ? 'MANAGED' : 'LEGACY_ALIAS' },
      create: {
        schoolId,
        hostname,
        type: rootDomain ? 'MANAGED' : 'LEGACY_ALIAS',
        status: 'VERIFIED',
        verifiedAt: new Date(),
      },
    });
  }

  async registerVerifiedDomain(
    schoolId: string,
    rawHostname: string,
    type: 'MANAGED' | 'CUSTOM' | 'PLATFORM' = 'CUSTOM',
  ) {
    const hostname = normalizeHostname(rawHostname);
    if (!hostname || hostname === 'localhost' || !hostname.includes('.')) {
      throw new BadRequestException('A valid fully-qualified hostname is required');
    }

    const existing = await this.prisma.schoolDomain.findUnique({
      where: { hostname },
    });
    if (existing && existing.schoolId !== schoolId) {
      throw new ConflictException('Hostname is already assigned to another school');
    }

    return this.prisma.schoolDomain.upsert({
      where: { hostname },
      update: {
        schoolId,
        type,
        status: 'VERIFIED',
        verifiedAt: new Date(),
        routingStatus: 'READY',
        routingCheckedAt: new Date(),
        routingError: null,
      },
      create: {
        schoolId,
        hostname,
        type,
        status: 'VERIFIED',
        verifiedAt: new Date(),
        routingStatus: 'READY',
        routingCheckedAt: new Date(),
      },
    });
  }

  async requestCustomDomain(schoolId: string, rawHostname: string) {
    const hostname = normalizeHostname(rawHostname);
    if (!hostname || hostname === 'localhost' || !hostname.includes('.')) {
      throw new BadRequestException('A valid fully-qualified hostname is required');
    }

    const existing = await this.prisma.schoolDomain.findUnique({
      where: { hostname },
    });
    if (existing && existing.schoolId !== schoolId) {
      throw new ConflictException('Hostname is already assigned to another school');
    }

    const verificationToken = crypto.randomBytes(24).toString('hex');
    const domain = await this.prisma.schoolDomain.upsert({
      where: { hostname },
      update: {
        schoolId,
        type: 'CUSTOM',
        status: 'PENDING',
        verificationToken,
        verifiedAt: null,
        lastCheckedAt: null,
        verificationError: null,
      },
      create: {
        schoolId,
        hostname,
        type: 'CUSTOM',
        status: 'PENDING',
        verificationToken,
      },
    });

    return {
      ...domain,
      verification: {
        recordType: 'TXT',
        recordName: `_wattaman-verification.${hostname}`,
        recordValue: `wattaman-verification=${verificationToken}`,
      },
    };
  }

  async verifyCustomDomain(schoolId: string, domainId: string) {
    const domain = await this.prisma.schoolDomain.findFirst({
      where: { id: domainId, schoolId, type: 'CUSTOM' },
    });
    if (!domain) throw new BadRequestException('Custom domain was not found');
    if (!domain.verificationToken) {
      throw new BadRequestException('Custom domain has no verification challenge');
    }

    const checkedAt = new Date();
    const expected = `wattaman-verification=${domain.verificationToken}`;
    try {
      const records = await resolveTxt(`_wattaman-verification.${domain.hostname}`);
      const values = records.map((parts) => parts.join(''));
      if (!values.includes(expected)) {
        const verificationError = 'Verification TXT record does not match';
        await this.prisma.schoolDomain.update({
          where: { id: domain.id },
          data: { status: 'PENDING', lastCheckedAt: checkedAt, verificationError },
        });
        return { verified: false, error: verificationError };
      }

      const verified = await this.prisma.schoolDomain.update({
        where: { id: domain.id },
        data: {
          status: 'VERIFIED',
          verifiedAt: checkedAt,
          lastCheckedAt: checkedAt,
          verificationError: null,
        },
      });
      return { verified: true, domain: verified };
    } catch (error: any) {
      const verificationError =
        error?.code === 'ENOTFOUND' || error?.code === 'ENODATA'
          ? 'Verification TXT record was not found'
          : 'DNS verification lookup failed';
      await this.prisma.schoolDomain.update({
        where: { id: domain.id },
        data: { status: 'PENDING', lastCheckedAt: checkedAt, verificationError },
      });
      return { verified: false, error: verificationError };
    }
  }

  listForSchool(schoolId: string) {
    return this.prisma.schoolDomain.findMany({
      where: { schoolId },
      orderBy: [{ type: 'asc' }, { hostname: 'asc' }],
    });
  }

  async updateRoutingState(
    schoolId: string,
    domainId: string,
    result: { ok: true } | { ok: false; reason: string },
  ) {
    const domain = await this.prisma.schoolDomain.findFirst({
      where: { id: domainId, schoolId },
    });
    if (!domain) throw new BadRequestException('School domain was not found');

    return this.prisma.schoolDomain.update({
      where: { id: domain.id },
      data: {
        routingStatus: result.ok === true ? 'READY' : 'FAILED',
        routingCheckedAt: new Date(),
        routingError: result.ok === true ? null : result.reason,
      },
    });
  }
}
