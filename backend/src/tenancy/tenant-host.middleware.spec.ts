import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TenantHostMiddleware } from './tenant-host.middleware';

describe('TenantHostMiddleware', () => {
  const originalEnvironment = process.env;

  beforeEach(() => {
    process.env = { ...originalEnvironment };
    delete process.env.ALLOW_SINGLE_SCHOOL_HOST_FALLBACK;
  });

  afterAll(() => {
    process.env = originalEnvironment;
  });

  function createMiddleware(resolvedSchool: any, fallbackSchools: any[] = []) {
    const prisma = {
      school: { findMany: jest.fn().mockResolvedValue(fallbackSchools) },
    } as any;
    const domains = {
      resolve: jest.fn().mockResolvedValue(resolvedSchool),
    } as any;
    return {
      middleware: new TenantHostMiddleware(prisma, domains),
      prisma,
      domains,
    };
  }

  it('opens tenant context for an exactly resolved active school', async () => {
    const school = { id: 'school-a', status: 'ACTIVE' };
    const { middleware, prisma } = createMiddleware(school);
    const request: any = { headers: { host: 'alpha.example.com' } };
    const next = jest.fn();

    await middleware.use(request, {} as any, next);

    expect(request.tenantSchool).toBe(school);
    expect(next).toHaveBeenCalledTimes(1);
    expect(prisma.school.findMany).not.toHaveBeenCalled();
  });

  it('fails closed for an unknown host when fallback is disabled', async () => {
    process.env.ALLOW_SINGLE_SCHOOL_HOST_FALLBACK = 'false';
    const { middleware, prisma } = createMiddleware(null, [
      { id: 'school-a', status: 'ACTIVE' },
    ]);

    await expect(
      middleware.use(
        { headers: { host: 'unknown.example.com' } } as any,
        {} as any,
        jest.fn(),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.school.findMany).not.toHaveBeenCalled();
  });

  it('keeps the explicitly enabled migration fallback temporary', async () => {
    process.env.ALLOW_SINGLE_SCHOOL_HOST_FALLBACK = 'true';
    const school = { id: 'school-a', status: 'ACTIVE' };
    const { middleware } = createMiddleware(null, [school]);
    const request: any = { headers: { host: 'legacy.railway.app' } };
    const next = jest.fn();

    await middleware.use(request, {} as any, next);

    expect(request.tenantSchool).toBe(school);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('rejects suspended schools before routing', async () => {
    const { middleware } = createMiddleware({
      id: 'school-a',
      status: 'SUSPENDED',
    });

    await expect(
      middleware.use(
        { headers: { host: 'alpha.example.com' } } as any,
        {} as any,
        jest.fn(),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('ignores x-tenant-host when proxy header trust is disabled', async () => {
    process.env.TRUST_TENANT_PROXY_HEADER = 'false';
    const school = { id: 'school-a', status: 'ACTIVE' };
    const { middleware, domains } = createMiddleware(school);

    await middleware.use(
      {
        headers: {
          host: 'backend.internal',
          'x-tenant-host': 'forged.example.com',
        },
      } as any,
      {} as any,
      jest.fn(),
    );

    expect(domains.resolve).toHaveBeenCalledWith('backend.internal');
  });
});
