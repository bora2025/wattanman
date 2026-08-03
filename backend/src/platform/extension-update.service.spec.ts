import { ExtensionUpdateService } from './extension-update.service';

describe('ExtensionUpdateService', () => {
  const prisma = {
    extensionInstallation: { findMany: jest.fn(), update: jest.fn() },
    user: { findMany: jest.fn() },
    notification: { createMany: jest.fn() },
  };
  const installations = { upgrade: jest.fn() };
  const service = new ExtensionUpdateService(prisma as any, installations as any);
  const candidate = {
    id: 'installation-1', schoolId: 'school-a', installedVersionId: 'version-1', updatePolicy: 'NOTIFY', availableVersionId: null, updateNotifiedAt: null,
    installedVersion: { manifest: { permissions: ['rewards:read'] } },
    extension: { name: 'Rewards', versions: [{ id: 'version-2', version: '2.0.0', manifest: { permissions: ['rewards:read'] } }] },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.extensionInstallation.update.mockResolvedValue({});
    prisma.user.findMany.mockResolvedValue([{ id: 'admin-1' }]);
    prisma.notification.createMany.mockResolvedValue({ count: 1 });
    installations.upgrade.mockResolvedValue({});
  });

  it('notifies school admins once when a new version becomes available', async () => {
    prisma.extensionInstallation.findMany.mockResolvedValue([candidate]);

    const result = await service.run();

    expect(result).toEqual({ upgraded: 0, notified: 1 });
    expect(prisma.notification.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ schoolId: 'school-a', userId: 'admin-1', type: 'EXTENSION_UPDATE' })],
    });
  });

  it('automatically upgrades only when no permissions are added', async () => {
    prisma.extensionInstallation.findMany.mockResolvedValue([{ ...candidate, updatePolicy: 'AUTO_APPROVED' }]);

    const result = await service.run();

    expect(result.upgraded).toBe(1);
    expect(installations.upgrade).toHaveBeenCalledWith('installation-1', 'version-2', expect.objectContaining({ role: 'SYSTEM' }), false);
    expect(prisma.notification.createMany).not.toHaveBeenCalled();
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
    expect(prisma.notification.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ message: expect.stringContaining('rewards:write') })],
    });
  });
});
