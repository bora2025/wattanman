import { Controller, Get, Post, Patch, Body, Query, Param, UseGuards, Request, BadRequestException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ClassRegistrationsService } from './class-registrations.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('class-registrations')
export class ClassRegistrationsController {
  constructor(private svc: ClassRegistrationsService) {}

  // ─── Public — no auth required ─────────────────────────────────────────
  @Get('public/classes')
  listPublicClasses() {
    return this.svc.listPublicClasses();
  }

  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('public')
  async submit(
    @Body()
    body: { classId: string; nameKh: string; nameEn: string; email: string; phone: string; password: string; photo?: string },
  ) {
    return this.svc.createRegistration(body);
  }

  // ─── Admin: list & resolve ──────────────────────────────────────────────
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'CLASS_ADMIN')
  @Get()
  async list(@Request() req: any, @Query('status') status?: string) {
    return this.svc.listRegistrations(status, req.user?.role, req.user?.userId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'CLASS_ADMIN')
  @Patch(':id')
  async resolve(
    @Request() req: any,
    @Param('id') id: string,
    @Body() body: { action: 'APPROVE' | 'REJECT'; rejectReason?: string },
  ) {
    if (body?.action !== 'APPROVE' && body?.action !== 'REJECT') {
      throw new BadRequestException('action must be APPROVE or REJECT');
    }
    return this.svc.resolveRegistration(req.user.userId, id, body);
  }
}
