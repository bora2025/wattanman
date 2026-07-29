import { Controller, Get, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

/**
 * Read-only, any-authenticated-user endpoint the frontend's Sidebar uses to
 * decide which module-gated nav entries to hide for the current school (Phase
 * 7). Not sensitive — which optional programs a school runs isn't secret —
 * so no @Roles() restriction beyond "logged in to this school".
 */
@Controller('school-modules')
@UseGuards(JwtAuthGuard)
export class SchoolModulesController {
  @Get()
  get(@Request() req: any) {
    return { disabledModules: (req.tenantSchool?.disabledModules as string[]) ?? [] };
  }
}
