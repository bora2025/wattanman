import { HttpException, ServiceUnavailableException } from '@nestjs/common';
import { ExtensionResourceGovernorService } from './extension-resource-governor.service';

describe('ExtensionResourceGovernorService', () => {
  const original = process.env;
  const prisma = { extensionAlert: { upsert: jest.fn() } };

  beforeEach(() => {
    process.env = { ...original, NODE_ENV: 'test', REDIS_URL: '' };
    jest.clearAllMocks();
    prisma.extensionAlert.upsert.mockResolvedValue({});
  });

  afterEach(() => { process.env = original; });

  it('enforces distributed-equivalent school request quotas and records noisy neighbors', async () => {
    process.env.EXTENSION_SCHOOL_REQUESTS_PER_MINUTE = '60';
    const service = new ExtensionResourceGovernorService(prisma as any);
    for (let index = 0; index < 60; index += 1) {
      const release = await service.enterRequest('school-a', 'REWARDS');
      await release();
    }

    await expect(service.enterRequest('school-a', 'REWARDS')).rejects.toBeInstanceOf(HttpException);
    expect(prisma.extensionAlert.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ type: 'RESOURCE_QUOTA', schoolId: 'school-a' }),
    }));
  });

  it('releases concurrency reservations after a request', async () => {
    process.env.EXTENSION_SCHOOL_CONCURRENCY = '1';
    const service = new ExtensionResourceGovernorService(prisma as any);
    const release = await service.enterRequest('school-a', 'REWARDS');

    await expect(service.enterRequest('school-a', 'REWARDS')).rejects.toBeInstanceOf(ServiceUnavailableException);
    await release();
    const secondRelease = await service.enterRequest('school-a', 'REWARDS');
    await secondRelease();
  });

  it('bounds export size and export frequency independently', async () => {
    process.env.EXTENSION_EXPORT_RECORD_LIMIT = '5';
    process.env.EXTENSION_SCHOOL_EXPORTS_PER_HOUR = '1';
    const service = new ExtensionResourceGovernorService(prisma as any);

    await expect(service.consumeExport('school-a', 'REWARDS', 6)).rejects.toThrow('5 record limit');
    await service.consumeExport('school-a', 'REWARDS', 5);
    await expect(service.consumeExport('school-a', 'REWARDS', 5)).rejects.toBeInstanceOf(HttpException);
  });
});
