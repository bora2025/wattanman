import { tenantContext } from '../tenancy/tenant-context';
import { BackupService } from './backup.service';

describe('BackupService asynchronous exports', () => {
  const prisma: any = {
    backupExport: {
      upsert: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
  };
  const queues: any = { enqueue: jest.fn() };
  const storage: any = { putPrivateImmutable: jest.fn(), presignPrivateDownload: jest.fn() };
  const audit: any = { log: jest.fn() };
  const service = new BackupService(prisma, queues, storage, audit);

  beforeEach(() => jest.clearAllMocks());

  it('creates one tenant-scoped idempotent export job', async () => {
    const record = { id: 'export-1', schoolId: 'school-1', requestKey: 'request-1', status: 'PENDING' };
    prisma.backupExport.upsert.mockResolvedValue(record);
    prisma.backupExport.findUnique.mockResolvedValue(record);
    await tenantContext.run({ schoolId: 'school-1', mode: 'scoped' }, () =>
      service.requestExport({ userId: 'admin-1', role: 'ADMIN' }, 'request-1'),
    );
    expect(prisma.backupExport.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { schoolId_requestKey: { schoolId: 'school-1', requestKey: 'request-1' } },
    }));
    expect(queues.enqueue).toHaveBeenCalledWith('operations', expect.objectContaining({
      tenant: { mode: 'SCOPED', schoolId: 'school-1' },
      idempotencyKey: 'backup-export:export-1',
    }));
  });

  it('returns only a five-minute private download after completion', async () => {
    prisma.backupExport.findUnique.mockResolvedValue({
      id: 'export-1', status: 'AVAILABLE', storageKey: 'backups/schools/school-1/checksum/export-1.json',
      checksum: 'a'.repeat(64), byteSize: 100, expiresAt: new Date(Date.now() + 60_000),
    });
    storage.presignPrivateDownload.mockReturnValue({ url: 'https://private.test', expiresAt: 'soon' });
    const result = await service.downloadExport('export-1', { userId: 'admin-1', role: 'ADMIN' });
    expect(storage.presignPrivateDownload).toHaveBeenCalledWith(expect.stringContaining('/school-1/'), 300);
    expect(result.download.url).toBe('https://private.test');
  });

  it('writes a checksum-addressed immutable snapshot', async () => {
    prisma.backupExport.findUnique.mockResolvedValue({ id: 'export-1', schoolId: 'school-1', status: 'PENDING' });
    prisma.backupExport.update.mockImplementation(({ data }: any) => Promise.resolve({ id: 'export-1', ...data }));
    jest.spyOn(service, 'exportAll').mockResolvedValue({ version: 2, exportedAt: '2026-08-13T00:00:00.000Z', models: [], data: {} });
    await service.executeExport('export-1', 1);
    expect(storage.putPrivateImmutable).toHaveBeenCalledWith(
      expect.stringMatching(/^backups\/schools\/school-1\/[a-f0-9]{64}\/export-1\.json$/),
      expect.any(Buffer), 'application/json', expect.stringMatching(/^[a-f0-9]{64}$/),
    );
    expect(prisma.backupExport.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'AVAILABLE' }) }));
  });
});
