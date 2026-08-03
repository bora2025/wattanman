import { BadRequestException } from '@nestjs/common';
import { ExtensionAlertService } from './extension-alert.service';

describe('ExtensionAlertService', () => {
  const prisma = {
    extensionValidation: { groupBy: jest.fn() },
    auditLog: { groupBy: jest.fn() },
    extensionVersion: { findUnique: jest.fn() },
    extension: { findUnique: jest.fn() },
    extensionAlert: { upsert: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  };
  const service = new ExtensionAlertService(prisma as any);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.extensionValidation.groupBy.mockResolvedValue([]);
    prisma.auditLog.groupBy.mockResolvedValue([]);
    prisma.extensionAlert.upsert.mockResolvedValue({});
  });

  it('raises an alert after repeated validation failures', async () => {
    prisma.extensionValidation.groupBy.mockResolvedValue([{ extensionVersionId: 'version-1', _count: { _all: 3 } }]);
    prisma.extensionVersion.findUnique.mockResolvedValue({ id: 'version-1', version: '1.0.0', extension: { id: 'extension-1', key: 'REWARDS', name: 'Rewards' } });

    await expect(service.scan()).resolves.toEqual({ raised: 1 });
    expect(prisma.extensionAlert.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { fingerprint: 'VALIDATION_FAILURE:version-1' },
      create: expect.objectContaining({ type: 'VALIDATION_FAILURE', occurrences: 3 }),
    }));
  });

  it('raises an alert after suspicious denied capabilities', async () => {
    prisma.auditLog.groupBy.mockResolvedValue([{ schoolId: 'school-1', resourceId: 'REWARDS', _count: { _all: 5 } }]);
    prisma.extension.findUnique.mockResolvedValue({ id: 'extension-1', key: 'REWARDS', name: 'Rewards' });

    await expect(service.scan()).resolves.toEqual({ raised: 1 });
    expect(prisma.extensionAlert.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { fingerprint: 'CAPABILITY_DENIED:school-1:REWARDS' },
      create: expect.objectContaining({ schoolId: 'school-1', type: 'CAPABILITY_DENIED' }),
    }));
  });

  it('validates operator status transitions', async () => {
    await expect(service.setStatus('alert-1', 'OPEN', 'admin-1')).rejects.toBeInstanceOf(BadRequestException);
    prisma.extensionAlert.update.mockResolvedValue({ id: 'alert-1', status: 'RESOLVED' });
    await service.setStatus('alert-1', 'RESOLVED', 'admin-1');
    expect(prisma.extensionAlert.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ resolvedBy: 'admin-1' }) }));
  });
});
