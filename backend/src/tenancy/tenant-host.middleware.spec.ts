import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TenantHostMiddleware } from './tenant-host.middleware';

describe('TenantHostMiddleware', () => {
  const originalEnvironment = process.env;

  beforeEach(() => {
    process.env = { ...originalEnvironment };
  });

  afterAll(() => {
    process.env = originalEnvironment;
  });

  function createMiddleware(resolvedSchool: any) {
    const domains = {
      resolve: jest.fn().mockResolvedValue(resolvedSchool),
    } as any;
    return {
      middleware: new TenantHostMiddleware(domains),
      domains,
    };
  }

  it('opens tenant context for an exactly resolved active school', async () => {
    const school = { id: 'school-a', status: 'ACTIVE' };
    const { middleware } = createMiddleware(school);
    const request: any = { headers: { host: 'alpha.example.com' } };
    const response = { setHeader: jest.fn() } as any;
    const next = jest.fn();

    await middleware.use(request, response, next);

    expect(request.tenantSchool).toBe(school);
    expect(response.setHeader).toHaveBeenCalledWith('X-Wattaman-School-Id', 'school-a');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('fails closed for an unknown host', async () => {
    const { middleware } = createMiddleware(null);

    await expect(
      middleware.use(
        { headers: { host: 'unknown.example.com' } } as any,
        {} as any,
        jest.fn(),
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
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
      { setHeader: jest.fn() } as any,
      jest.fn(),
    );

    expect(domains.resolve).toHaveBeenCalledWith('backend.internal');
  });
});
