import { ExtensionCleanupService } from './extension-cleanup.service';

describe('ExtensionCleanupService', () => {
  const prisma = {
    extensionInstallation: { findMany: jest.fn(), deleteMany: jest.fn() },
    extensionVersion: { findMany: jest.fn(), update: jest.fn() },
  };
  const storage = { deletePrivate: jest.fn() };
  const service = new ExtensionCleanupService(prisma as any, storage as any);

  beforeEach(() => jest.clearAllMocks());

  it('purges expired uninstall records and unreferenced rejected packages', async () => {
    prisma.extensionInstallation.findMany.mockResolvedValue([{ id: 'installation-1' }]);
    prisma.extensionInstallation.deleteMany.mockResolvedValue({ count: 1 });
    prisma.extensionVersion.findMany.mockResolvedValue([{ id: 'version-1', packageStorageKey: 'quarantine/version-1.zip' }]);
    prisma.extensionVersion.update.mockResolvedValue({});
    storage.deletePrivate.mockResolvedValue(undefined);

    const result = await service.run();

    expect(prisma.extensionInstallation.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['installation-1'] } } });
    expect(storage.deletePrivate).toHaveBeenCalledWith('quarantine/version-1.zip');
    expect(prisma.extensionVersion.update).toHaveBeenCalledWith({ where: { id: 'version-1' }, data: { packageStorageKey: null } });
    expect(result).toEqual({ installations: 1, packages: 1 });
  });

  it('keeps package metadata when R2 deletion fails', async () => {
    prisma.extensionInstallation.findMany.mockResolvedValue([]);
    prisma.extensionVersion.findMany.mockResolvedValue([{ id: 'version-1', packageStorageKey: 'quarantine/version-1.zip' }]);
    storage.deletePrivate.mockRejectedValue(new Error('R2 unavailable'));

    const result = await service.run();

    expect(prisma.extensionVersion.update).not.toHaveBeenCalled();
    expect(result.packages).toBe(0);
  });
});
