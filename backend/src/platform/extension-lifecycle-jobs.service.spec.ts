import { ConflictException } from '@nestjs/common';
import { tenantContext } from '../tenancy/tenant-context';
import { ExtensionLifecycleJobsService } from './extension-lifecycle-jobs.service';

describe('ExtensionLifecycleJobsService', () => {
  const prisma = {
    extension: { findUnique: jest.fn() },
    extensionInstallation: { findUnique: jest.fn() },
    extensionLifecycleJob: {
      findUnique: jest.fn(), create: jest.fn(), delete: jest.fn(), update: jest.fn(), updateMany: jest.fn(),
    },
  };
  const queues = { enqueue: jest.fn() };
  const locks = { run: jest.fn((_resource, operation) => operation()) };
  const installations = {
    install: jest.fn(), upgrade: jest.fn(), rollback: jest.fn(), activate: jest.fn(), uninstall: jest.fn(), removeUninstalled: jest.fn(),
  };
  const extensions = { deleteExtension: jest.fn() };
  const service = new ExtensionLifecycleJobsService(prisma as any, queues as any, locks as any, installations as any, extensions as any);
  const actor = { userId: 'admin-1', role: 'PLATFORM_ADMIN', name: 'Admin' };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.extensionInstallation.findUnique.mockResolvedValue({ schoolId: 'school-a', extensionId: 'extension-1', configuration: {} });
    prisma.extensionLifecycleJob.findUnique.mockResolvedValue(null);
    prisma.extensionLifecycleJob.create.mockImplementation(({ data }) => Promise.resolve({ id: 'job-1', status: 'QUEUED', ...data }));
    prisma.extensionLifecycleJob.updateMany.mockResolvedValue({ count: 1 });
    prisma.extensionLifecycleJob.update.mockImplementation(({ data }) => Promise.resolve({ id: 'job-1', ...data }));
    queues.enqueue.mockResolvedValue({ id: 'queue-job-1' });
  });

  it('persists a tenant command before enqueueing the stable queue identity', async () => {
    const result = await tenantContext.run({ schoolId: 'platform-school', mode: 'unscoped' }, () =>
      service.submitInstallation('installation-1', 'INSTALL', { versionId: 'version-1' }, actor, 'request-key-123'),
    );

    expect(result).toEqual(expect.objectContaining({ id: 'job-1', command: 'INSTALL', schoolId: 'school-a' }));
    expect(prisma.extensionLifecycleJob.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      schoolId: 'school-a', extensionId: 'extension-1', installationId: 'installation-1', idempotencyKey: 'request-key-123',
    }) });
    expect(queues.enqueue).toHaveBeenCalledWith('extensions', expect.objectContaining({
      type: 'extension.lifecycle.execute', idempotencyKey: 'extension-lifecycle:job-1', payload: { jobId: 'job-1' },
    }));
  });

  it('replays the same durable command and rejects payload-changing key reuse', async () => {
    prisma.extensionLifecycleJob.findUnique.mockResolvedValue({
      id: 'job-1', command: 'INSTALL', payload: { versionId: 'version-1' }, status: 'QUEUED',
    });
    await expect(tenantContext.run({ schoolId: 'platform-school', mode: 'unscoped' }, () =>
      service.submitInstallation('installation-1', 'INSTALL', { versionId: 'version-1' }, actor, 'request-key-123'),
    )).resolves.toEqual(expect.objectContaining({ id: 'job-1' }));
    expect(queues.enqueue).not.toHaveBeenCalled();

    await expect(tenantContext.run({ schoolId: 'platform-school', mode: 'unscoped' }, () =>
      service.submitInstallation('installation-1', 'INSTALL', { versionId: 'version-2' }, actor, 'request-key-123'),
    )).rejects.toBeInstanceOf(ConflictException);
  });

  it('executes under the canonical lock and records terminal success', async () => {
    prisma.extensionLifecycleJob.findUnique.mockResolvedValue({
      id: 'job-1', schoolId: 'school-a', extensionId: 'extension-1', installationId: 'installation-1',
      command: 'INSTALL', status: 'QUEUED', payload: { versionId: 'version-1' },
      actorId: 'admin-1', actorRole: 'PLATFORM_ADMIN', actorName: 'Admin', actorEmail: null,
    });
    installations.install.mockResolvedValue({ id: 'installation-1', lifecycleState: 'INSTALLED' });

    await expect(service.execute('job-1', 1)).resolves.toEqual(expect.objectContaining({ lifecycleState: 'INSTALLED' }));
    expect(locks.run).toHaveBeenCalledWith('school:school-a:extension:extension-1', expect.any(Function));
    expect(prisma.extensionLifecycleJob.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'job-1' }, data: expect.objectContaining({ status: 'SUCCEEDED', completedAt: expect.any(Date) }),
    }));
  });

  it('records retryable failure details', async () => {
    prisma.extensionLifecycleJob.findUnique.mockResolvedValue({
      id: 'job-1', schoolId: 'school-a', extensionId: 'extension-1', installationId: 'installation-1',
      command: 'UNINSTALL', status: 'QUEUED', payload: {}, actorId: 'admin-1', actorRole: 'PLATFORM_ADMIN', actorName: null, actorEmail: null,
    });
    installations.uninstall.mockRejectedValue(new Error('R2 unavailable'));

    await expect(service.execute('job-1', 2)).rejects.toThrow('R2 unavailable');
    expect(prisma.extensionLifecycleJob.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'FAILED', errorCode: 'Error', errorMessage: 'R2 unavailable' }),
    }));
  });
});
