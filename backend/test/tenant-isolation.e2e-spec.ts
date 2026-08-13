import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import * as supertest from 'supertest';
import { AppModule } from '../src/app.module';

const prisma = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_ADMIN_URL || process.env.DATABASE_URL } },
});
const prefix = `e2eiso${Date.now()}`;
const hostA = `${prefix}a.test.local`;
const hostB = `${prefix}b.test.local`;
const password = 'TestPass123!';
const sharedEmail = `${prefix}@school.test`;
const extensionKey = `${prefix}_REWARDS`.toUpperCase();

jest.setTimeout(120_000);

function tenant(host: string) {
  return { 'x-tenant-host': host };
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

describeWithDatabase('extension-first tenant isolation E2E', () => {
  let app: INestApplication;
  let api: ReturnType<typeof supertest.default>;
  let schoolAId: string;
  let schoolBId: string;
  let adminAId: string;
  let adminBId: string;
  let tokenA: string;
  let tokenB: string;
  let extensionId: string;
  let recordAId: string;
  let recordBId: string;
  let installationAId: string;
  let installationBId: string;
  let postAId: string;
  let postBId: string;
  let backupExportAId: string;
  let backupExportBId: string;

  beforeAll(async () => {
    process.env.PLATFORM_HOST = 'platform.test.local';
    app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
    await app.init();
    api = supertest.default(app.getHttpServer());

    const schoolA = await prisma.school.create({
      data: { subdomain: `${prefix}a`, name: 'Shared School Name', status: 'ACTIVE', storagePrefix: `schools/${prefix}a` },
    });
    const schoolB = await prisma.school.create({
      data: { subdomain: `${prefix}b`, name: 'Shared School Name', status: 'ACTIVE', storagePrefix: `schools/${prefix}b` },
    });
    schoolAId = schoolA.id;
    schoolBId = schoolB.id;
    await prisma.schoolDomain.createMany({
      data: [
        { schoolId: schoolAId, hostname: hostA, status: 'VERIFIED', routingStatus: 'READY', verifiedAt: new Date() },
        { schoolId: schoolBId, hostname: hostB, status: 'VERIFIED', routingStatus: 'READY', verifiedAt: new Date() },
      ],
    });

    const passwordHash = await bcrypt.hash(password, 10);
    const adminA = await prisma.user.create({ data: { schoolId: schoolAId, email: sharedEmail, password: passwordHash, name: 'Shared Admin', role: 'ADMIN' } });
    const adminB = await prisma.user.create({ data: { schoolId: schoolBId, email: sharedEmail, password: passwordHash, name: 'Shared Admin', role: 'ADMIN' } });
    adminAId = adminA.id;
    adminBId = adminB.id;

    const publisher = await prisma.extensionPublisher.upsert({
      where: { key: 'WATTAMAN' },
      update: {},
      create: { key: 'WATTAMAN', name: 'Wattaman', status: 'ACTIVE', internal: true },
    });
    const extension = await prisma.extension.create({
      data: {
        key: extensionKey,
        name: 'Tenant Isolation Rewards',
        runtimeType: 'DECLARATIVE_MODULE',
        commercialType: 'MODULE',
        publisherId: publisher.id,
        status: 'ACTIVE',
        isListed: true,
        visibility: 'LISTED',
        versions: {
          create: {
            version: '1.0.0',
            lifecycleStatus: 'PUBLISHED',
            publishedAt: new Date(),
            manifest: {
              schemaVersion: 1,
              key: extensionKey,
              name: 'Tenant Isolation Rewards',
              version: '1.0.0',
              runtimeType: 'DECLARATIVE_MODULE',
              permissions: ['rewards:read', 'rewards:write'],
              navigation: [{ label: 'Rewards', pageKey: 'rewards', roles: ['ADMIN'] }],
              pages: [{ key: 'rewards', title: 'Rewards', resource: 'rewards', roles: ['ADMIN'] }],
              resources: { rewards: { fields: [{ key: 'points', type: 'number', required: true }] } },
            },
          },
        },
      },
      include: { versions: true },
    });
    extensionId = extension.id;
    const versionId = extension.versions[0].id;
    const installationA = await prisma.extensionInstallation.create({ data: { schoolId: schoolAId, extensionId, installedVersionId: versionId, enabled: true, billingStatus: 'ACTIVE', approvedAt: new Date(), installedAt: new Date() } });
    const installationB = await prisma.extensionInstallation.create({ data: { schoolId: schoolBId, extensionId, installedVersionId: versionId, enabled: true, billingStatus: 'ACTIVE', approvedAt: new Date(), installedAt: new Date() } });
    installationAId = installationA.id;
    installationBId = installationB.id;
    const recordA = await prisma.extensionRecord.create({ data: { schoolId: schoolAId, extensionId, resource: 'rewards', data: { points: 10 }, byteSize: 13 } });
    const recordB = await prisma.extensionRecord.create({ data: { schoolId: schoolBId, extensionId, resource: 'rewards', data: { points: 20 }, byteSize: 13 } });
    recordAId = recordA.id;
    recordBId = recordB.id;
    const postA = await prisma.post.create({ data: { schoolId: schoolAId, title: 'Only school A', published: true } });
    const postB = await prisma.post.create({ data: { schoolId: schoolBId, title: 'Only school B', published: true } });
    postAId = postA.id;
    postBId = postB.id;
    await prisma.siteSetting.createMany({ data: [
      { schoolId: schoolAId, siteName: 'Site A' },
      { schoolId: schoolBId, siteName: 'Site B' },
    ] });
      await prisma.auditLog.createMany({ data: [
      { schoolId: schoolAId, action: 'READ', resource: 'ISOLATION', resourceId: 'audit-a', resourceLabel: 'Audit A', success: true },
      { schoolId: schoolBId, action: 'READ', resource: 'ISOLATION', resourceId: 'audit-b', resourceLabel: 'Audit B', success: true },
      ] });
      const backupA = await prisma.backupExport.create({ data: { schoolId: schoolAId, requestKey: `${prefix}-backup-a`, status: 'AVAILABLE', storageKey: `backups/${prefix}-a.json`, checksum: 'a'.repeat(64) } });
      const backupB = await prisma.backupExport.create({ data: { schoolId: schoolBId, requestKey: `${prefix}-backup-b`, status: 'AVAILABLE', storageKey: `backups/${prefix}-b.json`, checksum: 'b'.repeat(64) } });
      backupExportAId = backupA.id;
      backupExportBId = backupB.id;
  });

  afterAll(async () => {
    await prisma.school.deleteMany({ where: { id: { in: [schoolAId, schoolBId].filter(Boolean) } } });
    if (extensionId) await prisma.extension.delete({ where: { id: extensionId } });
    await prisma.$disconnect();
    await app?.close();
  });

  it('supports overlapping school names, user emails, and one extension key', async () => {
    const loginA = await api.post('/auth/login').set(tenant(hostA)).send({ email: sharedEmail, password }).expect(201);
    const loginB = await api.post('/auth/login').set(tenant(hostB)).send({ email: sharedEmail, password }).expect(201);
    tokenA = loginA.body.access_token;
    tokenB = loginB.body.access_token;
    expect(loginA.body.user.id).toBe(adminAId);
    expect(loginB.body.user.id).toBe(adminBId);
  });

  it('rejects a valid token replayed on another school domain', async () => {
    await api.get('/auth/me').set(tenant(hostB)).set(auth(tokenA)).expect(401);
    await api.get('/auth/me').set(tenant(hostA)).set(auth(tokenA)).expect(200);
  });

  it('isolates user reads and foreign deletes', async () => {
    const usersA = await api.get('/auth/users').set(tenant(hostA)).set(auth(tokenA)).expect(200);
    expect(usersA.body.map((user: any) => user.id)).toContain(adminAId);
    expect(usersA.body.map((user: any) => user.id)).not.toContain(adminBId);
    await api.delete(`/auth/users/${adminBId}`).set(tenant(hostA)).set(auth(tokenA)).expect(404);
    expect(await prisma.user.findUnique({ where: { id: adminBId } })).not.toBeNull();
  });

  it('isolates extension records and foreign mutations', async () => {
    const recordsA = await api.get(`/extensions/${extensionKey}/resources/rewards`).set(tenant(hostA)).set(auth(tokenA)).expect(200);
    expect(recordsA.body.map((record: any) => record.id)).toContain(recordAId);
    expect(recordsA.body.map((record: any) => record.id)).not.toContain(recordBId);
    await api.delete(`/extensions/${extensionKey}/resources/rewards/${recordBId}`).set(tenant(hostA)).set(auth(tokenA)).expect(404);
    expect(await prisma.extensionRecord.findUnique({ where: { id: recordBId } })).not.toBeNull();
  });

  it('isolates audit, post, settings, and installation controller reads', async () => {
    const logs = await api.get('/audit/logs?resource=ISOLATION').set(tenant(hostA)).set(auth(tokenA)).expect(200);
    const serializedLogs = JSON.stringify(logs.body);
    expect(serializedLogs).toContain('audit-a');
    expect(serializedLogs).not.toContain('audit-b');

    const adminPosts = await api.get('/posts').set(tenant(hostA)).set(auth(tokenA)).expect(200);
    expect(adminPosts.body.map((post: any) => post.id)).toContain(postAId);
    expect(adminPosts.body.map((post: any) => post.id)).not.toContain(postBId);
    const publicPosts = await api.get('/posts/published').set(tenant(hostA)).expect(200);
    expect(publicPosts.body.map((post: any) => post.id)).toContain(postAId);
    expect(publicPosts.body.map((post: any) => post.id)).not.toContain(postBId);

    const settings = await api.get('/site-settings').set(tenant(hostA)).expect(200);
    expect(settings.body.siteName).toBe('Site A');

    const installations = await api.get('/extensions/installations').set(tenant(hostA)).set(auth(tokenA)).expect(200);
    expect(installations.body.map((installation: any) => installation.id)).toContain(installationAId);
    expect(installations.body.map((installation: any) => installation.id)).not.toContain(installationBId);
  });

  it('denies school credentials on every platform controller surface', async () => {
    for (const path of [
      '/platform/extensions',
      '/platform/extension-installations',
      '/platform/admins',
      '/platform/school-metrics',
      '/platform/schools',
    ]) {
      await api.get(path).set(tenant(hostA)).set(auth(tokenA)).expect(403);
    }
  });

  it('creates extension data only under the authenticated tenant', async () => {
    const created = await api.post(`/extensions/${extensionKey}/resources/rewards`).set(tenant(hostA)).set(auth(tokenA)).send({ points: 30 }).expect(201);
    expect(created.body.schoolId).toBe(schoolAId);
    expect(created.body.schoolId).not.toBe(schoolBId);
  });

    it('lists only the caller school backup exports', async () => {
      const exported = await api.get('/backup/exports').set(tenant(hostA)).set(auth(tokenA)).expect(200);
      expect(exported.body.map((item: any) => item.id)).toContain(backupExportAId);
      expect(exported.body.map((item: any) => item.id)).not.toContain(backupExportBId);
  });

  it('fails closed for unknown domains', async () => {
    await api.post('/auth/login').set(tenant(`unknown-${prefix}.test.local`)).send({ email: sharedEmail, password }).expect(404);
  });
});
