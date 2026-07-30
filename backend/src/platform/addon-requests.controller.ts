import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PlatformScopeGuard } from '../tenancy/platform-scope.guard';
import { AddonRequestsService } from './addon-requests.service';

@Controller('platform/addon-requests')
@UseGuards(JwtAuthGuard, RolesGuard, PlatformScopeGuard)
@Roles('PLATFORM_ADMIN')
export class AddonRequestsController {
  constructor(private requests: AddonRequestsService) {}

  @Get()
  list() {
    return this.requests.list();
  }

  @Get('count')
  async count() {
    return { count: await this.requests.count() };
  }
}
