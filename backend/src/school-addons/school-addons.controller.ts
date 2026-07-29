import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../database/prisma.service';

/**
 * Read-only, any-authenticated-user endpoint a school-side nav could use to
 * decide which paid-addon nav entries to show (same shape as GET
 * /school-modules for Phase 7). No nav currently consumes this — there's no
 * addon-gated page yet — but the data contract exists for whenever one is
 * built, matching the plan's "same enabled-list fetched at login as Phase
 * 7's module toggles" framing.
 */
@Controller('school-addons')
@UseGuards(JwtAuthGuard)
export class SchoolAddonsReadController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async get() {
    // Auto-scoped by PrismaService's tenant-scoping middleware, same as any
    // other query made in 'scoped' mode.
    const rows = await this.prisma.schoolAddon.findMany({ where: { enabled: true } });
    return { enabled: rows.map((r) => r.addonKey) };
  }
}
