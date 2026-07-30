import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { BILLING_STATUSES, BillingStatus } from '../school-addons/addon-keys';
import { SchoolsService } from './schools.service';

@Injectable()
export class SchoolAddonsService {
  constructor(
    private prisma: PrismaService,
    private schools: SchoolsService,
  ) {}

  /** Every active catalog listing (Platform tier's Add-ons Directory), merged
   * with whatever SchoolAddon rows already exist for this school — a listing
   * with no row yet is a synthesized PENDING/disabled default rather than
   * requiring every school to be bootstrapped with rows for add-ons it has
   * never touched. Retired listings (isActive: false) are only included if
   * this school already has a row for them — a retired add-on shouldn't
   * vanish from a school that's actively paying for it, just stop being
   * offered to schools that don't have it yet. */
  async list(schoolId: string) {
    await this.schools.getOne(schoolId); // 404s on unknown/sentinel school
    const [definitions, rows] = await Promise.all([
      this.prisma.addonDefinition.findMany({ orderBy: { createdAt: 'asc' } }),
      this.prisma.schoolAddon.findMany({ where: { schoolId } }),
    ]);
    const byKey = new Map(rows.map((r) => [r.addonKey, r]));
    return definitions
      .filter((d) => d.isActive || byKey.has(d.key))
      .map((d) => {
        const row = byKey.get(d.key);
        return {
          addonKey: d.key,
          label: d.name,
          description: d.description,
          category: d.category,
          icon: d.icon,
          price: d.price,
          priceNote: d.priceNote,
          retired: !d.isActive,
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
    const definition = await this.prisma.addonDefinition.findUnique({ where: { key: addonKey } });
    if (!definition) {
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
