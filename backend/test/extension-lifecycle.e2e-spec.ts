import * as supertest from 'supertest';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import JSZip from 'jszip';
import { createServer, Server } from 'http';
import { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';

const R2_PORT = Number(process.env.E2E_R2_PORT || 3909);
const SIGNING_KEY_ID = 'wattaman-e2e-2026';
const SIGNING_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAd/FUPcVitiuVRfl1ExNxFlxdAyENLeS5LViH8Le3AaY=
-----END PUBLIC KEY-----
`;
const TEST_PREFIX = `e2elifecycle${Date.now()}`;
const SCHOOL_HOST = `${TEST_PREFIX}.test.local`;
const PASSWORD = 'TestPass123!';
const prisma = new PrismaClient();

jest.setTimeout(120_000);

function tenant(host: string) { return { 'x-tenant-host': host }; }
function auth(token: string) { return { Authorization: `Bearer ${token}` }; }

async function packageZip(manifest: Record<string, unknown>) {
  const zip = new JSZip();
  zip.file('extension.json', JSON.stringify(manifest));
  zip.file('readme.md', '# Lifecycle E2E');
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('Extension marketplace lifecycle E2E', () => {
  let storageServer: Server;
  let app: INestApplication;
  let api: ReturnType<typeof supertest.default>;
  const objects = new Map<string, Buffer>();
  let platformSchoolId: string;
  let schoolId: string;
  let extensionId: string;
  let installationId: string;
  let version1Id: string;
  let version2Id: string;
  let platformToken: string;
  let schoolToken: string;

  beforeAll(async () => {
    storageServer = createServer((request, response) => {
      const key = request.url || '/';
      if (request.method === 'PUT') {
        const chunks: Buffer[] = [];
        request.on('data', chunk => chunks.push(Buffer.from(chunk)));
        request.on('end', () => { objects.set(key, Buffer.concat(chunks)); response.writeHead(200).end(); });
      } else if (request.method === 'GET') {
        const object = objects.get(key);
        if (!object) return response.writeHead(404).end('missing');
        response.writeHead(200, { 'Content-Type': 'application/octet-stream' }).end(object);
      } else if (request.method === 'DELETE') {
        objects.delete(key);
        response.writeHead(204).end();
      } else response.writeHead(405).end();
    });
    await new Promise<void>((resolve) => storageServer.listen(R2_PORT, '127.0.0.1', resolve));
    process.env.PLATFORM_HOST = 'platform.test.local';
    process.env.R2_ENDPOINT = `http://127.0.0.1:${R2_PORT}`;
    process.env.R2_BUCKET = 'e2e';
    process.env.R2_ACCESS_KEY_ID = 'e2e-access';
    process.env.R2_SECRET_ACCESS_KEY = 'e2e-secret';
    process.env.EXTENSION_SIGNING_KEY_ID = SIGNING_KEY_ID;
    process.env.EXTENSION_SIGNING_PRIVATE_KEY_BASE64 = 'LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0tCk1DNENBUUF3QlFZREsyVndCQ0lFSU5PR0Zzc25GYUUzaDh3R3YwblBFY2FQcTJ3a3VPOTR4SnpKTWJpUFoyVXkKLS0tLS1FTkQgUFJJVkFURSBLRVktLS0tLQo=';
    app = await NestFactory.create(AppModule, { logger: false });
    await app.init();
    api = supertest.default(app.getHttpServer());

    const password = await bcrypt.hash(PASSWORD, 10);
    const platformSchool = await prisma.school.upsert({
      where: { subdomain: 'platform' }, update: {}, create: { subdomain: 'platform', name: 'Wattaman Platform' },
    });
    platformSchoolId = platformSchool.id;
    const platformAdmin = await prisma.user.create({
      data: { schoolId: platformSchool.id, email: `${TEST_PREFIX}@platform.test`, password, name: 'Lifecycle Publisher', role: 'PLATFORM_ADMIN' },
    });
    const school = await prisma.school.create({ data: { subdomain: TEST_PREFIX, name: 'Lifecycle School' } });
    schoolId = school.id;
    await prisma.user.create({ data: { schoolId: school.id, email: `${TEST_PREFIX}@school.test`, password, name: 'School Admin', role: 'ADMIN' } });
    const publisher = await prisma.extensionPublisher.upsert({
      where: { key: 'WATTAMAN' }, update: { status: 'ACTIVE' }, create: { key: 'WATTAMAN', name: 'Wattaman', status: 'ACTIVE', internal: true },
    });
    await prisma.extensionPublisherMember.upsert({
      where: { publisherId_userId: { publisherId: publisher.id, userId: platformAdmin.id } },
      update: { roles: ['UPLOAD', 'REVIEW', 'PUBLISH', 'MANAGE'], status: 'ACTIVE' },
      create: { publisherId: publisher.id, userId: platformAdmin.id, roles: ['UPLOAD', 'REVIEW', 'PUBLISH', 'MANAGE'], status: 'ACTIVE' },
    });
    await prisma.extensionSigningKey.upsert({
      where: { keyId: SIGNING_KEY_ID },
      update: { publicKeyPem: SIGNING_PUBLIC_KEY, status: 'ACTIVE' },
      create: { publisherId: publisher.id, keyId: SIGNING_KEY_ID, publicKeyPem: SIGNING_PUBLIC_KEY, status: 'ACTIVE' },
    });

    platformToken = (await api.post('/auth/login').set(tenant('platform.test.local')).send({ email: `${TEST_PREFIX}@platform.test`, password: PASSWORD }).expect(201)).body.access_token;
    schoolToken = (await api.post('/auth/login').set(tenant(SCHOOL_HOST)).send({ email: `${TEST_PREFIX}@school.test`, password: PASSWORD }).expect(201)).body.access_token;
  });

  afterAll(async () => {
    if (installationId) await prisma.extensionInstallation.deleteMany({ where: { id: installationId } });
    if (extensionId) await prisma.extension.deleteMany({ where: { id: extensionId } });
    if (schoolId) await prisma.school.deleteMany({ where: { id: schoolId } });
    await prisma.user.deleteMany({ where: { email: `${TEST_PREFIX}@platform.test` } });
    if (platformSchoolId) {
      const remaining = await prisma.user.count({ where: { schoolId: platformSchoolId } });
      if (!remaining) await prisma.school.deleteMany({ where: { id: platformSchoolId } });
    }
    await prisma.$disconnect();
    await app.close();
    await new Promise<void>((resolve) => storageServer.close(() => resolve()));
  });

  async function createAndPublishVersion(version: string, manifest: Record<string, unknown>, releaseNotes: string) {
    const created = await api.post(`/platform/extensions/${extensionId}/versions`).set(tenant('platform.test.local')).set(auth(platformToken)).send({ version, manifest, compatibilityRange: '>=1.0.0 <2.0.0', releaseNotes }).expect(201);
    const zip = await packageZip(manifest);
    await api.post(`/platform/extensions/versions/${created.body.id}/package`).set(tenant('platform.test.local')).set(auth(platformToken)).attach('file', zip, { filename: `${version}.zip`, contentType: 'application/zip' }).expect(201).expect(({ body }) => expect(body.lifecycleStatus).toBe('VALIDATED'));
    await api.post(`/platform/extensions/versions/${created.body.id}/transition`).set(tenant('platform.test.local')).set(auth(platformToken)).send({ status: 'AWAITING_REVIEW' }).expect(201);
    await api.post(`/platform/extensions/versions/${created.body.id}/transition`).set(tenant('platform.test.local')).set(auth(platformToken)).send({ status: 'APPROVED', reviewNotes: 'Lifecycle E2E approved' }).expect(201);
    await api.post(`/platform/extensions/versions/${created.body.id}/transition`).set(tenant('platform.test.local')).set(auth(platformToken)).send({ status: 'PUBLISHED' }).expect(201);
    return created.body.id as string;
  }

  it('publishes, installs, migrates, rolls back, and emergency-blocks a signed ZIP', async () => {
    const extension = await api.post('/platform/extensions').set(tenant('platform.test.local')).set(auth(platformToken)).send({
      key: `${TEST_PREFIX}_REWARDS`.toUpperCase(), name: 'Lifecycle Rewards', runtimeType: 'DECLARATIVE_MODULE', commercialType: 'ADDON',
    }).expect(201);
    extensionId = extension.body.id;
    const key = extension.body.key;
    const baseManifest = {
      schemaVersion: 1, key, name: 'Lifecycle Rewards', version: '1.0.0', runtimeType: 'DECLARATIVE_MODULE', permissions: ['rewards:read', 'rewards:write'],
      navigation: [{ label: 'Rewards', pageKey: 'rewards', roles: ['ADMIN'] }],
      pages: [{ key: 'rewards', title: 'Rewards', resource: 'rewards', roles: ['ADMIN'], fields: [{ key: 'points', label: 'Points', type: 'number', required: true }] }],
      resources: { rewards: { fields: [{ key: 'points', type: 'number', required: true }] } },
    };
    version1Id = await createAndPublishVersion('1.0.0', baseManifest, 'Initial lifecycle version');

    const requested = await api.post(`/extensions/${extensionId}/request`).set(tenant(SCHOOL_HOST)).set(auth(schoolToken)).expect(201);
    installationId = requested.body.id;
    await api.post(`/platform/extension-installations/${installationId}/approve`).set(tenant('platform.test.local')).set(auth(platformToken)).expect(201);
    await api.post(`/platform/extension-installations/${installationId}/install`).set(tenant('platform.test.local')).set(auth(platformToken)).send({ versionId: version1Id }).expect(201);
    await api.patch(`/platform/extension-installations/${installationId}/activation`).set(tenant('platform.test.local')).set(auth(platformToken)).send({ enabled: true }).expect(200);
    await api.post(`/extensions/${key}/resources/rewards`).set(tenant(SCHOOL_HOST)).set(auth(schoolToken)).send({ points: 10 }).expect(201);

    const version2Manifest = {
      ...baseManifest, version: '2.0.0',
      pages: [{ key: 'rewards', title: 'Rewards', resource: 'rewards', roles: ['ADMIN'], fields: [{ key: 'score', label: 'Score', type: 'number', required: true }] }],
      resources: { rewards: { fields: [{ key: 'score', type: 'number', required: true }] } },
      migrations: [{ fromVersion: '1.0.0', toVersion: '2.0.0', operations: [{ type: 'renameField', resource: 'rewards', from: 'points', to: 'score' }] }],
    };
    version2Id = await createAndPublishVersion('2.0.0', version2Manifest, 'Rename points to score');
    await api.post(`/platform/extension-installations/${installationId}/upgrade`).set(tenant('platform.test.local')).set(auth(platformToken)).send({ versionId: version2Id }).expect(201);
    const migrated = await api.get(`/extensions/${key}/resources/rewards`).set(tenant(SCHOOL_HOST)).set(auth(schoolToken)).expect(200);
    expect(migrated.body[0].data).toEqual({ score: 10 });

    await api.post(`/platform/extension-installations/${installationId}/rollback`).set(tenant('platform.test.local')).set(auth(platformToken)).expect(201);
    const restored = await api.get(`/extensions/${key}/resources/rewards`).set(tenant(SCHOOL_HOST)).set(auth(schoolToken)).expect(200);
    expect(restored.body[0].data).toEqual({ points: 10 });

    await api.post(`/platform/extension-installations/${installationId}/upgrade`).set(tenant('platform.test.local')).set(auth(platformToken)).send({ versionId: version2Id }).expect(201);
    await api.post(`/platform/extensions/versions/${version2Id}/transition`).set(tenant('platform.test.local')).set(auth(platformToken)).send({ status: 'BLOCKED', reviewNotes: 'Emergency E2E block' }).expect(201);
    await api.get(`/extensions/${key}/resources/rewards`).set(tenant(SCHOOL_HOST)).set(auth(schoolToken)).expect(404);

    const actions = await prisma.auditLog.findMany({ where: { resource: { in: ['EXTENSION_VERSION', 'EXTENSION_INSTALLATION'] }, resourceId: { in: [version1Id, version2Id, installationId] } }, select: { action: true } });
    expect(actions.map(action => action.action)).toEqual(expect.arrayContaining(['STATUS_CHANGE', 'INSTALL', 'ACTIVATE', 'UPGRADE', 'ROLLBACK']));
  });
});
