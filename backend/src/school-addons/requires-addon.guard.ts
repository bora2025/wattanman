import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PrismaService } from "../database/prisma.service";
import {
  REQUIRES_ADDON_KEY,
  SKIP_ADDON_CHECK_KEY,
} from "./requires-addon.decorator";

/**
 * Enforces the installed-extension gate for both built-in and uploaded
 * modules. The historical decorator name is retained to avoid touching every
 * controller, but SchoolAddon is no longer consulted.
 */
@Injectable()
export class RequiresAddonGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Method-level escape hatch, checked before the class-level requirement —
    // see SkipAddonCheck()'s own doc comment for why this exists.
    if (this.reflector.get<boolean>(SKIP_ADDON_CHECK_KEY, context.getHandler()))
      return true;

    const requiredAddon = this.reflector.getAllAndOverride<string | undefined>(
      REQUIRES_ADDON_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredAddon) return true; // No @RequiresAddon() decorator → unrestricted

    const installation = await this.prisma.extensionInstallation.findFirst({
      where: {
        enabled: true,
        installedAt: { not: null },
        uninstalledAt: null,
        extension: { key: requiredAddon, status: "ACTIVE" },
        installedVersion: {
          lifecycleStatus: { in: ["PUBLISHED", "DEPRECATED"] },
        },
      },
    });
    if (!installation) {
      throw new ForbiddenException(
        `This school does not have the "${requiredAddon}" extension enabled`,
      );
    }
    return true;
  }
}
