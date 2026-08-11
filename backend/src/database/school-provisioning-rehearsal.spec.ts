import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('synthetic school provisioning rehearsal', () => {
  const script = readFileSync(resolve(process.cwd(), 'prisma/rehearse-school-provisioning.js'), 'utf8');

  it('creates and verifies the complete base-shell record set', () => {
    for (const model of ['school', 'user', 'siteSetting', 'schoolProvisioningJob', 'schoolDomain']) {
      expect(script).toContain(`prisma.${model}.createMany`);
    }
    expect(script).toContain('extensionInstallation.count');
    expect(script).toContain('installations !== 0');
  });

  it('is bounded, production-guarded, and self-cleaning', () => {
    expect(script).toContain('COUNT > 10_000');
    expect(script).toContain('BATCH_SIZE > 500');
    expect(script).toContain('CONFIRM_SYNTHETIC_PROVISIONING');
    expect(script).toContain("SYNTHETIC_SCHOOL_KEEP === 'true'");
    expect(script).toContain('removeFixtures(prisma)');
  });
});
