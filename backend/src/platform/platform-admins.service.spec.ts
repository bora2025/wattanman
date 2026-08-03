import { PlatformAdminsService } from './platform-admins.service';

jest.mock('bcryptjs', () => ({ hash: jest.fn().mockResolvedValue('hashed-password') }));

describe('PlatformAdminsService publisher membership', () => {
  const prisma = {
    school: { findUnique: jest.fn() },
    user: { findFirst: jest.fn(), create: jest.fn(), delete: jest.fn() },
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
});
