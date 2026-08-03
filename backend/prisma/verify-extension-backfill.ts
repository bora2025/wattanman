import { PrismaClient } from '@prisma/client';

export interface ExtensionBackfillVerification {
  valid: boolean;
  definitionCount: number;
  legacyExtensionCount: number;
  schoolAddonCount: number;
  legacyInstallationCount: number;
  errors: string[];
}

function expectedRuntimeType(kind: string) {
  return kind === 'THEME' ? 'THEME' : 'CORE_MODULE';
}

export async function verifyExtensionBackfill(prisma: PrismaClient): Promise<ExtensionBackfillVerification> {
  const [definitions, extensions, schoolAddons, installations] = await Promise.all([
    prisma.addonDefinition.findMany({ select: { key: true, kind: true, isActive: true } }),
    prisma.extension.findMany({ where: { legacyAddonKey: { not: null } }, select: { id: true, key: true, legacyAddonKey: true, runtimeType: true, commercialType: true, status: true, isListed: true } }),
    prisma.schoolAddon.findMany({ select: { schoolId: true, addonKey: true, enabled: true, billingStatus: true } }),
    prisma.extensionInstallation.findMany({
      where: { extension: { legacyAddonKey: { not: null } } },
      select: { schoolId: true, enabled: true, billingStatus: true, extension: { select: { legacyAddonKey: true } } },
    }),
  ]);
  const errors: string[] = [];
  const extensionByLegacyKey = new Map(extensions.map((extension) => [extension.legacyAddonKey!, extension]));
  for (const definition of definitions) {
    const extension = extensionByLegacyKey.get(definition.key);
    if (!extension) {
      errors.push(`Missing Extension for AddonDefinition ${definition.key}`);
      continue;
    }
    if (extension.key !== definition.key) errors.push(`Extension key changed for ${definition.key}: ${extension.key}`);
    if (extension.runtimeType !== expectedRuntimeType(definition.kind)) errors.push(`Runtime type mismatch for ${definition.key}`);
    if (extension.commercialType !== definition.kind) errors.push(`Commercial type mismatch for ${definition.key}`);
    const expectedStatus = definition.isActive ? 'ACTIVE' : 'RETIRED';
    if (extension.status !== expectedStatus || extension.isListed !== definition.isActive) errors.push(`Catalog state mismatch for ${definition.key}`);
  }
  const installationBySchoolAndKey = new Map(installations.map((installation) => [
    `${installation.schoolId}:${installation.extension.legacyAddonKey}`,
    installation,
  ]));
  for (const legacy of schoolAddons) {
    const installation = installationBySchoolAndKey.get(`${legacy.schoolId}:${legacy.addonKey}`);
    if (!installation) {
      errors.push(`Missing ExtensionInstallation for ${legacy.schoolId}/${legacy.addonKey}`);
      continue;
    }
    if (installation.enabled !== legacy.enabled) errors.push(`Enabled state mismatch for ${legacy.schoolId}/${legacy.addonKey}`);
    if (installation.billingStatus !== legacy.billingStatus) errors.push(`Billing state mismatch for ${legacy.schoolId}/${legacy.addonKey}`);
  }
  if (extensions.length !== definitions.length) errors.push(`Legacy extension count mismatch: expected ${definitions.length}, found ${extensions.length}`);
  if (installations.length !== schoolAddons.length) errors.push(`Legacy installation count mismatch: expected ${schoolAddons.length}, found ${installations.length}`);
  return {
    valid: errors.length === 0,
    definitionCount: definitions.length,
    legacyExtensionCount: extensions.length,
    schoolAddonCount: schoolAddons.length,
    legacyInstallationCount: installations.length,
    errors,
  };
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const result = await verifyExtensionBackfill(prisma);
    console.log(JSON.stringify(result, null, 2));
    if (!result.valid) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
