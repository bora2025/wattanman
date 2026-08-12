import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { generateKeyPairSync, verify } from 'crypto';
import { ExtensionPurgeReportService } from './extension-purge-report.service';

describe('ExtensionPurgeReportService', () => {
  const prisma = { extensionPurgeReport: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() } };
  const storage = {
    putPrivate: jest.fn().mockResolvedValue(undefined),
    presignPrivateDownload: jest.fn().mockReturnValue({ url: 'https://r2.test/download', method: 'GET', headers: {}, expiresAt: new Date().toISOString() }),
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new ExtensionPurgeReportService(prisma as any, storage as any, audit as any);
  const actor = { userId: 'admin-1', role: 'PLATFORM_ADMIN', name: 'Admin' };

  const keys = generateKeyPairSync('ed25519');
  const privateKeyPem = keys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const publicKey = keys.publicKey;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.EXTENSION_PURGE_REPORT_KEY_ID = 'wattaman-purge-1';
    process.env.EXTENSION_PURGE_REPORT_PRIVATE_KEY_BASE64 = Buffer.from(privateKeyPem).toString('base64');
    prisma.extensionPurgeReport.create.mockImplementation(({ data }) => Promise.resolve({ id: 'report-1', ...data }));
  });

  afterAll(() => {
    delete process.env.EXTENSION_PURGE_REPORT_KEY_ID;
    delete process.env.EXTENSION_PURGE_REPORT_PRIVATE_KEY_BASE64;
  });

  it('signs a report that verifies standalone against the public key, with no DB access', async () => {
    const report = await service.record({
      schoolId: 'school-a', extensionId: 'extension-1', installationId: 'installation-1',
      scope: 'INSTALLATION', trigger: 'MANUAL', reason: 'Uninstall grace period elapsed', actor,
      dbSummary: { installations: 1, extensionRecords: 4 },
    });

    expect(storage.putPrivate).toHaveBeenCalledWith(
      expect.stringMatching(/^reports\/extensions\/purge\/school-a\/\d+-[a-f0-9]{12}\.json$/),
      expect.any(Buffer),
      'application/json',
    );
    const storedBody = JSON.parse((storage.putPrivate.mock.calls[0][1] as Buffer).toString());
    expect(storedBody.payload).toEqual(expect.objectContaining({
      schoolId: 'school-a', scope: 'INSTALLATION', trigger: 'MANUAL', dbSummary: { installations: 1, extensionRecords: 4 },
    }));
    const canonical = Buffer.from(JSON.stringify(storedBody.payload));
    expect(verify(null, canonical, publicKey, Buffer.from(storedBody.signature, 'base64'))).toBe(true);
    expect(report.reportChecksum).toHaveLength(64);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'PURGE_REPORT_GENERATED', resource: 'EXTENSION_PURGE_REPORT' }));
  });

  it('fails closed when signing is not configured', async () => {
    delete process.env.EXTENSION_PURGE_REPORT_KEY_ID;

    await expect(service.record({
      schoolId: 'school-a', scope: 'EXTENSION', trigger: 'SCHEDULED', dbSummary: {},
    })).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(storage.putPrivate).not.toHaveBeenCalled();
  });

  it('audits a signed download URL and 404s an unknown report', async () => {
    prisma.extensionPurgeReport.findUnique.mockResolvedValue({ storageKey: 'reports/extensions/purge/school-a/1.json', scope: 'INSTALLATION' });

    const result = await service.downloadUrl('report-1', actor);

    expect(result.download.url).toBe('https://r2.test/download');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'PURGE_REPORT_ACCESS' }));

    prisma.extensionPurgeReport.findUnique.mockResolvedValue(null);
    await expect(service.downloadUrl('missing', actor)).rejects.toBeInstanceOf(NotFoundException);
  });
});
