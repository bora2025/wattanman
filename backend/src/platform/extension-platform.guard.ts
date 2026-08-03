import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';

@Injectable()
export class ExtensionPlatformGuard implements CanActivate {
  canActivate() {
    if (process.env.EXTENSION_PLATFORM_ENABLED?.trim().toLowerCase() === 'false') {
      throw new NotFoundException('Extension platform is disabled');
    }
    return true;
  }
}
