import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RequiresAddonGuard } from '../school-addons/requires-addon.guard';
import { RequiresAddon } from '../school-addons/requires-addon.decorator';
import { AuthService } from '../auth/auth.service';

/**
 * Phase 11 — dedicated, gated "browse this portal" endpoints for
 * frontend/components/PortalManager.tsx (Teacher Portal / Parent Portal).
 *
 * Deliberately narrow: only the LIST call gets its own gated route here.
 * PortalManager's create/update/delete/photo/password calls stay on the
 * existing AuthController /auth/users* endpoints unchanged — those are
 * shared with Manage Users, Manage Classes, Manage Officer, and Student
 * Portal's own quick-create flows, so walling them off per-role would risk
 * breaking those other, legitimate admin actions. The role passed to
 * AuthService.getUsers() is always hardcoded here, never client-supplied,
 * so a school can't request a role its portal isn't for.
 */
@Controller('portal-manager')
@UseGuards(JwtAuthGuard, RolesGuard, RequiresAddonGuard)
@Roles('ADMIN', 'SUPER_ADMIN')
export class PortalManagerController {
  constructor(private authService: AuthService) {}

  @RequiresAddon('TEACHER_PORTAL')
  @Get('teachers')
  getTeachers() {
    return this.authService.getUsers('TEACHER');
  }

  @RequiresAddon('PARENT_PORTAL')
  @Get('parents')
  getParents() {
    return this.authService.getUsers('PARENT');
  }
}
