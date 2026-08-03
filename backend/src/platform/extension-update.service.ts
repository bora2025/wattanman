import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../database/prisma.service';
import { ExtensionInstallationsService } from './extension-installations.service';

@Injectable()
export class ExtensionUpdateService {
  private readonly logger = new Logger(ExtensionUpdateService.name);

  constructor(private prisma: PrismaService, private installations: ExtensionInstallationsService) {}

  @Cron('0 */6 * * *')
  async run() {
    const candidates = await this.prisma.extensionInstallation.findMany({
      where: { installedAt: { not: null }, uninstalledAt: null, extension: { status: 'ACTIVE' } },
      include: {
        installedVersion: true,
        extension: { include: { versions: { where: { lifecycleStatus: 'PUBLISHED' }, orderBy: { publishedAt: 'desc' }, take: 1 } } },
      },
    });
    let upgraded = 0;
    let notified = 0;
    for (const installation of candidates) {
      const target = installation.extension.versions[0];
      if (!target || target.id === installation.installedVersionId) continue;
      const currentPermissions = ((installation.installedVersion.manifest as Record<string, any>)?.permissions || []) as string[];
      const targetPermissions = ((target.manifest as Record<string, any>)?.permissions || []) as string[];
      const addedPermissions = targetPermissions.filter((permission) => !currentPermissions.includes(permission));
      if (installation.updatePolicy === 'AUTO_APPROVED' && !addedPermissions.length) {
        try {
          await this.installations.upgrade(installation.id, target.id, { role: 'SYSTEM', name: 'Extension update scheduler' }, false);
          upgraded += 1;
          continue;
        } catch (error: any) {
          this.logger.warn(`Automatic extension update failed for ${installation.id}: ${error?.message || error}`);
        }
      }
      const newlyAvailable = installation.availableVersionId !== target.id;
      await this.prisma.extensionInstallation.update({
        where: { id: installation.id },
        data: { availableVersionId: target.id, updateNotifiedAt: newlyAvailable && installation.updatePolicy !== 'MANUAL' ? new Date() : installation.updateNotifiedAt },
      });
      if (newlyAvailable && installation.updatePolicy !== 'MANUAL') {
        const admins = await this.prisma.user.findMany({
          where: { schoolId: installation.schoolId, role: { in: ['ADMIN', 'SUPER_ADMIN'] } },
          select: { id: true },
        });
        if (admins.length) {
          await this.prisma.notification.createMany({
            data: admins.map((admin) => ({
              schoolId: installation.schoolId,
              userId: admin.id,
              type: 'EXTENSION_UPDATE',
              message: `${installation.extension.name} ${target.version} is available${addedPermissions.length ? ` and requests: ${addedPermissions.join(', ')}` : ''}.`,
            })),
          });
        }
        notified += 1;
      }
    }
    this.logger.log(`Extension updates: ${upgraded} automatic upgrades, ${notified} school notifications.`);
    return { upgraded, notified };
  }
}
