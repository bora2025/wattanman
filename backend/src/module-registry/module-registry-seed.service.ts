import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { MODULE_REGISTRY } from "./module-registry";

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
    const publisher = await this.prisma.extensionPublisher.upsert({
      where: { key: "WATTAMAN" },
      update: {},
      create: {
        key: "WATTAMAN",
        name: "Wattaman",
        status: "ACTIVE",
        internal: true,
      },
    });
    for (const m of MODULE_REGISTRY) {
      const extension = await this.prisma.extension.upsert({
        where: { key: m.key },
        update: {},
        create: {
          key: m.key,
          name: m.name,
          description: m.description,
          runtimeType: "CORE_MODULE",
          commercialType: "MODULE",
          category: m.category,
          publisher: "WATTAMAN",
          publisherId: publisher.id,
          status: "ACTIVE",
          isListed: true,
          visibility: "LISTED",
        },
      });
      await this.prisma.extensionVersion.upsert({
        where: {
          extensionId_version: { extensionId: extension.id, version: "1.0.0" },
        },
        update: {},
        create: {
          extensionId: extension.id,
          version: "1.0.0",
          manifestSchema: 1,
          manifest: {
            schemaVersion: 1,
            key: m.key,
            name: m.name,
            version: "1.0.0",
            runtimeType: "CORE_MODULE",
            core: true,
          },
          compatibilityRange: ">=1.0.0 <2.0.0",
          lifecycleStatus: "PUBLISHED",
          releaseNotes: "Wattaman core module.",
          publishedAt: new Date(),
        },
      });
    }
    this.logger.log(
      `Core extension registry seeded (${MODULE_REGISTRY.length} entries checked).`,
    );
  }
}
