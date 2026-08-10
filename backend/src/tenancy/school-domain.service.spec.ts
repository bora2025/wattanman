import { SchoolDomainService, normalizeHostname } from './school-domain.service';
import { resolveTxt } from 'dns/promises';

jest.mock('dns/promises', () => ({ resolveTxt: jest.fn() }));

const mockedResolveTxt = resolveTxt as jest.MockedFunction<typeof resolveTxt>;

describe('SchoolDomainService', () => {
  const originalEnvironment = process.env;

  beforeEach(() => {
    process.env = { ...originalEnvironment };
    mockedResolveTxt.mockReset();
  });

  afterAll(() => {
    process.env = originalEnvironment;
  });

  it('normalizes forwarded hosts and ports', () => {
    expect(normalizeHostname(' School.Example.com:443, proxy.internal ')).toBe(
      'school.example.com',
    );
    expect(normalizeHostname('[::1]:3001')).toBe('::1');
  });

  it('resolves an exact verified domain', async () => {
    const school = { id: 'school-a', subdomain: 'alpha' };
    const prisma = {
      school: { findUnique: jest.fn() },
      schoolDomain: {
        findFirst: jest.fn().mockResolvedValue({ school }),
      },
    } as any;
    const service = new SchoolDomainService(prisma);

    await expect(service.resolve('alpha.example.com')).resolves.toBe(school);
    expect(prisma.schoolDomain.findFirst).toHaveBeenCalledWith({
      where: { hostname: 'alpha.example.com', status: 'VERIFIED' },
      include: { school: true },
    });
  });

  it('reuses a bounded short-lived exact-domain cache', async () => {
    const school = { id: 'school-a', subdomain: 'alpha' };
    const prisma = {
      school: { findUnique: jest.fn() },
      schoolDomain: {
        findFirst: jest.fn().mockResolvedValue({ school }),
      },
    } as any;
    const service = new SchoolDomainService(prisma);

    await service.resolve('alpha.example.com');
    await service.resolve('alpha.example.com');

    expect(prisma.schoolDomain.findFirst).toHaveBeenCalledTimes(1);
  });

  it('resolves the configured platform host to the sentinel school', async () => {
    process.env.PLATFORM_HOST = 'platform.example.com';
    const platformSchool = { id: 'platform-school', subdomain: 'platform' };
    const prisma = {
      school: { findUnique: jest.fn().mockResolvedValue(platformSchool) },
      schoolDomain: { findFirst: jest.fn() },
    } as any;
    const service = new SchoolDomainService(prisma);

    await expect(service.resolve('platform.example.com')).resolves.toBe(
      platformSchool,
    );
    expect(prisma.schoolDomain.findFirst).not.toHaveBeenCalled();
  });

  it('uses a legacy alias only beneath the configured school root domain', async () => {
    process.env.SCHOOL_ROOT_DOMAIN = 'schools.example.com';
    const school = { id: 'school-a', subdomain: 'alpha' };
    const prisma = {
      school: { findUnique: jest.fn() },
      schoolDomain: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ school }),
      },
    } as any;
    const service = new SchoolDomainService(prisma);

    await expect(service.resolve('alpha.schools.example.com')).resolves.toBe(
      school,
    );
    expect(prisma.schoolDomain.findFirst).toHaveBeenLastCalledWith({
      where: {
        hostname: 'alpha',
        type: 'LEGACY_ALIAS',
        status: 'VERIFIED',
      },
      include: { school: true },
    });
  });

  it('rejects unknown hosts instead of guessing a school', async () => {
    process.env.SCHOOL_ROOT_DOMAIN = 'schools.example.com';
    const prisma = {
      school: { findUnique: jest.fn() },
      schoolDomain: { findFirst: jest.fn().mockResolvedValue(null) },
    } as any;
    const service = new SchoolDomainService(prisma);

    await expect(service.resolve('unknown.example.net')).resolves.toBeNull();
  });

  it('registers the managed hostname idempotently', async () => {
    process.env.SCHOOL_ROOT_DOMAIN = 'schools.example.com';
    const prisma = {
      schoolDomain: { upsert: jest.fn().mockResolvedValue({ id: 'domain-a' }) },
    } as any;
    const service = new SchoolDomainService(prisma);

    await service.registerManagedDomain('school-a', 'alpha');
    expect(prisma.schoolDomain.upsert).toHaveBeenCalledWith({
      where: { hostname: 'alpha.schools.example.com' },
      update: { schoolId: 'school-a', type: 'MANAGED' },
      create: expect.objectContaining({
        schoolId: 'school-a',
        hostname: 'alpha.schools.example.com',
        type: 'MANAGED',
        status: 'VERIFIED',
      }),
    });
  });

  it('does not allow a hostname to move between schools', async () => {
    const prisma = {
      schoolDomain: {
        findUnique: jest.fn().mockResolvedValue({ schoolId: 'school-b' }),
      },
    } as any;
    const service = new SchoolDomainService(prisma);

    await expect(
      service.registerVerifiedDomain('school-a', 'alpha.example.com'),
    ).rejects.toThrow('Hostname is already assigned to another school');
  });

  it('creates a pending TXT challenge for a custom domain', async () => {
    const prisma = {
      schoolDomain: {
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockImplementation(({ create }) => ({
          id: 'domain-a',
          ...create,
        })),
      },
    } as any;
    const service = new SchoolDomainService(prisma);

    const result = await service.requestCustomDomain(
      'school-a',
      'Portal.Example.com:443',
    );

    expect(result.status).toBe('PENDING');
    expect(result.hostname).toBe('portal.example.com');
    expect(result.verification.recordName).toBe(
      '_wattaman-verification.portal.example.com',
    );
    expect(result.verification.recordValue).toMatch(
      /^wattaman-verification=[a-f0-9]{48}$/,
    );
  });

  it('verifies a matching DNS TXT challenge', async () => {
    const domain = {
      id: 'domain-a',
      schoolId: 'school-a',
      hostname: 'portal.example.com',
      type: 'CUSTOM',
      verificationToken: 'token-a',
    };
    const prisma = {
      schoolDomain: {
        findFirst: jest.fn().mockResolvedValue(domain),
        update: jest.fn().mockImplementation(({ data }) => ({ ...domain, ...data })),
      },
    } as any;
    mockedResolveTxt.mockResolvedValue([
      ['wattaman-verification=', 'token-a'],
    ]);
    const service = new SchoolDomainService(prisma);

    const result = await service.verifyCustomDomain('school-a', 'domain-a');

    expect(result.verified).toBe(true);
    expect(prisma.schoolDomain.update).toHaveBeenCalledWith({
      where: { id: 'domain-a' },
      data: expect.objectContaining({
        status: 'VERIFIED',
        verificationError: null,
      }),
    });
  });

  it('keeps a custom domain pending when the TXT value is wrong', async () => {
    const domain = {
      id: 'domain-a',
      schoolId: 'school-a',
      hostname: 'portal.example.com',
      type: 'CUSTOM',
      verificationToken: 'token-a',
    };
    const prisma = {
      schoolDomain: {
        findFirst: jest.fn().mockResolvedValue(domain),
        update: jest.fn().mockResolvedValue(domain),
      },
    } as any;
    mockedResolveTxt.mockResolvedValue([['wrong-value']]);
    const service = new SchoolDomainService(prisma);

    await expect(
      service.verifyCustomDomain('school-a', 'domain-a'),
    ).resolves.toEqual({
      verified: false,
      error: 'Verification TXT record does not match',
    });
  });

  it('reports a missing DNS TXT challenge without verifying the domain', async () => {
    const domain = {
      id: 'domain-a',
      schoolId: 'school-a',
      hostname: 'portal.example.com',
      type: 'CUSTOM',
      verificationToken: 'token-a',
    };
    const prisma = {
      schoolDomain: {
        findFirst: jest.fn().mockResolvedValue(domain),
        update: jest.fn().mockResolvedValue(domain),
      },
    } as any;
    mockedResolveTxt.mockRejectedValue({ code: 'ENODATA' });
    const service = new SchoolDomainService(prisma);

    await expect(
      service.verifyCustomDomain('school-a', 'domain-a'),
    ).resolves.toEqual({
      verified: false,
      error: 'Verification TXT record was not found',
    });
  });
});
