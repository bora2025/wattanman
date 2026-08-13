import { ForbiddenException } from '@nestjs/common';
import { ExtensionControlService } from './extension-control.service';

describe('ExtensionControlService', () => {
  const prisma = {
    extensionKillSwitch: { findMany: jest.fn(), findFirst: jest.fn(), upsert: jest.fn() },
    extensionPublisher: { findUnique: jest.fn() }, extension: { findUnique: jest.fn() },
    extensionVersion: { findUnique: jest.fn() }, school: { findUnique: jest.fn() },
  };
  const audit = { log: jest.fn() };
  const service = new ExtensionControlService(prisma as any, audit as any);
  const actor = { userId: 'operator-1', role: 'PLATFORM_ADMIN' };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.extension.findUnique.mockResolvedValue({ id: 'extension-1' });
    prisma.school.findUnique.mockResolvedValue({ id: 'school-a' });
    prisma.extensionKillSwitch.upsert.mockImplementation(({ create }) => Promise.resolve({ id: 'switch-1', ...create }));
    audit.log.mockResolvedValue(undefined);
  });

  it('activates and audits a capability kill switch', async () => {
    const result = await service.set({ scopeType: 'CAPABILITY', scopeId: 'extension-1', capability: 'rewards:write', reason: 'Incident containment' }, actor);
    expect(result).toEqual(expect.objectContaining({ active: true, capability: 'rewards:write' }));
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'KILL_SWITCH_ACTIVATE' }));
  });

  it('fails runtime access closed for any matching scope', async () => {
    prisma.extensionKillSwitch.findFirst.mockResolvedValue({ scopeType: 'SCHOOL', reason: 'School investigation' });
    await expect(service.assertAllowed({ schoolId: 'school-a', extensionId: 'extension-1', installedVersionId: 'version-1', extension: { publisherId: 'publisher-1' } }, 'rewards:read'))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.extensionKillSwitch.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ active: true, OR: expect.arrayContaining([
      { scopeType: 'PUBLISHER', scopeId: 'publisher-1' },
      { scopeType: 'EXTENSION', scopeId: 'extension-1' },
      { scopeType: 'VERSION', scopeId: 'version-1' },
      { scopeType: 'SCHOOL', scopeId: 'school-a' },
      { scopeType: 'CAPABILITY', scopeId: 'extension-1', capability: 'rewards:read' },
    ]) }) }));
  });
});
