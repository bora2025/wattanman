import { tenantContext } from '../tenancy/tenant-context';
import { BackupService } from './backup.service';

describe('BackupService asynchronous exports', () => {
  const prisma: any = {
    backupExport: {
      upsert: jest.fn(),
      update: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    backupRestoreRequest: { upsert: jest.fn(), update: jest.fn(), updateMany: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
  };
  const queues: any = { enqueue: jest.fn() };
  const storage: any = { putPrivateImmutable: jest.fn(), presignPrivateDownload: jest.fn(), getPrivate: jest.fn() };
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

  it('verifies an immutable tenant-owned snapshot without live writes', async () => {
    const body = Buffer.from(JSON.stringify({ version: 2, models: ['Post'], data: { Post: [{ id: 'post-1', schoolId: 'school-1' }] } }));
    const checksum = require('crypto').createHash('sha256').update(body).digest('hex');
    prisma.backupRestoreRequest.findUnique.mockResolvedValue({ id: 'restore-1', exportId: 'export-1', schoolId: 'school-1', status: 'PENDING_VERIFICATION' });
    prisma.backupExport.findFirst.mockResolvedValue({ id: 'export-1', schoolId: 'school-1', status: 'AVAILABLE', storageKey: 'backup.json', checksum });
    prisma.backupRestoreRequest.update.mockImplementation(({ data }: any) => Promise.resolve({ id: 'restore-1', ...data }));
    storage.getPrivate.mockResolvedValue(body);
    const result = await service.verifyRestore('restore-1', 1);
    expect(result.status).toBe('VERIFIED');
    expect(result.verificationReport).toEqual(expect.objectContaining({ rowCount: 1, verifiedSchoolId: 'school-1', isolation: 'READ_ONLY_WORKER' }));
    expect(prisma.$transaction).toBeUndefined();
  });

  it('rejects a snapshot containing another school tenant ID', async () => {
    const body = Buffer.from(JSON.stringify({ version: 2, models: ['Post'], data: { Post: [{ id: 'post-2', schoolId: 'school-2' }] } }));
    const checksum = require('crypto').createHash('sha256').update(body).digest('hex');
    prisma.backupRestoreRequest.findUnique.mockResolvedValue({ id: 'restore-2', exportId: 'export-2', schoolId: 'school-1', status: 'PENDING_VERIFICATION' });
    prisma.backupExport.findFirst.mockResolvedValue({ storageKey: 'backup.json', checksum, status: 'AVAILABLE' });
    prisma.backupRestoreRequest.update.mockImplementation(({ data }: any) => Promise.resolve(data));
    storage.getPrivate.mockResolvedValue(body);
    await expect(service.verifyRestore('restore-2', 1)).rejects.toThrow('foreign tenant data');
    expect(prisma.backupRestoreRequest.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'REJECTED' }) }));
  });

  it('requires independent platform approval after verification', async () => {
    prisma.backupRestoreRequest.findUnique.mockResolvedValue({ id: 'restore-1', schoolId: 'school-1', status: 'VERIFIED', requestedBy: 'admin-1' });
    prisma.backupRestoreRequest.updateMany.mockResolvedValue({ count: 1 });
    const approved = await tenantContext.run({ schoolId: 'PLATFORM', mode: 'unscoped' }, () => service.approveRestore('restore-1', 'Verified recovery ticket INC-42', { userId: 'platform-2', role: 'PLATFORM_ADMIN' }));
    expect(prisma.backupRestoreRequest.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'restore-1', status: 'VERIFIED' }, data: expect.objectContaining({ status: 'APPROVED', approvedBy: 'platform-2' }) }));
    expect(approved.status).toBe('VERIFIED');
  });
});
