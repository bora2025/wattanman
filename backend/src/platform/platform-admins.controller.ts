import { Body, Controller, Delete, Get, Param, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PlatformScopeGuard } from '../tenancy/platform-scope.guard';
import { PlatformAdminsService } from './platform-admins.service';

@Controller('platform/admins')
@UseGuards(JwtAuthGuard, RolesGuard, PlatformScopeGuard)
@Roles('PLATFORM_ADMIN')
export class PlatformAdminsController {
  constructor(private admins: PlatformAdminsService) {}

  @Get()
  list(@Query('cursor') cursor?: string, @Query('limit') limit?: string) {
    return this.admins.list(cursor, limit);
  }

  @Post()
  invite(@Body() body: { name: string; email: string }) {
    return this.admins.invite(body);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Request() req: any) {
    return this.admins.remove(id, req.user.userId);
  }
}
