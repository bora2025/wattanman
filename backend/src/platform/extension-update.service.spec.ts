import { ExtensionUpdateService } from './extension-update.service';

describe('ExtensionUpdateService', () => {
  const prisma = {
    extensionInstallation: { findMany: jest.fn(), update: jest.fn() },
  };
  const installations = { upgrade: jest.fn() };
  const schedules = { acquire: jest.fn().mockResolvedValue(true) };
  const service = new ExtensionUpdateService(prisma as any, installations as any, schedules as any);
  const candidate = {
    id: 'installation-1', schoolId: 'school-a', installedVersionId: 'version-1', updatePolicy: 'NOTIFY', availableVersionId: null, updateNotifiedAt: null,
    installedVersion: { manifest: { permissions: ['rewards:read'] } },
    extension: { name: 'Rewards', versions: [{ id: 'version-2', version: '2.0.0', manifest: { permissions: ['rewards:read'] } }] },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    schedules.acquire.mockResolvedValue(true);
    prisma.extensionInstallation.update.mockResolvedValue({});
    installations.upgrade.mockResolvedValue({});
  });

  it('notifies school admins once when a new version becomes available', async () => {
    prisma.extensionInstallation.findMany.mockResolvedValue([candidate]);

    const result = await service.run();

    expect(result).toEqual({ upgraded: 0, notified: 1 });
    expect(prisma.extensionInstallation.update).toHaveBeenCalledWith({
      where: { id: 'installation-1' },
      data: expect.objectContaining({ availableVersionId: 'version-2', updateNotifiedAt: expect.any(Date) }),
    });
  });

  it('automatically upgrades only when no permissions are added', async () => {
    prisma.extensionInstallation.findMany.mockResolvedValue([{ ...candidate, updatePolicy: 'AUTO_APPROVED' }]);

    const result = await service.run();

    expect(result.upgraded).toBe(1);
    expect(installations.upgrade).toHaveBeenCalledWith('installation-1', 'version-2', expect.objectContaining({ role: 'SYSTEM' }), false);
    expect(prisma.extensionInstallation.update).not.toHaveBeenCalled();
  });

  it('requires notification and manual approval when an automatic update adds permissions', async () => {
    prisma.extensionInstallation.findMany.mockResolvedValue([{
      ...candidate,
      updatePolicy: 'AUTO_APPROVED',
      extension: { ...candidate.extension, versions: [{ id: 'version-2', version: '2.0.0', manifest: { permissions: ['rewards:read', 'rewards:write'] } }] },
    }]);

    const result = await service.run();

    expect(result).toEqual({ upgraded: 0, notified: 1 });
    expect(installations.upgrade).not.toHaveBeenCalled();
    expect(prisma.extensionInstallation.update).toHaveBeenCalledWith({
      where: { id: 'installation-1' },
      data: expect.objectContaining({ availableVersionId: 'version-2', updateNotifiedAt: expect.any(Date) }),
    });
  });
});
