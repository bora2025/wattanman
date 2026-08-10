import { SchoolsService } from './schools.service';

describe('SchoolsService provisioning', () => {
  const school = { id: 'school-1', name: 'Aurora School', subdomain: 'aurora', status: 'PROVISIONING' };
  const admin = { id: 'admin-1', name: 'School Admin', email: 'admin@aurora.test' };
  const job = { id: 'job-1', schoolId: school.id, requestKey: 'request-1', status: 'RUNNING', attempts: 1 };
  const tx = {
    school: { create: jest.fn(), update: jest.fn() },
    user: { create: jest.fn() },
    schoolProvisioningJob: { create: jest.fn(), update: jest.fn() },
  };
  const prisma = {
    school: { findUnique: jest.fn() },
    schoolProvisioningJob: { findUnique: jest.fn(), update: jest.fn() },
    $transaction: jest.fn((callback: any) => callback(tx)),
  };
  const domains = { registerManagedDomain: jest.fn(), registerVerifiedDomain: jest.fn() };
  const railway = { provisionDomain: jest.fn() };
  const service = new SchoolsService(prisma as any, {} as any, {} as any, railway as any, domains as any);

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.school.findUnique.mockResolvedValue(null);
    prisma.schoolProvisioningJob.findUnique.mockResolvedValue(null);
    tx.school.create.mockResolvedValue(school);
    tx.user.create.mockResolvedValue(admin);
    tx.schoolProvisioningJob.create.mockResolvedValue(job);
    tx.school.update.mockResolvedValue({ ...school, status: 'ACTIVE' });
    tx.schoolProvisioningJob.update.mockResolvedValue({ ...job, status: 'COMPLETED' });
    railway.provisionDomain.mockResolvedValue({ ok: true, domain: 'aurora.wattaman.app' });
  });

  it('creates the school, first admin, and provisioning job transactionally', async () => {
    const result = await service.create({
      name: school.name,
      subdomain: school.subdomain,
      adminName: admin.name,
      adminEmail: admin.email,
    }, job.requestKey);

    expect(tx.school.create).toHaveBeenCalledWith({ data: expect.objectContaining({ status: 'PROVISIONING' }) });
    expect(tx.user.create).toHaveBeenCalledWith({ data: expect.objectContaining({ schoolId: school.id, role: 'ADMIN' }) });
    expect(tx.schoolProvisioningJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ schoolId: school.id, requestKey: job.requestKey, status: 'RUNNING' }),
    });
    expect(result.school.status).toBe('ACTIVE');
    expect(result.domainProvisioned).toBe(true);
  });

  it('returns the existing job for an idempotent replay', async () => {
    prisma.schoolProvisioningJob.findUnique.mockResolvedValue({ ...job, status: 'COMPLETED', school: { ...school, status: 'ACTIVE' } });

    const result = await service.create({
      name: school.name,
      subdomain: school.subdomain,
      adminName: admin.name,
      adminEmail: admin.email,
    }, job.requestKey);

    expect(result.idempotentReplay).toBe(true);
    expect(result.temporaryPassword).toBeNull();
    expect(tx.school.create).not.toHaveBeenCalled();
  });

  it('keeps a school provisioning when domain setup fails', async () => {
    railway.provisionDomain.mockResolvedValue({ ok: false, reason: 'Routing provider unavailable' });
    tx.schoolProvisioningJob.update.mockResolvedValue({ ...job, status: 'FAILED', lastError: 'Routing provider unavailable' });

    const result = await service.create({
      name: school.name,
      subdomain: school.subdomain,
      adminName: admin.name,
      adminEmail: admin.email,
    }, job.requestKey);

    expect(tx.school.update).toHaveBeenCalledWith({ where: { id: school.id }, data: { status: 'PROVISIONING' } });
    expect(result.domainProvisioned).toBe(false);
    expect(result.school.status).toBe('PROVISIONING');
  });
});
