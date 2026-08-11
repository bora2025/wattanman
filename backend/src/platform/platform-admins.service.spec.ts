import { PlatformAdminsService } from './platform-admins.service';
import { decodeDateIdCursor } from '../common/cursor-pagination';

jest.mock('bcryptjs', () => ({ hash: jest.fn().mockResolvedValue('hashed-password') }));

describe('PlatformAdminsService publisher membership', () => {
  const prisma = {
    school: { findUnique: jest.fn() },
    user: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), delete: jest.fn() },
    extensionPublisher: { findUnique: jest.fn() },
    extensionPublisherMember: { upsert: jest.fn() },
  };
  const service = new PlatformAdminsService(prisma as any);

  beforeEach(() => jest.clearAllMocks());

  it('grants new platform admins all internal publisher roles', async () => {
    prisma.school.findUnique.mockResolvedValue({ id: 'platform-school' });
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ id: 'admin-2', name: 'Operator', email: 'operator@example.com' });
    prisma.extensionPublisher.findUnique.mockResolvedValue({ id: 'publisher-1' });

    await service.invite({ name: 'Operator', email: 'operator@example.com' });

    expect(prisma.extensionPublisherMember.upsert).toHaveBeenCalledWith({
      where: { publisherId_userId: { publisherId: 'publisher-1', userId: 'admin-2' } },
      update: { roles: ['UPLOAD', 'REVIEW', 'PUBLISH', 'MANAGE'], status: 'ACTIVE' },
      create: {
        publisherId: 'publisher-1',
        userId: 'admin-2',
        roles: ['UPLOAD', 'REVIEW', 'PUBLISH', 'MANAGE'],
        status: 'ACTIVE',
      },
    });
  });

  it('lists platform identities through bounded cursor pages', async () => {
    const rows = [
      { id: 'admin-2', createdAt: new Date('2026-02-02') },
      { id: 'admin-1', createdAt: new Date('2026-02-01') },
    ];
    prisma.school.findUnique.mockResolvedValue({ id: 'platform-school' });
    prisma.user.findMany.mockResolvedValue(rows);

    const page = await service.list(undefined, '1');

    expect(page.items).toEqual([rows[0]]);
    expect(decodeDateIdCursor(page.nextCursor!)).toEqual({ id: 'admin-2', createdAt: rows[0].createdAt });
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 2, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }));
  });
});
