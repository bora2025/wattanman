import { BadRequestException, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PlatformScopeGuard } from '../tenancy/platform-scope.guard';
import { SchoolMetricsService } from '../school-metrics/school-metrics.service';

function parseDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  if (isNaN(d.getTime())) throw new BadRequestException('date must be a valid ISO date, e.g. 2026-07-30');
  return d;
}

@Controller('platform/school-metrics')
@UseGuards(JwtAuthGuard, RolesGuard, PlatformScopeGuard)
@Roles('PLATFORM_ADMIN')
export class SchoolMetricsController {
  constructor(private metrics: SchoolMetricsService) {}

  /** Every school's activity for one day (defaults to yesterday) — the
   * cross-school comparison table. */
  @Get()
  list(@Query('date') date?: string, @Query('cursor') cursor?: string, @Query('limit') limit?: string) {
    return this.metrics.listForDate(parseDate(date), cursor, limit);
  }

  /** One school's daily trend over the last N days (default 30). */
  @Get(':schoolId')
  trend(@Param('schoolId') schoolId: string, @Query('days') days?: string) {
    const n = days ? parseInt(days, 10) : 30;
    if (!n || n < 1 || n > 365) throw new BadRequestException('days must be between 1 and 365');
    return this.metrics.trendForSchool(schoolId, n);
  }

  /** Manually (re)compute a specific day rather than waiting for the nightly
   * job — for backfilling a past date or refreshing one on demand. */
  @Post('recompute')
  recompute(@Query('date') date?: string) {
    const target = parseDate(date) ?? new Date(Date.now() - 24 * 60 * 60 * 1000);
    return this.metrics.computeForDate(target);
  }
}
