import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../database/prisma.service';
import { REQUIRES_ADDON_KEY } from './requires-addon.decorator';

/**
 * Enforces Phase 7a's paid-addon gate at the API level. No current controller
 * uses this yet — the feature it's meant to protect (e.g. face-recognition
 * attendance) doesn't exist in this codebase — but it's built now so that
 * work has a billing gate to attach to on day one. Unlike RequiresModuleGuard
 * (Phase 7), this can't read off `req.tenantSchool` — SchoolAddon is its own
 * table, not a School column — so it queries `schoolAddon.findFirst`, which
 * PrismaService's tenant-scoping middleware auto-scopes to the current
 * school, same as every other query in the app.
 */
@Injectable()
export class RequiresAddonGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredAddon = this.reflector.getAllAndOverride<string | undefined>(REQUIRES_ADDON_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredAddon) return true; // No @RequiresAddon() decorator → unrestricted

    const row = await this.prisma.schoolAddon.findFirst({ where: { addonKey: requiredAddon } });
    if (!row?.enabled) {
      throw new ForbiddenException(`This school does not have the "${requiredAddon}" add-on enabled`);
    }
    return true;
  }
}
