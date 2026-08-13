import { createHash, createHmac } from 'crypto';
import { chmodSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import * as bcrypt from 'bcryptjs';
import { PrismaClient, Prisma } from '@prisma/client';
import { CERTIFICATION_SCALE, schoolFixture } from '../load-test/synthetic-fixture';
import { approvedSyntheticOrigin, assertLoadTestDatabaseConfiguration, assertSyntheticOnlySchools } from '../load-test/database-safety';

function integer(name: string, fallback: number, minimum: number, maximum: number) {
  const value = process.env[name] ? Number(process.env[name]) : fallback;
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`${name} must be from ${minimum} to ${maximum}`);
  return value;
}

function jwt(payload: Record<string, unknown>, secret: string, expiresAt: number) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const body = encode({ ...payload, iat: Math.floor(Date.now() / 1000), exp: expiresAt });
  const signature = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

async function insertBatches<T>(rows: T[], size: number, insert: (batch: T[]) => Promise<unknown>) {
  for (let offset = 0; offset < rows.length; offset += size) await insert(rows.slice(offset, offset + size));
}

async function main() {
  const databaseUrl = assertLoadTestDatabaseConfiguration({ databaseUrl: process.env.LOAD_TEST_DATABASE_URL, authorization: process.env.LOAD_TEST_DATABASE_AUTHORIZATION, environment: process.env.NODE_ENV });
  const jwtSecret = process.env.LOAD_TEST_JWT_SECRET?.trim();
  if (!jwtSecret || jwtSecret.length < 32 || jwtSecret !== process.env.JWT_SECRET) throw new Error('LOAD_TEST_JWT_SECRET must match the isolated target JWT_SECRET and contain at least 32 characters');
  const originTemplate = process.env.LOAD_TEST_SCHOOL_ORIGIN_TEMPLATE?.trim();
  if (!originTemplate) throw new Error('LOAD_TEST_SCHOOL_ORIGIN_TEMPLATE is required');
  const output = resolve(process.env.LOAD_TEST_IDENTITIES_OUTPUT || 'load-fixtures/identities.json');
  const seed = process.env.LOAD_FIXTURE_SEED?.trim() || 'wattaman-certification-v1';
  const schoolCount = integer('LOAD_FIXTURE_SCHOOLS', 1000, 1, 1000);
  const usersPerSchool = integer('LOAD_FIXTURE_USERS_PER_SCHOOL', 500, 1, 1000);
  const sessionsPerSchool = integer('LOAD_TEST_SESSIONS_PER_SCHOOL', 10, 1, 50);
  if (schoolCount * usersPerSchool < 500_000 && process.env.LOAD_TEST_ALLOW_SMOKE !== 'true') throw new Error('Certification provisioning requires at least 500,000 users');
  if (schoolCount * sessionsPerSchool < 10_000 && process.env.LOAD_TEST_ALLOW_SMOKE !== 'true') throw new Error('Certification provisioning requires at least 10,000 sessions');
  const scale = { ...CERTIFICATION_SCALE, schools: schoolCount, usersPerSchool };
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const startedAt = Date.now();
  try {
    await prisma.$connect();
    const existingSchools = await prisma.school.findMany({ select: { id: true, subdomain: true } });
    assertSyntheticOnlySchools(existingSchools);
    const publisher = await prisma.extensionPublisher.upsert({ where: { key: 'LOAD_TEST_INTERNAL' }, update: {}, create: { id: 'load-publisher', key: 'LOAD_TEST_INTERNAL', name: 'Synthetic Load Publisher', status: 'ACTIVE', verificationStatus: 'VERIFIED', internal: true } });
    const versions: Array<{ extensionId: string; versionId: string; key: string }> = [];
    for (let index = 0; index < scale.extensionsPerSchool; index += 1) {
      const key = `LOAD_EXTENSION_${String(index + 1).padStart(2, '0')}`;
      const extensionId = `load-extension-${index + 1}`;
      const versionId = `${extensionId}-version-1`;
      await prisma.extension.upsert({ where: { key }, update: {}, create: { id: extensionId, key, name: `Synthetic Extension ${index + 1}`, description: 'Performance environment fixture', runtimeType: 'DECLARATIVE_MODULE', commercialType: 'MODULE', publisherId: publisher.id, publisher: publisher.key, status: 'ACTIVE', isListed: true, visibility: 'LISTED', category: 'OTHER' } });
      await prisma.extensionVersion.upsert({ where: { extensionId_version: { extensionId, version: '1.0.0' } }, update: {}, create: { id: versionId, extensionId, version: '1.0.0', manifest: { key, name: `Synthetic Extension ${index + 1}`, version: '1.0.0', runtime: 'DECLARATIVE_MODULE', resources: [{ key: 'events' }, { key: 'settings' }, { key: 'transactions' }, { key: 'reports' }] }, compatibilityRange: '>=1.0.0 <2.0.0', lifecycleStatus: 'PUBLISHED', rolloutStage: 'FULL', publishedAt: new Date() } });
      versions.push({ extensionId, versionId, key });
    }
    const password = await bcrypt.hash(`load-${createHash('sha256').update(seed).digest('hex').slice(0, 24)}`, 4);
    const identities: Array<{ schoolId: string; origin: string; token: string }> = [];
    for (let schoolIndex = 0; schoolIndex < schoolCount; schoolIndex += 1) {
      const fixture = schoolFixture(seed, schoolIndex, scale);
      const schoolId = fixture.school.id;
      const origin = approvedSyntheticOrigin(originTemplate, schoolId);
      await prisma.school.upsert({ where: { id: schoolId }, update: {}, create: { id: schoolId, subdomain: schoolId, name: fixture.school.name, status: 'ACTIVE', storagePrefix: `schools/${schoolId}` } });
      await prisma.schoolDomain.upsert({ where: { hostname: new URL(origin).hostname }, update: { schoolId, status: 'VERIFIED', routingStatus: 'READY' }, create: { schoolId, hostname: new URL(origin).hostname, type: 'MANAGED', status: 'VERIFIED', verifiedAt: new Date(), routingStatus: 'READY', routingCheckedAt: new Date() } });
      await prisma.siteSetting.upsert({ where: { schoolId }, update: {}, create: { schoolId, siteName: fixture.school.name, heroSlides: JSON.stringify(fixture.assets.map((asset) => ({ id: asset.id, imageUrl: `https://assets.performance.invalid/${schoolId}/${asset.id}.webp`, title: `Synthetic asset ${asset.id}` }))) } });
      await insertBatches(fixture.users, 1000, (batch) => prisma.user.createMany({ data: batch.map((user) => ({ id: user.id, schoolId, email: user.email, password, name: `Synthetic ${user.role} ${user.id}`, role: user.role })), skipDuplicates: true }));
      await prisma.extensionInstallation.createMany({ data: versions.map((version, index) => ({ id: `${schoolId}-installation-${index + 1}`, schoolId, extensionId: version.extensionId, installedVersionId: version.versionId, enabled: fixture.installations[index].enabled, lifecycleState: fixture.installations[index].enabled ? 'ACTIVE' : 'INSTALLED', billingStatus: 'APPROVED', updatePolicy: fixture.installations[index].updatePolicy === 'NOTIFY' ? 'NOTIFY_ADMINS' : fixture.installations[index].updatePolicy, installedAt: new Date() })), skipDuplicates: true });
      await insertBatches(fixture.records, 1000, (batch) => prisma.extensionRecord.createMany({ data: batch.map((record) => { const index = Number(record.extensionKey.slice(-2)) - 1; const version = versions[index]; return { id: record.id, schoolId, extensionId: version.extensionId, installationId: `${schoolId}-installation-${index + 1}`, versionId: version.versionId, resource: record.resource, data: { synthetic: true, sequence: record.id, amount: record.byteSize }, byteSize: record.byteSize }; }), skipDuplicates: true }));
      await insertBatches(fixture.audits, 1000, (batch) => prisma.auditLog.createMany({ data: batch.map((audit) => ({ id: audit.id, schoolId, actorId: `${schoolId}-user-${(Number(audit.id.match(/(\d+)$/)?.[1] || 1) % usersPerSchool) + 1}`, actorRole: 'SYNTHETIC', action: audit.action, resource: 'LOAD_TEST', resourceId: audit.id, metadata: { synthetic: true }, method: 'GET', path: '/load-test', statusCode: 200, createdAt: new Date(Date.now() - audit.ageMinutes * 60_000) })), skipDuplicates: true }));
      const expiresAt = Math.floor(Date.now() / 1000) + 3 * 60 * 60;
      for (let index = 0; index < sessionsPerSchool; index += 1) {
        const user = fixture.users[index % fixture.users.length];
        identities.push({ schoolId, origin, token: jwt({ email: user.email, sub: user.id, role: user.role, schoolId }, jwtSecret, expiresAt) });
      }
      if ((schoolIndex + 1) % 25 === 0) process.stdout.write(`${JSON.stringify({ event: 'load_provision_progress', schools: schoolIndex + 1, users: (schoolIndex + 1) * usersPerSchool })}\n`);
    }
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, `${JSON.stringify(identities)}\n`, { flag: 'wx', mode: 0o600 });
    try { chmodSync(output, 0o600); } catch {}
    const counts = { schools: await prisma.school.count({ where: { id: { startsWith: 'load-school-' } } }), users: await prisma.user.count({ where: { schoolId: { startsWith: 'load-school-' } } }), installations: await prisma.extensionInstallation.count({ where: { schoolId: { startsWith: 'load-school-' } } }), records: await prisma.extensionRecord.count({ where: { schoolId: { startsWith: 'load-school-' } } }), audits: await prisma.auditLog.count({ where: { schoolId: { startsWith: 'load-school-' } } }), identities: identities.length };
    const fingerprint = createHash('sha256').update(JSON.stringify({ seed, scale, counts })).digest('hex');
    process.stdout.write(`${JSON.stringify({ outcome: 'PROVISIONED', counts, fingerprint, durationMs: Date.now() - startedAt, identitiesFile: output })}\n`);
  } finally { await prisma.$disconnect(); }
}

main().catch((error) => { process.stderr.write(`${error?.message || error}\n`); process.exitCode = 1; });
