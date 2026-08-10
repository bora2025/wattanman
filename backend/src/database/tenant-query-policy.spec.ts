import { readFileSync } from 'fs';
import { join } from 'path';
import { Prisma } from '@prisma/client';
import { TENANT_SCOPED_MODELS } from '../tenancy/scoped-models';
import { applyTenantQueryPolicy } from './tenant-query-policy';

describe('tenant query policy', () => {
  const schoolId = 'school-a';
  const owns = jest.fn().mockResolvedValue(true);

  beforeEach(() => jest.clearAllMocks());

  it('keeps the scoped model registry synchronized with every schema model carrying schoolId', () => {
    const schema = readFileSync(join(process.cwd(), 'prisma', 'schema.prisma'), 'utf8');
    const models = [...schema.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)(?=\nmodel\s+|$)/g)];
    const schoolModels = models
      .filter(([, , body]) => /^\s*schoolId\s+/m.test(body))
      .map(([, name]) => name)
      .sort();
    expect([...TENANT_SCOPED_MODELS].sort()).toEqual(schoolModels);
  });

  it.each(['findMany', 'findFirst', 'count', 'aggregate', 'groupBy', 'updateMany', 'deleteMany'])('%s forces the current school into where', async (action) => {
    const params = { model: 'User', action, args: { where: { role: 'ADMIN', schoolId: 'school-b' } } } as Prisma.MiddlewareParams;
    await applyTenantQueryPolicy(params, schoolId, owns);
    expect(params.args.where).toEqual({ role: 'ADMIN', schoolId });
  });

  it('rewrites unique reads to school-scoped first reads', async () => {
    const params = { model: 'User', action: 'findUnique', args: { where: { id: 'user-1' } } } as Prisma.MiddlewareParams;
    await applyTenantQueryPolicy(params, schoolId, owns);
    expect(params.action).toBe('findFirst');
    expect(params.args.where).toEqual({ id: 'user-1', schoolId });
  });

  it('injects school identity into every createMany row', async () => {
    const params = { model: 'Post', action: 'createMany', args: { data: [{ title: 'A' }, { title: 'B' }] } } as Prisma.MiddlewareParams;
    await applyTenantQueryPolicy(params, schoolId, owns);
    expect(params.args.data).toEqual([{ title: 'A', schoolId }, { title: 'B', schoolId }]);
  });

  it.each(['update', 'delete'])('%s rejects a row owned by another school', async (action) => {
    owns.mockResolvedValueOnce(false);
    const params = { model: 'Post', action, args: { where: { id: 'post-b' } } } as Prisma.MiddlewareParams;
    await expect(applyTenantQueryPolicy(params, schoolId, owns)).rejects.toMatchObject({ code: 'P2025' });
  });
});
