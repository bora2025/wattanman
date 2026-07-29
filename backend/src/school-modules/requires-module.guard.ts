import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRES_MODULE_KEY } from './requires-module.decorator';
import { SchoolModuleKey } from './module-keys';

/**
 * Enforces Phase 7's per-school module toggles at the API level, not just in
 * the nav (a determined client could otherwise still hit a "hidden" module's
 * endpoints directly). Reads `req.tenantSchool` — set by TenantHostMiddleware
 * before any guard runs — rather than re-querying the School row itself.
 */
@Injectable()
export class RequiresModuleGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredModule = this.reflector.getAllAndOverride<SchoolModuleKey | undefined>(REQUIRES_MODULE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredModule) return true; // No @RequiresModule() decorator → unrestricted

    const req = context.switchToHttp().getRequest();
    const school = req.tenantSchool as { disabledModules?: string[] } | undefined;
    const disabled = school?.disabledModules ?? [];
    if (disabled.includes(requiredModule)) {
      throw new ForbiddenException(`This school does not have the "${requiredModule}" module enabled`);
    }
    return true;
  }
}
