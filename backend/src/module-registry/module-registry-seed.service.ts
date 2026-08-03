import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { MODULE_REGISTRY } from './module-registry';

/**
 * Phase 24 — replaces the old standalone `prisma/seed-module-registry.ts`
 * script. Runs the exact same idempotent upsert, but as part of the app's
 * own boot sequence instead of a separate command someone has to remember
 * to run — MODULE_REGISTRY is already a normal, type-checked import here,
 * so there's no build-step (compiling prisma/*.ts, or adding ts-node to
 * the production image) needed to make that work. A newly-registered
 * module's catalog row now appears automatically on the very next deploy.
 */
@Injectable()
export class ModuleRegistrySeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ModuleRegistrySeedService.name);

  constructor(private prisma: PrismaService) {}

  async onApplicationBootstrap() {
    for (const m of MODULE_REGISTRY) {
      await this.prisma.addonDefinition.upsert({
        where: { key: m.key },
        // Don't clobber a platform admin's own edits (name/description/
        // category/isActive/kind) on every restart — same reasoning the
        // old script's `update: {}` already had.
        update: {},
        create: { key: m.key, kind: 'MODULE', name: m.name, description: m.description, category: m.category },
      });
    }
    this.logger.log(`Module registry seeded (${MODULE_REGISTRY.length} entries checked).`);
  }
}
