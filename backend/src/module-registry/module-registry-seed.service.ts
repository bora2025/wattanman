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
      const versionNumber = "version" in m ? m.version : "1.0.0";
      const extension = await this.prisma.extension.upsert({
        where: { key: m.key },
        update: {
          name: m.name,
          description: m.description,
          category: m.category,
          runtimeType: "CORE_MODULE",
          commercialType: "MODULE",
          publisher: "WATTAMAN",
          publisherId: publisher.id,
          status: "ACTIVE",
          isListed: true,
          visibility: "LISTED",
        },
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
      const version = await this.prisma.extensionVersion.upsert({
        where: {
          extensionId_version: {
            extensionId: extension.id,
            version: versionNumber,
          },
        },
        update: {},
        create: {
          extensionId: extension.id,
          version: versionNumber,
          manifestSchema: 1,
          manifest: this.manifest(m, versionNumber),
          compatibilityRange: ">=1.0.0 <2.0.0",
          lifecycleStatus: "PUBLISHED",
          releaseNotes:
            "releaseNotes" in m ? m.releaseNotes : "Wattaman core module.",
          publishedAt: new Date(),
        },
      });
      await this.prisma.extensionInstallation.updateMany({
        where: {
          extensionId: extension.id,
          installedVersionId: { not: version.id },
          uninstalledAt: null,
        },
        data: { availableVersionId: version.id },
      });
    }
    this.logger.log(
      `Core extension registry seeded (${MODULE_REGISTRY.length} entries checked).`,
    );
  }

  private manifest(
    module: (typeof MODULE_REGISTRY)[number],
    version: string,
  ) {
    return {
      schemaVersion: 1,
      key: module.key,
      name: module.name,
      version,
      runtimeType: "CORE_MODULE",
      core: true,
      managementPath: "managementPath" in module ? module.managementPath : undefined,
      capabilities: "capabilities" in module ? module.capabilities : [],
      sharedCapabilities:
        "sharedCapabilities" in module ? module.sharedCapabilities : [],
      dependencies: "dependencies" in module ? module.dependencies : [],
    };
  }
}
