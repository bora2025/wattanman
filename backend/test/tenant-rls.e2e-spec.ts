import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';

const prefix = `rls${Date.now()}`;
const adminUrl = process.env.DATABASE_ADMIN_URL || process.env.DATABASE_URL || '';
const runtimeUrl = process.env.RLS_RUNTIME_DATABASE_URL || '';
const controlUrl = process.env.RLS_CONTROL_PLANE_DATABASE_URL || '';
const admin = new PrismaClient({ datasources: { db: { url: adminUrl } } });
const runtime = new PrismaClient({ datasources: { db: { url: runtimeUrl } } });
const control = new PrismaClient({ datasources: { db: { url: controlUrl } } });

describe('PostgreSQL tenant row-level security E2E', () => {
  let schoolA: string;
  let schoolB: string;

  beforeAll(async () => {
    schoolA = (await admin.school.create({ data: { name: 'RLS A', subdomain: `${prefix}a`, storagePrefix: `schools/${prefix}a`, status: 'ACTIVE' } })).id;
    schoolB = (await admin.school.create({ data: { name: 'RLS B', subdomain: `${prefix}b`, storagePrefix: `schools/${prefix}b`, status: 'ACTIVE' } })).id;
    await admin.post.createMany({ data: [
      { schoolId: schoolA, title: 'School A post' },
      { schoolId: schoolB, title: 'School B post' },
    ] });
  });

  afterAll(async () => {
    await admin.school.deleteMany({ where: { id: { in: [schoolA, schoolB] } } });
    await Promise.all([runtime.$disconnect(), control.$disconnect()]);
    await admin.$disconnect();
  });

  it('forces RLS and installs a policy on every tenant table', async () => {
    const state = await admin.$queryRaw<Array<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean; policies: bigint }>>`
      SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity,
        (SELECT count(*) FROM pg_policies p WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policies
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname IN ('User', 'Post', 'ExtensionInstallation', 'ExtensionRecord', 'SchoolDomain')
    `;
    expect(state).toHaveLength(5);
    expect(state.every((table) => table.relrowsecurity && table.relforcerowsecurity && Number(table.policies) > 0)).toBe(true);
  });

  it('denies raw reads when tenant scope is absent', async () => {
    const rows = await runtime.$queryRaw<Array<{ count: number }>>`SELECT count(*)::int AS count FROM "Post"`;
    expect(rows[0].count).toBe(0);
  });

  it('limits raw reads to the transaction-local school', async () => {
    const titles = await runtime.$transaction(async (transaction) => {
      await transaction.$queryRawUnsafe(`SELECT set_config('app.current_school_id', $1, true)`, schoolA);
      return transaction.$queryRaw<Array<{ title: string }>>`SELECT "title" FROM "Post" ORDER BY "title"`;
    });
    expect(titles).toEqual([{ title: 'School A post' }]);
  });

  it('rejects a raw cross-school write even when application scoping is bypassed', async () => {
    await expect(runtime.$transaction(async (transaction) => {
      await transaction.$queryRawUnsafe(`SELECT set_config('app.current_school_id', $1, true)`, schoolA);
      await transaction.$executeRawUnsafe(
        `INSERT INTO "Post" ("id", "schoolId", "title", "updatedAt") VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
        randomUUID(), schoolB, 'Blocked write',
      );
    })).rejects.toThrow();
    await expect(admin.post.count({ where: { schoolId: schoolB, title: 'Blocked write' } })).resolves.toBe(0);
  });

  it('allows the explicitly assumed control-plane role to read across schools', async () => {
    const rows = await control.$queryRaw<Array<{ count: number }>>`
      SELECT count(*)::int AS count FROM "Post" WHERE "schoolId" IN (${schoolA}, ${schoolB})
    `;
    expect(rows[0].count).toBe(2);
  });
});
