import { Controller, Get, Query, UseGuards, Res, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PrismaService } from '../database/prisma.service';

@Controller('audit')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SUPER_ADMIN')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  /** Paginated, filtered list of audit log entries. */
  @Get('logs')
  async list(
    @Query('actorId') actorId?: string,
    @Query('action') action?: string,
    @Query('resource') resource?: string,
    @Query('resourceId') resourceId?: string,
    @Query('success') success?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('q') q?: string,
    @Query('page') page = '1',
    @Query('pageSize') pageSize = '50',
  ) {
    const where = this.buildWhere({ actorId, action, resource, resourceId, success, from, to, q });
    const take = Math.min(Math.max(parseInt(pageSize, 10) || 50, 1), 200);
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const skip = (pageNum - 1) * take;
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, total, page: pageNum, pageSize: take, pages: Math.ceil(total / take) };
  }

  /** Distinct values for filter dropdowns. */
  @Get('logs/facets')
  async facets() {
    const [actions, resources, actors] = await Promise.all([
      this.prisma.auditLog.findMany({ select: { action: true }, distinct: ['action'], orderBy: { action: 'asc' } }),
      this.prisma.auditLog.findMany({ select: { resource: true }, distinct: ['resource'], orderBy: { resource: 'asc' } }),
      this.prisma.auditLog.findMany({
        where: { actorId: { not: null } },
        select: { actorId: true, actorName: true, actorEmail: true, actorRole: true },
        distinct: ['actorId'],
        orderBy: { actorName: 'asc' },
        take: 500,
      }),
    ]);
    return {
      actions: actions.map((r) => r.action),
      resources: resources.map((r) => r.resource),
      actors,
    };
  }

  /** Stream a CSV of the current filter set (max 50k rows). */
  @Get('logs/export.csv')
  async exportCsv(
    @Res() res: Response,
    @Query('actorId') actorId?: string,
    @Query('action') action?: string,
    @Query('resource') resource?: string,
    @Query('resourceId') resourceId?: string,
    @Query('success') success?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('q') q?: string,
  ) {
    const where = this.buildWhere({ actorId, action, resource, resourceId, success, from, to, q });
    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50000,
    });
    const header = [
      'Timestamp', 'Actor', 'Email', 'Role', 'Action', 'Resource', 'Resource ID',
      'Resource Label', 'Method', 'Path', 'Status', 'Success', 'IP', 'Error',
    ].join(',');
    const esc = (v: any) => {
      if (v === null || v === undefined) return '';
      const s = String(v).replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    };
    const lines = rows.map((r) => [
      r.createdAt.toISOString(), esc(r.actorName), esc(r.actorEmail), esc(r.actorRole),
      esc(r.action), esc(r.resource), esc(r.resourceId), esc(r.resourceLabel),
      esc(r.method), esc(r.path), esc(r.statusCode), r.success ? 'true' : 'false',
      esc(r.ip), esc(r.errorMessage),
    ].join(','));
    const csv = '\uFEFF' + [header, ...lines].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${Date.now()}.csv"`);
    res.send(csv);
  }

  /** Aggregate stats for the dashboard card. */
  @Get('logs/stats')
  async stats() {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const sinceWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [last24h, last7d, failures24h, byAction] = await Promise.all([
      this.prisma.auditLog.count({ where: { createdAt: { gte: since } } }),
      this.prisma.auditLog.count({ where: { createdAt: { gte: sinceWeek } } }),
      this.prisma.auditLog.count({ where: { createdAt: { gte: since }, success: false } }),
      this.prisma.auditLog.groupBy({
        by: ['action'],
        where: { createdAt: { gte: sinceWeek } },
        _count: { action: true },
        orderBy: { _count: { action: 'desc' } },
        take: 10,
      }),
    ]);
    return {
      last24h,
      last7d,
      failures24h,
      byAction: byAction.map((b) => ({ action: b.action, count: b._count.action })),
    };
  }

  private buildWhere(f: {
    actorId?: string; action?: string; resource?: string; resourceId?: string;
    success?: string; from?: string; to?: string; q?: string;
  }) {
    const where: any = {};
    if (f.actorId) where.actorId = f.actorId;
    if (f.action) where.action = f.action;
    if (f.resource) where.resource = f.resource;
    if (f.resourceId) where.resourceId = f.resourceId;
    if (f.success === 'true') where.success = true;
    if (f.success === 'false') where.success = false;
    if (f.from || f.to) {
      where.createdAt = {};
      if (f.from) {
        const d = new Date(f.from);
        if (Number.isNaN(d.getTime())) throw new HttpException('Invalid "from" date', HttpStatus.BAD_REQUEST);
        where.createdAt.gte = d;
      }
      if (f.to) {
        const d = new Date(f.to);
        if (Number.isNaN(d.getTime())) throw new HttpException('Invalid "to" date', HttpStatus.BAD_REQUEST);
        where.createdAt.lte = d;
      }
    }
    if (f.q) {
      const q = f.q;
      where.OR = [
        { actorName: { contains: q, mode: 'insensitive' } },
        { actorEmail: { contains: q, mode: 'insensitive' } },
        { resourceLabel: { contains: q, mode: 'insensitive' } },
        { resourceId: { contains: q, mode: 'insensitive' } },
        { path: { contains: q, mode: 'insensitive' } },
      ];
    }
    return where;
  }
}
