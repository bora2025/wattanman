import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { BILLING_STATUSES, BillingStatus, SCHOOL_ADDON_KEYS, SCHOOL_ADDON_LABELS, SCHOOL_ADDON_DESCRIPTIONS, isValidAddonKey } from '../school-addons/addon-keys';
import { SchoolsService } from './schools.service';

@Injectable()
export class SchoolAddonsService {
  constructor(
    private prisma: PrismaService,
    private schools: SchoolsService,
  ) {}

  /** Every canonical addon key for a school, merged with whatever SchoolAddon
   * rows already exist — a key with no row yet is a synthesized PENDING/disabled
   * default rather than requiring every school to be bootstrapped with rows for
   * add-ons it has never touched. */
  async list(schoolId: string) {
    await this.schools.getOne(schoolId); // 404s on unknown/sentinel school
    const rows = await this.prisma.schoolAddon.findMany({ where: { schoolId } });
    const byKey = new Map(rows.map((r) => [r.addonKey, r]));
    return SCHOOL_ADDON_KEYS.map((key) => {
      const row = byKey.get(key);
      return {
        addonKey: key,
        label: SCHOOL_ADDON_LABELS[key],
        description: SCHOOL_ADDON_DESCRIPTIONS[key],
        billingStatus: row?.billingStatus ?? 'PENDING',
        enabled: row?.enabled ?? false,
        activatedAt: row?.activatedAt ?? null,
        activatedBy: row?.activatedBy ?? null,
        notes: row?.notes ?? null,
      };
    });
  }

  async update(
    schoolId: string,
    addonKey: string,
    data: { billingStatus?: string; enabled?: boolean; notes?: string },
    platformAdminId: string,
  ) {
    await this.schools.getOne(schoolId);
    if (!isValidAddonKey(addonKey)) {
      throw new BadRequestException(`Unknown addon key: ${addonKey}`);
    }
    if (data.billingStatus && !BILLING_STATUSES.includes(data.billingStatus as BillingStatus)) {
      throw new BadRequestException(`billingStatus must be one of ${BILLING_STATUSES.join(', ')}`);
    }

    const existing = await this.prisma.schoolAddon.findFirst({ where: { schoolId, addonKey } });
    // Stamp activation metadata only on a real PENDING/off → enabled transition,
    // not on every save — re-saving notes on an already-enabled addon shouldn't
    // move activatedAt forward.
    const turningOn = data.enabled === true && !(existing?.enabled ?? false);

    return this.prisma.schoolAddon.upsert({
      where: { schoolId_addonKey: { schoolId, addonKey } },
      create: {
        schoolId,
        addonKey,
        billingStatus: data.billingStatus ?? 'PENDING',
        enabled: data.enabled ?? false,
        notes: data.notes,
        activatedAt: turningOn ? new Date() : undefined,
        activatedBy: turningOn ? platformAdminId : undefined,
      },
      update: {
        billingStatus: data.billingStatus,
        enabled: data.enabled,
        notes: data.notes,
        ...(turningOn ? { activatedAt: new Date(), activatedBy: platformAdminId } : {}),
      },
    });
  }
}
