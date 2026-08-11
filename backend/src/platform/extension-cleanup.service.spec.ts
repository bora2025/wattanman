import { ExtensionCleanupService } from './extension-cleanup.service';

describe('ExtensionCleanupService', () => {
  const prisma = {
    $transaction: jest.fn(),
    extensionInstallation: { findMany: jest.fn(), deleteMany: jest.fn() },
    extensionRecord: { deleteMany: jest.fn() },
    extensionVersion: { findMany: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    extensionValidation: { updateMany: jest.fn() },
    extensionAsset: { deleteMany: jest.fn() },
  };
  const storage = { deletePrivate: jest.fn() };
  const schedules = { acquire: jest.fn().mockResolvedValue(true) };
  const service = new ExtensionCleanupService(prisma as any, storage as any, schedules as any);

  beforeEach(() => {
    jest.clearAllMocks();
    schedules.acquire.mockResolvedValue(true);
    prisma.$transaction.mockImplementation((callback) => callback(prisma));
    prisma.extensionVersion.findMany.mockResolvedValue([]);
    prisma.extensionVersion.updateMany.mockResolvedValue({ count: 1 });
  });

  it('purges expired uninstall records and unreferenced rejected packages', async () => {
    prisma.extensionInstallation.findMany.mockResolvedValue([{ id: 'installation-1', schoolId: 'school-a', extensionId: 'extension-1' }]);
    prisma.extensionInstallation.deleteMany.mockResolvedValue({ count: 1 });
    prisma.extensionVersion.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'version-1', packageStorageKey: 'quarantine/version-1.zip', assets: [{ storageKey: 'assets/version-1/style.css' }] }]);
    prisma.extensionVersion.update.mockResolvedValue({});
    storage.deletePrivate.mockResolvedValue(undefined);

    const result = await service.run();

    expect(prisma.extensionInstallation.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['installation-1'] } } });
    expect(prisma.extensionRecord.deleteMany).toHaveBeenCalledWith({ where: { schoolId: 'school-a', extensionId: 'extension-1' } });
    expect(storage.deletePrivate).toHaveBeenCalledWith('quarantine/version-1.zip');
    expect(storage.deletePrivate).toHaveBeenCalledWith('assets/version-1/style.css');
    expect(prisma.extensionAsset.deleteMany).toHaveBeenCalledWith({ where: { extensionVersionId: 'version-1' } });
    expect(prisma.extensionVersion.update).toHaveBeenCalledWith({ where: { id: 'version-1' }, data: { packageStorageKey: null } });
    expect(result).toEqual({ installations: 1, quarantines: 0, packages: 1 });
  });

  it('expires abandoned quarantines while preserving their validation audit trail', async () => {
    prisma.extensionInstallation.findMany.mockResolvedValue([]);
    prisma.extensionVersion.findMany
      .mockResolvedValueOnce([{ id: 'version-stale', packageStorageKey: 'quarantine/stale.zip', assets: [] }])
      .mockResolvedValueOnce([]);

    const result = await service.run();

    expect(prisma.extensionVersion.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'version-stale', lifecycleStatus: { in: ['QUARANTINED', 'VALIDATING'] } }),
      data: expect.objectContaining({ lifecycleStatus: 'REJECTED' }),
    }));
    expect(prisma.extensionValidation.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { extensionVersionId: 'version-stale', status: { in: ['PENDING', 'RUNNING'] } },
      data: expect.objectContaining({ status: 'FAILED', errors: [expect.objectContaining({ code: 'QUARANTINE_RETENTION_EXPIRED' })] }),
    }));
    expect(storage.deletePrivate).not.toHaveBeenCalled();
    expect(result).toEqual({ installations: 0, quarantines: 1, packages: 0 });
  });

  it('keeps package metadata when R2 deletion fails', async () => {
    prisma.extensionInstallation.findMany.mockResolvedValue([]);
    prisma.extensionVersion.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 'version-1', packageStorageKey: 'quarantine/version-1.zip', assets: [] }]);
    storage.deletePrivate.mockRejectedValue(new Error('R2 unavailable'));

    const result = await service.run();

    expect(prisma.extensionVersion.update).not.toHaveBeenCalled();
    expect(result.packages).toBe(0);
  });

  it('uses separate bounded updated-at policies and never auto-purges retired releases', async () => {
    prisma.extensionInstallation.findMany.mockResolvedValue([]);

    await service.run();

    expect(prisma.extensionVersion.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: expect.objectContaining({ lifecycleStatus: { in: ['QUARANTINED', 'VALIDATING'] }, updatedAt: expect.any(Object) }),
      take: 100,
    }));
    expect(prisma.extensionVersion.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: expect.objectContaining({ lifecycleStatus: 'REJECTED', updatedAt: expect.any(Object) }),
      take: 100,
    }));
  });
});
