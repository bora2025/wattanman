import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../src/database/prisma.service';
import { tenantContext } from '../src/tenancy/tenant-context';

const runtimeLogin = 'wattaman_runtime_e2e';
const controlLogin = 'wattaman_control_e2e';
const password = 'IdentityTest123!';

function loginUrl(baseUrl: string, username: string, databaseRole: string) {
  const url = new URL(baseUrl);
  url.username = username;
  url.password = password;
  url.searchParams.set('options', `-c role=${databaseRole}`);
  return url.toString();
}

describe('separate database identities E2E', () => {
  const adminUrl = process.env.DATABASE_ADMIN_URL || process.env.DATABASE_URL || '';
  const admin = new PrismaClient({ datasources: { db: { url: adminUrl } } });
  let prisma: PrismaService;

  beforeAll(async () => {
    await admin.$executeRawUnsafe(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${runtimeLogin}') THEN
        CREATE ROLE "${runtimeLogin}" LOGIN PASSWORD '${password}';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${controlLogin}') THEN
        CREATE ROLE "${controlLogin}" LOGIN PASSWORD '${password}';
      END IF;
    END $$`);
    await admin.$executeRawUnsafe(`GRANT "wattaman_school_runtime" TO "${runtimeLogin}"`);
    await admin.$executeRawUnsafe(`GRANT "wattaman_control_plane" TO "${controlLogin}"`);
    process.env.DATABASE_URL = loginUrl(adminUrl, runtimeLogin, 'wattaman_school_runtime');
    process.env.CONTROL_PLANE_DATABASE_URL = loginUrl(adminUrl, controlLogin, 'wattaman_control_plane');
    prisma = new PrismaService();
    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
    await admin.$disconnect();
  });

  it('uses the school-runtime identity for scoped transactions', async () => {
    const result = await tenantContext.run({ schoolId: 'school-a', mode: 'scoped' }, () =>
      prisma.runInTenantTransaction('school-a', () => prisma.$queryRaw<Array<{ current_user: string }>>`SELECT current_user`),
    );
    expect(result[0].current_user).toBe('wattaman_school_runtime');
  });

  it('uses the control-plane identity for audited unscoped operations', async () => {
    const result = await tenantContext.run({ schoolId: 'PLATFORM', mode: 'unscoped' }, () =>
      prisma.$queryRaw<Array<{ current_user: string }>>`SELECT current_user`,
    );
    expect(result[0].current_user).toBe('wattaman_control_plane');
  });
});
