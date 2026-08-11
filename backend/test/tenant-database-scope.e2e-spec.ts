import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../src/database/prisma.service';
import { tenantContext } from '../src/tenancy/tenant-context';

const prefix = `dbscope${Date.now()}`;
const setup = new PrismaClient();
const prisma = new PrismaService();

describe('transaction-local tenant database scope E2E', () => {
  let schoolA: string;
  let schoolB: string;

  beforeAll(async () => {
    await prisma.onModuleInit();
    schoolA = (await setup.school.create({ data: { name: 'Scope A', subdomain: `${prefix}a`, storagePrefix: `schools/${prefix}a`, status: 'ACTIVE' } })).id;
    schoolB = (await setup.school.create({ data: { name: 'Scope B', subdomain: `${prefix}b`, storagePrefix: `schools/${prefix}b`, status: 'ACTIVE' } })).id;
  });

  afterAll(async () => {
    await setup.school.deleteMany({ where: { id: { in: [schoolA, schoolB] } } });
    await setup.$disconnect();
    await prisma.onModuleDestroy();
  });

  it('sets the local tenant ID and reuses the transaction for nested work', async () => {
    await tenantContext.run({ schoolId: schoolA, mode: 'scoped' }, () =>
      prisma.runInTenantTransaction(schoolA, async () => {
        const setting = await prisma.$queryRaw<Array<{ school_id: string }>>`
          SELECT current_setting('app.current_school_id', true) AS school_id
        `;
        expect(setting[0].school_id).toBe(schoolA);
        await prisma.$transaction(async (transaction) => {
          await transaction.post.create({ data: { title: 'Nested', schoolId: schoolA } });
        });
      }),
    );
    await expect(setup.post.count({ where: { schoolId: schoolA, title: 'Nested' } })).resolves.toBe(1);
  });

  it('rolls back all nested writes when request work fails', async () => {
    await expect(tenantContext.run({ schoolId: schoolA, mode: 'scoped' }, () =>
      prisma.runInTenantTransaction(schoolA, async () => {
        await prisma.post.create({ data: { title: 'Rollback' } as any });
        await prisma.$transaction(async (transaction) => {
          await transaction.post.create({ data: { title: 'Rollback nested', schoolId: schoolA } });
        });
        throw new Error('request failed');
      }),
    )).rejects.toThrow('request failed');
    await expect(setup.post.count({ where: { schoolId: schoolA, title: { startsWith: 'Rollback' } } })).resolves.toBe(0);
  });

  it('rejects changing schools inside an active transaction', async () => {
    await expect(tenantContext.run({ schoolId: schoolA, mode: 'scoped' }, () =>
      prisma.runInTenantTransaction(schoolA, () => prisma.runInTenantTransaction(schoolB, async () => undefined)),
    )).rejects.toThrow('Cannot switch schools inside an active database transaction');
  });
});
