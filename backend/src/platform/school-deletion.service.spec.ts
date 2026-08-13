import { ConflictException } from '@nestjs/common';
import { SchoolDeletionService } from './school-deletion.service';

describe('SchoolDeletionService', () => {
  const actor = { userId: 'requester', role: 'PLATFORM_ADMIN' };
  const prisma: any = {
    school: { findUnique: jest.fn(), update: jest.fn() },
    dataLegalHold: { findFirst: jest.fn() },
    schoolDeletionRequest: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
  };
  const queues = { enqueue: jest.fn() };
  const service = new SchoolDeletionService(prisma, queues as any, {} as any, {} as any);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.dataLegalHold.findFirst.mockResolvedValue(null);
    prisma.schoolDeletionRequest.findFirst.mockResolvedValue(null);
  });

  it('schedules a school for independently approved deletion', async () => {
    prisma.school.findUnique.mockResolvedValue({ id: 'school-a', name: 'School A', subdomain: 'school-a' });
    prisma.school.update.mockResolvedValue({});
    prisma.schoolDeletionRequest.create.mockResolvedValue({ id: 'delete-a', status: 'PENDING_APPROVAL' });

    await expect(service.request('school-a', 'Customer contract ended', actor)).resolves.toEqual({ id: 'delete-a', status: 'PENDING_APPROVAL' });
    expect(prisma.school.update).toHaveBeenCalledWith({ where: { id: 'school-a' }, data: { status: 'DELETION_SCHEDULED' } });
  });

  it('blocks deletion whenever any active legal hold exists', async () => {
    prisma.school.findUnique.mockResolvedValue({ id: 'school-a', name: 'School A', subdomain: 'school-a' });
    prisma.dataLegalHold.findFirst.mockResolvedValue({ caseReference: 'CASE-42' });
    await expect(service.request('school-a', 'Customer contract ended', actor)).rejects.toThrow(ConflictException);
  });

  it('enforces separate requester, approver, and executor identities', async () => {
    prisma.schoolDeletionRequest.findUnique.mockResolvedValue({ id: 'delete-a', deletedSchoolId: 'school-a', status: 'PENDING_APPROVAL', requestedBy: 'requester' });
    await expect(service.approve('delete-a', 'Approved by operations', actor)).rejects.toThrow('Requester cannot approve');

    prisma.schoolDeletionRequest.findUnique.mockResolvedValue({ id: 'delete-a', deletedSchoolId: 'school-a', status: 'APPROVED', requestedBy: 'requester', approvedBy: 'approver' });
    await expect(service.execute('delete-a', 'school-a', 'CHG-42', { userId: 'approver', role: 'PLATFORM_ADMIN' })).rejects.toThrow('Executor must differ');
  });
});
