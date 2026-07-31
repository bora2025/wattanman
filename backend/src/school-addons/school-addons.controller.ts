import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PrismaService } from '../database/prisma.service';
import { CurrentSchool } from '../tenancy/current-school.decorator';

/**
 * School-side Modules & Add-ons surface. GET routes are any-authenticated-
 * user (nav filtering needs them everywhere); the write routes added in
 * Phase 10 are ADMIN-only, matching /admin/addons's own AuthGuard.
 *
 * Free MODULEs are fully self-service (enable and disable both, no platform
 * admin involved). Paid ADDONs are request-only here — a school can ask for
 * one and cancel their own pending ask, but only a PLATFORM_ADMIN can
 * actually flip `enabled` on a paid add-on (backend/src/platform/school-addons.controller.ts),
 * since that's the point where billing actually matters.
 */
@Controller('school-addons')
@UseGuards(JwtAuthGuard)
export class SchoolAddonsSelfServiceController {
  constructor(private prisma: PrismaService) {}

  /** Just the enabled-key list — lightweight, for nav-item filtering. */
  @Get()
  async get() {
    // Auto-scoped by PrismaService's tenant-scoping middleware, same as any
    // other query made in 'scoped' mode.
    const rows = await this.prisma.schoolAddon.findMany({ where: { enabled: true } });
    return { enabled: rows.map((r) => r.addonKey) };
  }

  /** The full browsable catalog for this school's own Add-ons directory page
   * — every active listing, annotated with whether this school already has
   * it enabled and (for paid add-ons) whether a request is pending.
   * AddonDefinition itself isn't tenant-scoped (one catalog, shared by every
   * school), so this query runs unscoped by construction; only the
   * SchoolAddon lookup below is auto-scoped to the current tenant. */
  @Get('directory')
  async directory() {
    const [definitions, rows] = await Promise.all([
      this.prisma.addonDefinition.findMany({ where: { isActive: true }, orderBy: { createdAt: 'asc' } }),
      this.prisma.schoolAddon.findMany({}),
    ]);
    const byKey = new Map(rows.map((r) => [r.addonKey, r]));
    return definitions.map((d) => {
      const row = byKey.get(d.key);
      return {
        addonKey: d.key,
        kind: d.kind,
        name: d.name,
        description: d.description,
        detailDescription: d.detailDescription,
        screenshotUrl: d.screenshotUrl,
        category: d.category,
        icon: d.icon,
        price: d.price,
        priceNote: d.priceNote,
        enabled: row?.enabled ?? false,
        requested: !!row?.requestedAt && !row?.enabled,
      };
    });
  }

  private async getDefinitionOrThrow(addonKey: string) {
    const definition = await this.prisma.addonDefinition.findUnique({ where: { key: addonKey } });
    if (!definition || !definition.isActive) {
      throw new BadRequestException(`Unknown or retired addon key: ${addonKey}`);
    }
    return definition;
  }

  /** Self-toggle a free module on or off — no platform admin involved. */
  @Roles('ADMIN')
  @UseGuards(RolesGuard)
  @Patch(':addonKey')
  async toggleModule(@Param('addonKey') addonKey: string, @Body() body: { enabled: boolean }, @CurrentSchool() schoolId: string) {
    const definition = await this.getDefinitionOrThrow(addonKey);
    if (definition.kind !== 'MODULE') {
      throw new BadRequestException('Only free modules can be self-toggled — paid add-ons go through the request flow.');
    }
    return this.prisma.schoolAddon.upsert({
      where: { schoolId_addonKey: { schoolId, addonKey } },
      create: { schoolId, addonKey, enabled: body.enabled },
      update: { enabled: body.enabled },
    });
  }

  /** Ask the platform admin for a paid add-on — doesn't turn it on. */
  @Roles('ADMIN')
  @UseGuards(RolesGuard)
  @Post(':addonKey/request')
  async requestAddon(@Param('addonKey') addonKey: string, @Request() req: any, @CurrentSchool() schoolId: string) {
    const definition = await this.getDefinitionOrThrow(addonKey);
    if (definition.kind !== 'ADDON') {
      throw new BadRequestException('Free modules are self-service — use PATCH instead of requesting them.');
    }
    const existing = await this.prisma.schoolAddon.findFirst({ where: { addonKey } });
    if (existing?.enabled) {
      throw new BadRequestException('This add-on is already enabled for your school.');
    }
    if (existing?.requestedAt) {
      return existing; // idempotent — a double-click shouldn't error
    }
    return this.prisma.schoolAddon.upsert({
      where: { schoolId_addonKey: { schoolId, addonKey } },
      create: { schoolId, addonKey, requestedAt: new Date(), requestedBy: req.user.userId },
      update: { requestedAt: new Date(), requestedBy: req.user.userId },
    });
  }

  /** Cancel your own pending request before the platform admin acts on it. */
  @Roles('ADMIN')
  @UseGuards(RolesGuard)
  @Delete(':addonKey/request')
  async cancelRequest(@Param('addonKey') addonKey: string) {
    const existing = await this.prisma.schoolAddon.findFirst({ where: { addonKey } });
    if (!existing?.requestedAt) {
      throw new BadRequestException('No pending request to cancel.');
    }
    if (existing.enabled) {
      throw new BadRequestException('This add-on is already enabled — contact the platform admin to disable it.');
    }
    return this.prisma.schoolAddon.update({
      where: { id: existing.id },
      data: { requestedAt: null, requestedBy: null },
    });
  }
}
