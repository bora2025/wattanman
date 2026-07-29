import { Body, Controller, Get, Param, Patch, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PlatformScopeGuard } from '../tenancy/platform-scope.guard';
import { SchoolAddonsService } from './school-addons.service';

@Controller('platform/schools/:schoolId/addons')
@UseGuards(JwtAuthGuard, RolesGuard, PlatformScopeGuard)
@Roles('PLATFORM_ADMIN')
export class SchoolAddonsController {
  constructor(private addons: SchoolAddonsService) {}

  @Get()
  list(@Param('schoolId') schoolId: string) {
    return this.addons.list(schoolId);
  }

  @Patch(':addonKey')
  update(
    @Param('schoolId') schoolId: string,
    @Param('addonKey') addonKey: string,
    @Body() body: { billingStatus?: string; enabled?: boolean; notes?: string },
    @Request() req: any,
  ) {
    return this.addons.update(schoolId, addonKey, body, req.user.userId);
  }
}
