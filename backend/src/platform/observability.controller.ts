import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { PlatformScopeGuard } from '../tenancy/platform-scope.guard';
import { ObservabilityService } from './observability.service';

@Controller('platform/observability')
@UseGuards(JwtAuthGuard, RolesGuard, PlatformScopeGuard)
@Roles('PLATFORM_ADMIN')
export class ObservabilityController {
  constructor(private readonly observability: ObservabilityService) {}

  @Get()
  snapshot(@Query('minutes') minutes?: string) {
    const parsed = Number.parseInt(minutes || '60', 10);
    return this.observability.snapshot(Number.isInteger(parsed) ? parsed : 60);
  }
}
