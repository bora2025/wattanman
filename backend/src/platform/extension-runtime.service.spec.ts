import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { tenantContext } from '../tenancy/tenant-context';
import { ExtensionRuntimeService } from './extension-runtime.service';

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
    extensionId: 'extension-1',
    extension: { key: 'STUDENT_REWARDS', name: 'Student Rewards' },
    installedVersion: { lifecycleStatus: 'PUBLISHED', manifest },
  };
  const prisma = {
    extensionInstallation: { findMany: jest.fn(), findFirst: jest.fn() },
    extensionRecord: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };
  const service = new ExtensionRuntimeService(prisma as any);

  beforeEach(() => jest.clearAllMocks());

  it('returns only navigation allowed for the current role', async () => {
    prisma.extensionInstallation.findMany.mockResolvedValue([installation]);

    const result = await service.navigation({ role: 'TEACHER' });

    expect(result).toEqual([{ label: 'Rewards', href: '/extensions/STUDENT_REWARDS/rewards', icon: 'design', section: 'Extensions' }]);
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
      data: expect.objectContaining({ schoolId: 'school-a', extensionId: 'extension-1', createdBy: 'teacher-1' }),
    });
  });

  it('denies capabilities not declared by the extension', async () => {
    prisma.extensionInstallation.findFirst.mockResolvedValue({
      ...installation,
      installedVersion: { ...installation.installedVersion, manifest: { ...manifest, permissions: ['rewards:read'] } },
    });

    await expect(service.createRecord('STUDENT_REWARDS', 'rewards', {}, { role: 'TEACHER' })).rejects.toThrow(ForbiddenException);
  });

  it('denies access when no active published installation exists', async () => {
    prisma.extensionInstallation.findFirst.mockResolvedValue(null);

    await expect(service.records('STUDENT_REWARDS', 'rewards', { role: 'TEACHER' })).rejects.toThrow(NotFoundException);
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

    await expect(service.deleteRecord('STUDENT_REWARDS', 'rewards', 'other-record', { role: 'ADMIN' })).rejects.toThrow(NotFoundException);
    expect(prisma.extensionRecord.findFirst).toHaveBeenCalledWith({
      where: { id: 'other-record', extensionId: 'extension-1', resource: 'rewards' },
    });
  });
});
