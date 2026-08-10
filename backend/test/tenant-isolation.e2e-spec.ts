/**
 * ============================================================================
 * WATTAMAN - Multi-Tenant Isolation E2E Suite (conversion plan Phase 4d)
 * ============================================================================
 * Seeds two independent schools directly via Prisma (there's no HTTP path to
 * create a school's first user before Phase 6's Platform tier exists — same
 * bootstrap problem prisma/seed.ts solves for the single demo school), then
 * asserts — over real HTTP requests through the actual running NestJS app —
 * that School A's authenticated requests can never see, create, update, or
 * delete School B's data, and that a JWT issued for one school is rejected
 * outright when replayed against another school's host.
 *
 * A clean `tsc --noEmit` (Phase 4) proves the code type-checks against the new
 * schema. It does NOT prove tenant isolation holds at runtime. This suite is
 * what actually proves the latter — it's the "durable regression net" the
 * conversion plan's Phase 4d calls for, meant to run in CI on every PR that
 * touches backend/src/** or schema.prisma.
 *
 * Requires:
 *   - A real Postgres reachable via DATABASE_URL (schema pushed, i.e.
 *     `npx prisma db push` already run against it)
 *   - The backend running against that same database (npm run dev, or
 *     node dist/main) and reachable at API_BASE (default http://localhost:3001)
 *
 * Tenant is selected the same way the frontend proxy selects it in production
 * (frontend/app/api/[...path]/route.ts forwards the browser's Host as
 * `x-tenant-host` — see Phase 5a): every request below sets that header
 * explicitly rather than relying on the real `Host` header, since supertest
 * hits the backend directly with no proxy in front.
 * ============================================================================
 */

import * as supertest from 'supertest';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const API_BASE = process.env.API_BASE || 'http://localhost:3001';
const api = supertest.default(API_BASE);
const prisma = new PrismaClient();

const TEST_PREFIX = `e2eiso${Date.now()}`;
const SCHOOL_A_SUBDOMAIN = `${TEST_PREFIX}a`;
const SCHOOL_B_SUBDOMAIN = `${TEST_PREFIX}b`;
const HOST_A = `${SCHOOL_A_SUBDOMAIN}.test.local`;
const HOST_B = `${SCHOOL_B_SUBDOMAIN}.test.local`;
const PASSWORD = 'TestPass123!';
const ADMIN_A_EMAIL = `${TEST_PREFIX}_admin_a@test.com`;
const ADMIN_B_EMAIL = `${TEST_PREFIX}_admin_b@test.com`;

function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}
function tenantHeader(host: string) {
  return { 'x-tenant-host': host };
}

jest.setTimeout(120_000);

const state: {
  schoolAId: string;
  schoolBId: string;
  adminAToken: string;
  adminBToken: string;
  teacherAId: string;
  deptAId: string;
  deptBId: string;
  studyYearAId: string;
  classAId: string;
  classBId: string;
  extensionId: string;
  extensionKey: string;
  extensionRecordAId: string;
  extensionRecordBId: string;
} = {} as any;

