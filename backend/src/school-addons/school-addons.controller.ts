import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../database/prisma.service';

/**
 * Read-only, any-authenticated-user endpoints a school-side nav/page uses to
 * browse the Platform tier's Add-ons Directory and see what's already
 * enabled for this school (same shape as GET /school-modules for Phase 7).
 */
@Controller('school-addons')
@UseGuards(JwtAuthGuard)
export class SchoolAddonsReadController {
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
   * — every active listing, each annotated with whether this school already
   * has it enabled. AddonDefinition itself isn't tenant-scoped (one catalog,
   * shared by every school), so this query runs unscoped by construction;
   * only the SchoolAddon lookup below is auto-scoped to the current tenant. */
  @Get('directory')
  async directory() {
    const [definitions, rows] = await Promise.all([
      this.prisma.addonDefinition.findMany({ where: { isActive: true }, orderBy: { createdAt: 'asc' } }),
      this.prisma.schoolAddon.findMany({ where: { enabled: true } }),
    ]);
    const enabledKeys = new Set(rows.map((r) => r.addonKey));
    return definitions.map((d) => ({
      addonKey: d.key,
      name: d.name,
      description: d.description,
      category: d.category,
      icon: d.icon,
      price: d.price,
      priceNote: d.priceNote,
      enabled: enabledKeys.has(d.key),
    }));
  }
}
