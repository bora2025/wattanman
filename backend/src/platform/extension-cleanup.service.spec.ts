import { ExtensionCleanupService } from './extension-cleanup.service';

describe('ExtensionCleanupService', () => {
  const prisma = {
    $transaction: jest.fn(),
    extensionInstallation: { findMany: jest.fn(), deleteMany: jest.fn() },
    extensionRecord: { deleteMany: jest.fn() },
    extensionVersion: { findMany: jest.fn(), update: jest.fn() },
  };
  const storage = { deletePrivate: jest.fn() };
  const schedules = { acquire: jest.fn().mockResolvedValue(true) };
  const service = new ExtensionCleanupService(prisma as any, storage as any, schedules as any);

  beforeEach(() => {
    jest.clearAllMocks();
    schedules.acquire.mockResolvedValue(true);
    prisma.$transaction.mockImplementation((callback) => callback(prisma));
  });

  it('purges expired uninstall records and unreferenced rejected packages', async () => {
    prisma.extensionInstallation.findMany.mockResolvedValue([{ id: 'installation-1', schoolId: 'school-a', extensionId: 'extension-1' }]);
    prisma.extensionInstallation.deleteMany.mockResolvedValue({ count: 1 });
    prisma.extensionVersion.findMany.mockResolvedValue([{ id: 'version-1', packageStorageKey: 'quarantine/version-1.zip' }]);
    prisma.extensionVersion.update.mockResolvedValue({});
    storage.deletePrivate.mockResolvedValue(undefined);

    const result = await service.run();

    expect(prisma.extensionInstallation.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['installation-1'] } } });
    expect(prisma.extensionRecord.deleteMany).toHaveBeenCalledWith({ where: { schoolId: 'school-a', extensionId: 'extension-1' } });
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