describe('Phase 4d: Multi-Tenant Isolation', () => {
  beforeAll(async () => {
    const schoolA = await prisma.school.create({ data: { subdomain: SCHOOL_A_SUBDOMAIN, name: 'E2E Isolation School A', storagePrefix: `schools/${SCHOOL_A_SUBDOMAIN}` } });
    const schoolB = await prisma.school.create({ data: { subdomain: SCHOOL_B_SUBDOMAIN, name: 'E2E Isolation School B', storagePrefix: `schools/${SCHOOL_B_SUBDOMAIN}` } });
    state.schoolAId = schoolA.id;
    state.schoolBId = schoolB.id;
    await prisma.schoolAddon.createMany({
      data: [
        { schoolId: schoolA.id, addonKey: 'CLASSES', enabled: true, billingStatus: 'ACTIVE' },
        { schoolId: schoolB.id, addonKey: 'CLASSES', enabled: true, billingStatus: 'ACTIVE' },
      ],
    });

    const password = await bcrypt.hash(PASSWORD, 10);
    await prisma.user.create({
      data: { schoolId: schoolA.id, email: ADMIN_A_EMAIL, password, name: 'Admin A', role: 'ADMIN' },
    });
    await prisma.user.create({
      data: { schoolId: schoolB.id, email: ADMIN_B_EMAIL, password, name: 'Admin B', role: 'ADMIN' },
    });
    const teacherA = await prisma.user.create({
      data: { schoolId: schoolA.id, email: `${TEST_PREFIX}_teacher_a@test.com`, password, name: 'Teacher A', role: 'TEACHER' },
    });
    state.teacherAId = teacherA.id;

    state.extensionKey = `${TEST_PREFIX}_REWARDS`.toUpperCase();
    const publisher = await prisma.extensionPublisher.upsert({
      where: { key: 'WATTAMAN' },
      update: {},
      create: { key: 'WATTAMAN', name: 'Wattaman', status: 'ACTIVE', internal: true },
    });
    const extension = await prisma.extension.create({
      data: {
        key: state.extensionKey,
        name: 'Isolation Rewards',
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
            manifest: {
              schemaVersion: 1,
              key: state.extensionKey,
              name: 'Isolation Rewards',
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
    state.extensionId = extension.id;
    const versionId = extension.versions[0].id;
    await prisma.extensionInstallation.createMany({
      data: [
        { schoolId: schoolA.id, extensionId: extension.id, installedVersionId: versionId, enabled: true, installedAt: new Date(), approvedAt: new Date() },
        { schoolId: schoolB.id, extensionId: extension.id, installedVersionId: versionId, enabled: true, installedAt: new Date(), approvedAt: new Date() },
      ],
    });
    const recordA = await prisma.extensionRecord.create({ data: { schoolId: schoolA.id, extensionId: extension.id, resource: 'rewards', data: { points: 10 } } });
    const recordB = await prisma.extensionRecord.create({ data: { schoolId: schoolB.id, extensionId: extension.id, resource: 'rewards', data: { points: 20 } } });
    state.extensionRecordAId = recordA.id;
    state.extensionRecordBId = recordB.id;
  });

  afterAll(async () => {
    // Cascading delete of the School rows removes every row this suite
    // created in any tenant-scoped table (Phase 1's onDelete: Cascade on
    // every schoolId relation) — no per-table cleanup needed.
    await prisma.school.deleteMany({ where: { id: { in: [state.schoolAId, state.schoolBId] } } });
    await prisma.extension.deleteMany({ where: { id: state.extensionId } });
    await prisma.$disconnect();
  });

  // ── Auth boundary (the plan's core security principle) ──────────────────
  describe('Auth boundary: Host resolution + JWT-vs-Host mismatch', () => {
    it('logs in as School A admin via Host-based tenant resolution', async () => {
      const res = await api
        .post('/auth/login')
        .set(tenantHeader(HOST_A))
        .send({ email: ADMIN_A_EMAIL, password: PASSWORD })
        .expect(201);
      expect(res.body.user.role).toBe('ADMIN');
      state.adminAToken = res.body.access_token;
    });

    it('logs in as School B admin', async () => {
      const res = await api
        .post('/auth/login')
        .set(tenantHeader(HOST_B))
        .send({ email: ADMIN_B_EMAIL, password: PASSWORD })
        .expect(201);
      expect(res.body.user.role).toBe('ADMIN');
      state.adminBToken = res.body.access_token;
    });

    it("rejects School A's credentials when the request claims School B's host (email is unique per-school, not globally)", async () => {
      await api
        .post('/auth/login')
        .set(tenantHeader(HOST_B))
        .send({ email: ADMIN_A_EMAIL, password: PASSWORD })
        .expect(401);
    });

    it("rejects a School A JWT replayed against School B's host", async () => {
      await api.get('/auth/me').set(tenantHeader(HOST_B)).set(authHeader(state.adminAToken)).expect(401);
    });

    it('accepts the same School A JWT on School A host', async () => {
      const res = await api.get('/auth/me').set(tenantHeader(HOST_A)).set(authHeader(state.adminAToken)).expect(200);
      expect(res.body.email).toBe(ADMIN_A_EMAIL);
    });

    it('404s on a completely unknown subdomain rather than falling through to any school', async () => {
      await api
        .post('/auth/login')
        .set(tenantHeader(`${TEST_PREFIX}-does-not-exist.test.local`))
        .send({ email: ADMIN_A_EMAIL, password: PASSWORD })
        .expect(404);
    });
  });

  // ── No cross-tenant leak via "already exists" errors (guiding principle) ─
  describe('No leak-by-uniqueness-error: identical names in both schools', () => {
    it('lets both schools create a department with the IDENTICAL name with no conflict', async () => {
      const resA = await api
        .post('/departments')
        .set(tenantHeader(HOST_A))
        .set(authHeader(state.adminAToken))
        .send({ name: 'Human Resources' })
        .expect(201);
      const resB = await api
        .post('/departments')
        .set(tenantHeader(HOST_B))
        .set(authHeader(state.adminBToken))
        .send({ name: 'Human Resources' })
        .expect(201);
      expect(resA.body.id).not.toBe(resB.body.id);
      state.deptAId = resA.body.id;
      state.deptBId = resB.body.id;
    });

    it("School A's department list contains its own row but never School B's", async () => {
      const res = await api.get('/departments').set(tenantHeader(HOST_A)).set(authHeader(state.adminAToken)).expect(200);
      const ids = res.body.map((d: any) => d.id);
      expect(ids).toContain(state.deptAId);
      expect(ids).not.toContain(state.deptBId);
    });

    it("School B's department list contains its own row but never School A's", async () => {
      const res = await api.get('/departments').set(tenantHeader(HOST_B)).set(authHeader(state.adminBToken)).expect(200);
      const ids = res.body.map((d: any) => d.id);
      expect(ids).toContain(state.deptBId);
      expect(ids).not.toContain(state.deptAId);
    });
  });

  // ── Cross-tenant read/write via direct id (the guardrail's core job) ────
  describe('Cross-tenant access by id is a 404, not a data leak', () => {
    it("School A cannot update School B's department by id (404, not 200-with-someone-elses-row)", async () => {
      await api
        .put(`/departments/${state.deptBId}`)
        .set(tenantHeader(HOST_A))
        .set(authHeader(state.adminAToken))
        .send({ name: 'Hijacked' })
        .expect(404);
    });

    it("School B's department is unchanged after School A's attempted hijack", async () => {
      const res = await api.get('/departments').set(tenantHeader(HOST_B)).set(authHeader(state.adminBToken)).expect(200);
      const dept = res.body.find((d: any) => d.id === state.deptBId);
      expect(dept?.name).toBe('Human Resources');
    });

    it("School A cannot delete School B's department by id", async () => {
      await api
        .delete(`/departments/${state.deptBId}`)
        .set(tenantHeader(HOST_A))
        .set(authHeader(state.adminAToken))
        .expect(404);
    });
  });

  // ── A representative nested-write path (Phase 2c's named limitation) ────
  describe('Classes and student rows stay scoped end-to-end', () => {
    it('School A creates a study year and a class', async () => {
      const yearRes = await api
        .post('/study-years')
        .set(tenantHeader(HOST_A))
        .set(authHeader(state.adminAToken))
        .send({ year: 8888, label: `${TEST_PREFIX} Year` })
        .expect(201);
      state.studyYearAId = yearRes.body.id;

      const classRes = await api
        .post('/classes')
        .set(tenantHeader(HOST_A))
        .set(authHeader(state.adminAToken))
        .send({ name: `${TEST_PREFIX}_ClassA`, studyYearId: state.studyYearAId, teacherId: state.teacherAId })
        .expect(201);
      state.classAId = classRes.body.id;
      expect(classRes.body.id).toBeTruthy();
    });

    it("School B's class list never includes School A's class", async () => {
      const res = await api.get('/classes').set(tenantHeader(HOST_B)).set(authHeader(state.adminBToken)).expect(200);
      const ids = res.body.map((c: any) => c.id);
      expect(ids).not.toContain(state.classAId);
    });

    it("School B reading School A's class-students by id gets an empty list, never School A's actual students", async () => {
      // getStudentsInClass is a findMany-style endpoint (list students matching
      // this classId), not a "load one class, 404 if missing" endpoint — the
      // secure and correct behavior for a foreign classId is 200 with an empty
      // array (Prisma's findMany can't distinguish "class doesn't exist" from
      // "class exists but has no matching-school students"), not a 404. What
      // actually matters, and what this asserts, is that zero rows come back —
      // not the specific status code.
      const res = await api
        .get(`/classes/${state.classAId}/students`)
        .set(tenantHeader(HOST_B))
        .set(authHeader(state.adminBToken))
        .expect(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('Declarative extension data and activation stay tenant-scoped', () => {
    it('returns runtime navigation only from the current school installation', async () => {
      const res = await api.get('/extensions/navigation').set(tenantHeader(HOST_A)).set(authHeader(state.adminAToken)).expect(200);
      expect(res.body).toContainEqual(expect.objectContaining({ href: `/extensions/${state.extensionKey}/rewards` }));
    });

    it("School A sees its extension record but never School B's", async () => {
      const res = await api
        .get(`/extensions/${state.extensionKey}/resources/rewards`)
        .set(tenantHeader(HOST_A))
        .set(authHeader(state.adminAToken))
        .expect(200);
      const ids = res.body.map((record: any) => record.id);
      expect(ids).toContain(state.extensionRecordAId);
      expect(ids).not.toContain(state.extensionRecordBId);
    });

    it("School A cannot delete School B's extension record by id", async () => {
      await api
        .delete(`/extensions/${state.extensionKey}/resources/rewards/${state.extensionRecordBId}`)
        .set(tenantHeader(HOST_A))
        .set(authHeader(state.adminAToken))
        .expect(404);
      expect(await prisma.extensionRecord.findUnique({ where: { id: state.extensionRecordBId } })).not.toBeNull();
    });

    it('creates extension records under the authenticated request tenant', async () => {
      const res = await api
        .post(`/extensions/${state.extensionKey}/resources/rewards`)
        .set(tenantHeader(HOST_A))
        .set(authHeader(state.adminAToken))
        .send({ points: 30 })
        .expect(201);
      expect(res.body.schoolId).toBe(state.schoolAId);
      expect(res.body.byteSize).toBeGreaterThan(0);
      const installation = await prisma.extensionInstallation.findUnique({
        where: { schoolId_extensionId: { schoolId: state.schoolAId, extensionId: state.extensionId } },
      });
      expect(installation?.dataBytes).toBeGreaterThanOrEqual(res.body.byteSize);
    });

    it('removes navigation and resource access immediately when disabled', async () => {
      await prisma.extensionInstallation.update({
        where: { schoolId_extensionId: { schoolId: state.schoolAId, extensionId: state.extensionId } },
        data: { enabled: false },
      });
      const navigation = await api.get('/extensions/navigation').set(tenantHeader(HOST_A)).set(authHeader(state.adminAToken)).expect(200);
      expect(navigation.body).not.toContainEqual(expect.objectContaining({ href: `/extensions/${state.extensionKey}/rewards` }));
      await api
        .get(`/extensions/${state.extensionKey}/resources/rewards`)
        .set(tenantHeader(HOST_A))
        .set(authHeader(state.adminAToken))
        .expect(404);
    });
  });

  // ── Backup export never crosses tenants (Phase 3a — the riskiest file) ──
  describe('Backup export is scoped to the caller\'s own school', () => {
    it("School A's backup export contains its own department but never School B's", async () => {
      const res = await api.get('/backup/export').set(tenantHeader(HOST_A)).set(authHeader(state.adminAToken)).expect(200);
      const deptIds = (res.body.data?.Department || []).map((d: any) => d.id);
      expect(deptIds).toContain(state.deptAId);
      expect(deptIds).not.toContain(state.deptBId);
      // Every row of every tenant-scoped table in the export must carry School A's schoolId.
      for (const [model, rows] of Object.entries(res.body.data || {})) {
        for (const row of rows as any[]) {
          if (row.schoolId !== undefined) {
            expect(row.schoolId).toBe(state.schoolAId);
          }
        }
      }
    });
  });
});
