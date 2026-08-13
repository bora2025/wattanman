import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { tenantContext } from '../tenancy/tenant-context';
import { ExtensionRuntimeService } from './extension-runtime.service';
import { decodeDateIdCursor } from '../common/cursor-pagination';

describe('ExtensionRuntimeService', () => {
  const manifest = {
    permissions: ['rewards:read', 'rewards:write'],
    navigation: [
      { label: 'Rewards', pageKey: 'rewards', roles: ['ADMIN', 'TEACHER'] },
      { label: 'Admin only', pageKey: 'settings', roles: ['ADMIN'] },
    ],
    pages: [
      { key: 'rewards', resource: 'rewards', roles: ['ADMIN', 'TEACHER'] },
    ],
    resources: {
      rewards: {
        fields: [
          { key: 'studentName', type: 'text', required: true },
          { key: 'points', type: 'number', required: true },
        ],
      },
    },
  };
  const installation = {
    id: 'installation-1',
    schoolId: 'school-a',
    extensionId: 'extension-1',
    extension: { key: 'STUDENT_REWARDS', name: 'Student Rewards', runtimeType: 'DECLARATIVE_MODULE' },
    installedVersionId: 'version-1',
    installedVersion: { lifecycleStatus: 'PUBLISHED', manifestSchema: 1, manifest, signingKey: { status: 'ACTIVE' } },
  };
  const prisma = {
    $transaction: jest.fn(),
    extensionInstallation: { findMany: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn() },
    school: { updateMany: jest.fn() },
    extensionRecord: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      findUnique: jest.fn(),
    },
  };
  const audit = { log: jest.fn() };
  const signing = { verifyForRuntime: jest.fn() };
  const governor = {
    storageQuotas: jest.fn(() => ({ installationBytes: 104857600, installationRecords: 100000, schoolBytes: 1073741824, schoolRecords: 1000000 })),
    exportRecordLimit: jest.fn(() => 10000),
    consumeExport: jest.fn(),
  };
  const controls = { assertAllowed: jest.fn() };
  const service = new ExtensionRuntimeService(prisma as any, audit as any, signing as any, governor as any, controls as any);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((callback) => callback(prisma));
    prisma.extensionInstallation.updateMany.mockResolvedValue({ count: 1 });
    prisma.school.updateMany.mockResolvedValue({ count: 1 });
    governor.consumeExport.mockResolvedValue(undefined);
    controls.assertAllowed.mockResolvedValue(undefined);
    audit.log.mockResolvedValue(undefined);
    signing.verifyForRuntime.mockResolvedValue(true);
  });

  it('returns only navigation allowed for the current role', async () => {
    prisma.extensionInstallation.findMany.mockResolvedValue([installation]);

    const result = await service.navigation({ role: 'TEACHER' });

    expect(result).toEqual([{ label: 'Rewards', href: '/extensions/STUDENT_REWARDS/rewards', icon: 'design', section: 'Extensions' }]);
    expect(signing.verifyForRuntime).toHaveBeenCalledWith(installation.installedVersion);
  });

  it('fails closed when the installed package signature cannot be verified', async () => {
    prisma.extensionInstallation.findFirst.mockResolvedValue(installation);
    signing.verifyForRuntime.mockRejectedValue(new Error('Package signature verification failed'));

    await expect(service.page('STUDENT_REWARDS', 'rewards', { role: 'ADMIN' }))
      .rejects.toThrow('Package signature verification failed');
  });

  it('returns translation dictionaries and default locale with a page', async () => {
    prisma.extensionInstallation.findFirst.mockResolvedValue({
      ...installation,
      installedVersion: { ...installation.installedVersion, manifest: { ...manifest, defaultLocale: 'en', translations: { en: { title: 'Rewards' }, km: { title: 'រង្វាន់' } } } },
    });

    const result = await service.page('STUDENT_REWARDS', 'rewards', { role: 'ADMIN' });

    expect(result.defaultLocale).toBe('en');
    expect(result.translations.km.title).toBe('រង្វាន់');
  });

  it('creates records with the authoritative tenant school', async () => {
    prisma.extensionInstallation.findFirst.mockResolvedValue(installation);
    prisma.extensionRecord.create.mockImplementation(({ data }) => Promise.resolve({ id: 'record-1', ...data }));

    const result = await tenantContext.run(
      { schoolId: 'school-a', mode: 'scoped' },
      () => service.createRecord('STUDENT_REWARDS', 'rewards', { studentName: 'Sokha', points: 10 }, { userId: 'teacher-1', role: 'TEACHER' }),
    );

    expect(result.schoolId).toBe('school-a');
    expect(prisma.extensionRecord.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ schoolId: 'school-a', extensionId: 'extension-1', installationId: 'installation-1', versionId: 'version-1', schemaVersion: 1, byteSize: expect.any(Number), createdBy: 'teacher-1' }),
    });
    expect(prisma.extensionInstallation.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'installation-1', schoolId: 'school-a', dataBytes: expect.any(Object) }),
    }));
  });

  it('denies capabilities not declared by the extension', async () => {
    prisma.extensionInstallation.findFirst.mockResolvedValue({
      ...installation,
      installedVersion: { ...installation.installedVersion, manifest: { ...manifest, permissions: ['rewards:read'] } },
    });

    await expect(service.createRecord('STUDENT_REWARDS', 'rewards', {}, { role: 'TEACHER' })).rejects.toThrow(ForbiddenException);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'CAPABILITY_DENIED',
      resource: 'EXTENSION_RUNTIME',
      resourceId: 'STUDENT_REWARDS',
      success: false,
    }));
  });

  it('denies access when no active published installation exists', async () => {
    prisma.extensionInstallation.findFirst.mockResolvedValue(null);

    await expect(service.records('STUDENT_REWARDS', 'rewards', { role: 'TEACHER' })).rejects.toThrow(NotFoundException);
  });

  it('returns extension records through bounded keyset pages', async () => {
    const rows = [
      { id: 'record-2', createdAt: new Date('2026-02-02') },
      { id: 'record-1', createdAt: new Date('2026-02-01') },
    ];
    prisma.extensionInstallation.findFirst.mockResolvedValue(installation);
    prisma.extensionRecord.findMany.mockResolvedValue(rows);

    const page = await service.records('STUDENT_REWARDS', 'rewards', { role: 'TEACHER' }, undefined, '1');

    expect(page.items).toEqual([rows[0]]);
    expect(decodeDateIdCursor(page.nextCursor!)).toEqual({ id: 'record-2', createdAt: rows[0].createdAt });
    expect(prisma.extensionRecord.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 2, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }));
  });

  it('rejects unknown fields and invalid field types', async () => {
    prisma.extensionInstallation.findFirst.mockResolvedValue(installation);

    await expect(service.createRecord('STUDENT_REWARDS', 'rewards', { studentName: 'Sokha', points: 10, extra: true }, { role: 'TEACHER' }))
      .rejects.toThrow(BadRequestException);
    await expect(service.createRecord('STUDENT_REWARDS', 'rewards', { studentName: 'Sokha', points: 'ten' }, { role: 'TEACHER' }))
      .rejects.toThrow('points must be a number');
  });

  it('looks up records within the installed extension and resource', async () => {
    prisma.extensionInstallation.findFirst.mockResolvedValue(installation);
    prisma.extensionRecord.findFirst.mockResolvedValue(null);

    await expect(tenantContext.run(
      { schoolId: 'school-a', mode: 'scoped' },
      () => service.deleteRecord('STUDENT_REWARDS', 'rewards', 'other-record', { role: 'ADMIN' }, '1'),
    )).rejects.toThrow(NotFoundException);
    expect(prisma.extensionRecord.findFirst).toHaveBeenCalledWith({
      where: { id: 'other-record', schoolId: 'school-a', installationId: 'installation-1', extensionId: 'extension-1', resource: 'rewards' },
    });
  });

  it('rejects a record when the installation extension-data quota is exhausted', async () => {
    prisma.extensionInstallation.findFirst.mockResolvedValue(installation);
    prisma.extensionInstallation.updateMany.mockResolvedValue({ count: 0 });

    await expect(tenantContext.run(
      { schoolId: 'school-a', mode: 'scoped' },
      () => service.createRecord('STUDENT_REWARDS', 'rewards', { studentName: 'Sokha', points: 10 }, { role: 'TEACHER' }),
    )).rejects.toThrow('Extension data or record quota exceeded');
    expect(prisma.extensionRecord.create).not.toHaveBeenCalled();
  });

  it('rejects a record when the aggregate school extension-data quota is exhausted', async () => {
    prisma.extensionInstallation.findFirst.mockResolvedValue(installation);
    prisma.school.updateMany.mockResolvedValue({ count: 0 });

    await expect(tenantContext.run(
      { schoolId: 'school-a', mode: 'scoped' },
      () => service.createRecord('STUDENT_REWARDS', 'rewards', { studentName: 'Sokha', points: 10 }, { role: 'TEACHER' }),
    )).rejects.toThrow('School extension data or record quota exceeded');
    expect(prisma.extensionRecord.create).not.toHaveBeenCalled();
  });

  it('requires and atomically advances the record concurrency version', async () => {
    prisma.extensionInstallation.findFirst.mockResolvedValue(installation);
    prisma.extensionRecord.findFirst.mockResolvedValue({ id: 'record-1', byteSize: 20, concurrencyVersion: 3 });
    prisma.extensionRecord.updateMany.mockResolvedValue({ count: 1 });
    prisma.extensionRecord.findUnique.mockResolvedValue({ id: 'record-1', concurrencyVersion: 4 });

    const updated = await tenantContext.run({ schoolId: 'school-a', mode: 'scoped' }, () =>
      service.updateRecord('STUDENT_REWARDS', 'rewards', 'record-1', { studentName: 'Sokha', points: 20 }, { userId: 'admin-1', role: 'ADMIN' }, '"3"'),
    );

    expect(prisma.extensionRecord.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'record-1', concurrencyVersion: 3 },
      data: expect.objectContaining({ concurrencyVersion: { increment: 1 }, versionId: 'version-1', schemaVersion: 1 }),
    }));
    expect(updated.concurrencyVersion).toBe(4);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'UPDATE', resource: 'EXTENSION_RECORD', resourceId: 'record-1' }));

    prisma.extensionRecord.findFirst.mockResolvedValue({ id: 'record-1', byteSize: 20, concurrencyVersion: 4 });
    await expect(tenantContext.run({ schoolId: 'school-a', mode: 'scoped' }, () =>
      service.updateRecord('STUDENT_REWARDS', 'rewards', 'record-1', { studentName: 'Sokha', points: 30 }, { role: 'ADMIN' }, '3'),
    )).rejects.toThrow('modified by another request');
  });

  it('applies bounded typed JSON filters inside the installation scope', async () => {
    prisma.extensionInstallation.findFirst.mockResolvedValue(installation);
    prisma.extensionRecord.findMany.mockResolvedValue([]);

    await service.records('STUDENT_REWARDS', 'rewards', { role: 'ADMIN' }, undefined, '20', JSON.stringify({ points: 10, studentName: 'Sokha' }));

    expect(prisma.extensionRecord.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        installationId: 'installation-1',
        AND: [{ data: { path: ['points'], equals: 10 } }, { data: { path: ['studentName'], equals: 'Sokha' } }],
      }),
    }));
  });

  it('exports a bounded installation-owned dataset and audits the privileged read', async () => {
    prisma.extensionInstallation.findFirst.mockResolvedValue(installation);
    prisma.extensionRecord.findMany.mockResolvedValue([{ id: 'record-1' }]);

    const result = await service.exportRecords('STUDENT_REWARDS', 'rewards', { userId: 'admin-1', role: 'ADMIN' });

    expect(result).toEqual(expect.objectContaining({ installationId: 'installation-1', versionId: 'version-1', records: [{ id: 'record-1' }] }));
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'EXPORT', resource: 'EXTENSION_RECORD' }));
  });
});
