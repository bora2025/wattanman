import { PrismaClient } from '@prisma/client';
import { verifyExtensionBackfill } from './verify-extension-backfill';

const prisma = new PrismaClient();

function runtimeType(kind: string): string {
  return kind === 'THEME' ? 'THEME' : 'CORE_MODULE';
}

async function main() {
  const publisher = await prisma.extensionPublisher.upsert({
    where: { key: 'WATTAMAN' },
    update: {},
    create: { key: 'WATTAMAN', name: 'Wattaman', status: 'ACTIVE', internal: true },
  });
  const definitions = await prisma.addonDefinition.findMany({ orderBy: { createdAt: 'asc' } });
  let extensionCount = 0;
  let installationCount = 0;

  for (const definition of definitions) {
    const extension = await prisma.extension.upsert({
      where: { key: definition.key },
      update: { legacyAddonKey: definition.key },
      create: {
        key: definition.key,
        name: definition.name,
        description: definition.description,
        runtimeType: runtimeType(definition.kind),
        commercialType: definition.kind,
        category: definition.category,
        publisher: 'WATTAMAN',
        publisherId: publisher.id,
        status: definition.isActive ? 'ACTIVE' : 'RETIRED',
        isListed: definition.isActive,
        legacyAddonKey: definition.key,
      },
    });
    extensionCount += 1;

    const version = await prisma.extensionVersion.upsert({
      where: { extensionId_version: { extensionId: extension.id, version: '1.0.0' } },
      update: {},
      create: {
        extensionId: extension.id,
        version: '1.0.0',
        manifestSchema: 1,
        manifest: {
          schemaVersion: 1,
          key: definition.key,
          name: definition.name,
          version: '1.0.0',
          runtimeType: runtimeType(definition.kind),
          legacy: true,
          ...(definition.kind === 'THEME' ? { tokens: definition.themeConfig } : {}),
        },
        lifecycleStatus: definition.isActive ? 'PUBLISHED' : 'RETIRED',
        releaseNotes: 'Backfilled from the legacy Add-ons Directory.',
        publishedAt: definition.isActive ? definition.createdAt : null,
      },
    });

    const schoolAddons = await prisma.schoolAddon.findMany({ where: { addonKey: definition.key } });
    for (const legacyInstallation of schoolAddons) {
      await prisma.extensionInstallation.upsert({
        where: { schoolId_extensionId: { schoolId: legacyInstallation.schoolId, extensionId: extension.id } },
        update: {},
        create: {
          schoolId: legacyInstallation.schoolId,
          extensionId: extension.id,
          installedVersionId: version.id,
          enabled: legacyInstallation.enabled,
          billingStatus: legacyInstallation.billingStatus,
          requestedBy: legacyInstallation.requestedBy,
          requestedAt: legacyInstallation.requestedAt,
          approvedBy: legacyInstallation.activatedBy,
          approvedAt: legacyInstallation.activatedAt,
          installedBy: legacyInstallation.activatedBy,
          installedAt: legacyInstallation.activatedAt || legacyInstallation.createdAt,
        },
      });
      installationCount += 1;
    }
  }

  console.log(`Extension backfill complete: ${extensionCount} extensions, ${installationCount} installations checked.`);
  const verification = await verifyExtensionBackfill(prisma);
  console.log(JSON.stringify(verification, null, 2));
  if (!verification.valid) throw new Error(`Extension backfill verification failed with ${verification.errors.length} mismatch(es)`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
