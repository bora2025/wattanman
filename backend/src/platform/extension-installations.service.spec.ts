import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { tenantContext } from '../tenancy/tenant-context';
import { ExtensionInstallationsService } from './extension-installations.service';

describe('ExtensionInstallationsService', () => {
  const prisma = {
    $transaction: jest.fn(),
    extension: { findMany: jest.fn(), findFirst: jest.fn() },
    extensionCatalogCollection: { findMany: jest.fn() },
    school: { findUnique: jest.fn() },
    user: { findUnique: jest.fn() },
    extensionVersion: { findFirst: jest.fn() },
    extensionInstallation: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    extensionRecord: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    extensionMigrationRun: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    extensionMigrationBackup: { create: jest.fn() },
    extensionPilotFeedback: { upsert: jest.fn() },
    siteSetting: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn() },
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const storage = { getPrivate: jest.fn(), putPrivate: jest.fn(), deletePrivate: jest.fn() };
  const signing = { verifyPublished: jest.fn().mockResolvedValue(true) };
  const service = new ExtensionInstallationsService(prisma as any, audit as any, storage as any, signing as any);
  const actor = { userId: 'admin-1', role: 'ADMIN' };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation((callback) => callback(prisma));
  });

  it('creates a request using the authoritative tenant school', async () => {
    prisma.extension.findFirst.mockResolvedValue({
      id: 'extension-1', name: 'Rewards', pricingModel: 'FREE', priceMinor: null,
      currency: 'USD', billingInterval: null, contractReference: null, priceNote: null,
      versions: [{ id: 'version-1' }],
    });
    prisma.extensionInstallation.findFirst.mockResolvedValue(null);
    prisma.extensionInstallation.create.mockImplementation(({ data }) => Promise.resolve({ id: 'installation-1', ...data }));

    const result = await tenantContext.run({ schoolId: 'school-a', mode: 'scoped' }, () => service.request('extension-1', actor));

    expect(result.schoolId).toBe('school-a');
    expect(prisma.extensionInstallation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        schoolId: 'school-a', extensionId: 'extension-1', installedVersionId: 'version-1',
        billingStatus: 'ACTIVE', requestPricingModel: 'FREE', requestCurrency: 'USD',
      }),
    });
  });

  it('snapshots private-contract terms and leaves billing pending', async () => {
    prisma.extension.findFirst.mockResolvedValue({
      id: 'extension-1', name: 'Private Analytics', pricingModel: 'PRIVATE_CONTRACT',
      priceMinor: null, currency: 'USD', billingInterval: null,
      contractReference: 'CONTRACT-2026', priceNote: 'Contact Wattaman',
      versions: [{ id: 'version-1' }],
    });
    prisma.extensionInstallation.findFirst.mockResolvedValue(null);
    prisma.extensionInstallation.create.mockImplementation(({ data }) => Promise.resolve({ id: 'installation-1', ...data }));

    await tenantContext.run({ schoolId: 'school-a', mode: 'scoped' }, () => service.request('extension-1', actor));

    expect(prisma.extensionInstallation.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      billingStatus: 'PENDING', requestPricingModel: 'PRIVATE_CONTRACT',
      requestContractReference: 'CONTRACT-2026', requestPriceNote: 'Contact Wattaman',
    }) });
  });

  it('snapshots paid subscription terms with the payment request', async () => {
    prisma.extension.findFirst.mockResolvedValue({
      id: 'extension-1', name: 'Analytics Plus', pricingModel: 'SUBSCRIPTION',
      priceMinor: 2500, currency: 'USD', billingInterval: 'MONTHLY',
      contractReference: null, priceNote: 'Per school', versions: [{ id: 'version-1' }],
    });
    prisma.school.findUnique.mockResolvedValue({ id: 'school-a', name: 'School A' });
    prisma.user.findUnique.mockResolvedValue({ id: 'admin-1', name: 'Admin One', email: 'admin@school.test' });
    prisma.extensionInstallation.findFirst.mockResolvedValue(null);
    prisma.extensionInstallation.create.mockImplementation(({ data }) => Promise.resolve({ id: 'installation-1', ...data }));
    const invoice = { mimetype: 'application/pdf', originalname: 'invoice.pdf', buffer: Buffer.from('invoice') } as Express.Multer.File;

    await tenantContext.run({ schoolId: 'school-a', mode: 'scoped' }, () =>
      service.requestPaid('extension-1', invoice, { paymentReference: 'BANK-1' }, actor),
    );

    expect(storage.putPrivate).toHaveBeenCalled();
    expect(prisma.extensionInstallation.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      schoolId: 'school-a', billingStatus: 'PENDING', requestPricingModel: 'SUBSCRIPTION',
      requestPriceMinor: 2500, requestCurrency: 'USD', requestBillingInterval: 'MONTHLY',
      requestSchoolName: 'School A', requestAdminName: 'Admin One',
    }) });
  });

  it('filters and cursor-paginates the school catalog with stable featured ordering', async () => {
    const first = { id: 'extension-1', name: 'Attendance', featuredRank: 1, createdAt: new Date('2026-08-01T00:00:00Z') };
    const second = { id: 'extension-2', name: 'Bus', featuredRank: 2, createdAt: new Date('2026-07-01T00:00:00Z') };
    prisma.extension.findMany.mockResolvedValue([first, second]);

    const page = await tenantContext.run({ schoolId: 'school-a', mode: 'scoped' }, () => service.schoolDirectory({
      limit: '1', search: 'attendance', category: 'academics', locale: 'km-KH', sort: 'FEATURED',
    }));

    expect(page.items).toEqual([first]);
    expect(page.nextCursor).toBeTruthy();
    expect(prisma.extension.findMany).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: [{ featuredRank: 'asc' }, { createdAt: 'desc' }, { id: 'desc' }],
      take: 2,
      where: expect.objectContaining({ status: 'ACTIVE', AND: expect.any(Array) }),
    }));
    prisma.extension.findMany.mockResolvedValue([]);
    await tenantContext.run({ schoolId: 'school-a', mode: 'scoped' }, () => service.schoolDirectory({
      limit: '1', cursor: page.nextCursor!, search: 'attendance', category: 'academics', locale: 'km-KH', sort: 'FEATURED',
    }));
    expect(prisma.extension.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({ AND: expect.arrayContaining([expect.objectContaining({ OR: expect.any(Array) })]) }),
    }));
  });

  it('rejects a catalog cursor reused with a different sort', async () => {
    const cursor = Buffer.from(JSON.stringify({ sort: 'NEWEST', id: 'extension-1', createdAt: new Date().toISOString() })).toString('base64url');
    await expect(tenantContext.run({ schoolId: 'school-a', mode: 'scoped' }, () =>
      service.schoolDirectory({ cursor, sort: 'NAME_ASC' }),
    )).rejects.toThrow('Invalid catalog cursor');
  });

  it('returns only bounded published collections with tenant-visible extensions', async () => {
    prisma.extensionCatalogCollection.findMany.mockResolvedValue([{ id: 'collection-1', items: [] }]);
    await tenantContext.run({ schoolId: 'school-a', mode: 'scoped' }, () => service.schoolCatalogCollections('km-KH'));
    expect(prisma.extensionCatalogCollection.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: 'PUBLISHED', locale: { in: ['km-KH', 'en'] } },
      take: 20,
      include: expect.objectContaining({ items: expect.objectContaining({ take: 20 }) }),
    }));
  });

  it('publishes a complete pilot acceptance checklist', () => {
    expect(service.pilotAcceptanceCriteria().map((criterion) => criterion.key)).toEqual([
      'install_without_rebuild', 'role_navigation', 'tenant_isolation', 'core_stability', 'upgrade_rollback', 'operator_runbook',
    ]);
  });

  it('rejects accepted pilot feedback when any criterion failed', async () => {
    prisma.extensionInstallation.findUnique.mockResolvedValue({
      id: 'installation-1', schoolId: 'school-a', extensionId: 'extension-1', installedAt: new Date(),
      extension: { name: 'Rewards' }, installedVersion: { assets: [] },
    });
    const checklist = Object.fromEntries(service.pilotAcceptanceCriteria().map((criterion) => [criterion.key, true]));
    checklist.tenant_isolation = false;

    await expect(service.submitPilotFeedback('installation-1', {
      outcome: 'ACCEPTED', rating: 5, checklist,
    }, actor, 'SCHOOL_ADMIN')).rejects.toThrow(BadRequestException);
    expect(prisma.extensionPilotFeedback.upsert).not.toHaveBeenCalled();
  });

  it('upserts and audits complete pilot feedback by source', async () => {
    prisma.extensionInstallation.findUnique.mockResolvedValue({
      id: 'installation-1', schoolId: 'school-a', extensionId: 'extension-1', installedAt: new Date(),
      extension: { name: 'Rewards' }, installedVersion: { assets: [] },
    });
    const checklist = Object.fromEntries(service.pilotAcceptanceCriteria().map((criterion) => [criterion.key, true]));
    prisma.extensionPilotFeedback.upsert.mockImplementation(({ create }) => Promise.resolve({ id: 'feedback-1', ...create }));

    const result = await service.submitPilotFeedback('installation-1', {
      outcome: 'ACCEPTED', rating: 5, checklist, comments: 'Pilot passed.',
    }, { userId: 'operator-1', role: 'PLATFORM_ADMIN' }, 'OPERATOR');

    expect(result).toEqual(expect.objectContaining({ schoolId: 'school-a', source: 'OPERATOR', outcome: 'ACCEPTED' }));
    expect(prisma.extensionPilotFeedback.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { installationId_source: { installationId: 'installation-1', source: 'OPERATOR' } },
    }));
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'PILOT_FEEDBACK' }));
  });

  it('cannot install before platform approval', async () => {
    prisma.extensionInstallation.findUnique.mockResolvedValue({
      id: 'installation-1', approvedAt: null, extension: { name: 'Rewards' }, installedVersion: { lifecycleStatus: 'PUBLISHED' },
    });

    await expect(service.install('installation-1', 'version-1', actor)).rejects.toThrow(ConflictException);
  });

  it('rejects a version from another extension', async () => {
    prisma.extensionInstallation.findUnique.mockResolvedValue({
      id: 'installation-1', extensionId: 'extension-1', approvedAt: new Date(), extension: { name: 'Rewards' }, installedVersion: { lifecycleStatus: 'PUBLISHED' },
    });
    prisma.extensionVersion.findFirst.mockResolvedValue(null);

    await expect(service.install('installation-1', 'other-version', actor)).rejects.toThrow(NotFoundException);
    expect(prisma.extensionVersion.findFirst).toHaveBeenCalledWith({
      where: { id: 'other-version', extensionId: 'extension-1', lifecycleStatus: 'PUBLISHED' },
      include: { assets: true, signingKey: true },
    });
  });

  it('refuses installation when package signature verification fails', async () => {
    prisma.extensionInstallation.findUnique.mockResolvedValue({
      id: 'installation-1', extensionId: 'extension-1', approvedAt: new Date(),
      extension: { name: 'Rewards', runtimeType: 'DECLARATIVE_MODULE' },
      installedVersion: { lifecycleStatus: 'PUBLISHED' },
    });
    prisma.extensionVersion.findFirst.mockResolvedValue({ id: 'version-1', assets: [], signingKey: { status: 'REVOKED' } });
    signing.verifyPublished.mockRejectedValueOnce(new ConflictException('Package signing key has been revoked'));

    await expect(service.install('installation-1', 'version-1', actor)).rejects.toThrow('revoked');
    expect(prisma.extensionInstallation.update).not.toHaveBeenCalled();
  });

  it('requires approval and installation before activation', async () => {
    prisma.extensionInstallation.findUnique.mockResolvedValue({
      id: 'installation-1', approvedAt: new Date(), installedAt: null, extension: { name: 'Rewards' }, installedVersion: { lifecycleStatus: 'PUBLISHED' },
    });

    await expect(service.activate('installation-1', true, actor)).rejects.toThrow(ConflictException);
  });

  it('applies a validated theme and stores the previous school theme', async () => {
    const previousTheme = {
      mode: 'light', primaryColor: '#111111', secondaryColor: '#222222', font: 'inter', radius: 'soft', customCss: '',
    };
    prisma.extensionInstallation.findUnique.mockResolvedValue({
      id: 'installation-1',
      schoolId: 'school-a',
      extensionId: 'theme-1',
      installedVersionId: 'version-1',
      approvedAt: new Date(),
      installedAt: new Date(),
      configuration: null,
      extension: { name: 'Aurora', runtimeType: 'THEME' },
      installedVersion: {
        lifecycleStatus: 'PUBLISHED',
        manifest: { mode: 'dark', tokens: { primaryColor: '#14B8A6', secondaryColor: '#FBBF24', font: 'poppins', radius: 'round' } },
        assets: [{ path: 'style.css', storageKey: 'validated/style.css' }],
      },
    });
    prisma.siteSetting.findUnique.mockResolvedValue(previousTheme);
    prisma.siteSetting.upsert.mockResolvedValue({});
    prisma.extensionInstallation.update.mockImplementation(({ data }) => Promise.resolve({ id: 'installation-1', ...data }));
    storage.getPrivate.mockResolvedValue(Buffer.from('.card { border-radius: 1rem; }'));

    const result = await service.activate('installation-1', true, actor);

    expect(prisma.siteSetting.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { schoolId: 'school-a' },
      update: expect.objectContaining({ mode: 'dark', primaryColor: '#14B8A6', customCss: '.card { border-radius: 1rem; }' }),
    }));
    expect((result.configuration as any).previousTheme).toEqual(previousTheme);
    expect((result.configuration as any).appliedTheme).toEqual(expect.objectContaining({ mode: 'dark', primaryColor: '#14B8A6' }));
  });

  it('preserves school appearance overrides during theme upgrade', async () => {
    prisma.extensionInstallation.findUnique.mockResolvedValue({
      id: 'theme-install', schoolId: 'school-a', extensionId: 'theme-1', installedVersionId: 'version-1', installedAt: new Date(), enabled: true,
      configuration: { appliedTheme: { mode: 'light', primaryColor: '#111111', secondaryColor: '#222222', font: 'inter', radius: 'soft', customCss: '.old{}' } },
      extension: { key: 'AURORA', name: 'Aurora', runtimeType: 'THEME' },
      installedVersion: { version: '1.0.0', lifecycleStatus: 'PUBLISHED', manifest: {}, assets: [] },
    });
    prisma.extensionVersion.findFirst.mockResolvedValue({
      id: 'version-2', version: '2.0.0', manifest: { mode: 'dark', tokens: { primaryColor: '#14B8A6', secondaryColor: '#FBBF24', font: 'poppins', radius: 'round' } },
      assets: [{ path: 'style.css', storageKey: 'theme-v2.css' }],
    });
    prisma.siteSetting.findUnique.mockResolvedValue({ mode: 'light', primaryColor: '#AA0000', secondaryColor: '#222222', font: 'inter', radius: 'soft', customCss: '.old{}' });
    storage.getPrivate.mockResolvedValue(Buffer.from('.wattaman-theme .card{}'));
    prisma.siteSetting.upsert.mockResolvedValue({});
    prisma.extensionInstallation.update.mockImplementation(({ data }) => Promise.resolve({ id: 'theme-install', ...data }));

    const result = await service.upgrade('theme-install', 'version-2', actor);

    expect(prisma.siteSetting.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ mode: 'dark', primaryColor: '#AA0000', secondaryColor: '#FBBF24', font: 'poppins' }),
    }));
    expect((result.configuration as any).schoolOverrides).toEqual({ primaryColor: '#AA0000' });
    expect((result.configuration as any).appliedTheme.primaryColor).toBe('#14B8A6');
  });

  it('uninstalls immediately and schedules purge after 30 days', async () => {
    prisma.extensionInstallation.findUnique.mockResolvedValue({
      id: 'installation-1', schoolId: 'school-a', extensionId: 'extension-1', extension: { name: 'Rewards' }, installedVersion: { lifecycleStatus: 'PUBLISHED' },
    });
    prisma.extensionInstallation.update.mockImplementation(({ data }) => Promise.resolve({ id: 'installation-1', ...data }));

    const result = await service.uninstall('installation-1', actor);

    expect(result.enabled).toBe(false);
    expect(result.purgeAfter.getTime() - result.uninstalledAt.getTime()).toBe(30 * 24 * 60 * 60 * 1000);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'UNINSTALL', resource: 'EXTENSION_INSTALLATION' }));
  });

  it('upgrades an installed extension only to its own published version', async () => {
    prisma.extensionInstallation.findUnique.mockResolvedValue({
      id: 'installation-1', schoolId: 'school-a', extensionId: 'extension-1', installedVersionId: 'version-1',
      installedAt: new Date(), enabled: false, configuration: null,
      extension: { name: 'Rewards', runtimeType: 'DECLARATIVE_MODULE' },
      installedVersion: { lifecycleStatus: 'PUBLISHED', assets: [] },
    });
    prisma.extensionVersion.findFirst.mockResolvedValue({ id: 'version-2', manifest: {}, assets: [] });
    prisma.extensionInstallation.update.mockImplementation(({ data }) => Promise.resolve({ id: 'installation-1', ...data }));

    const result = await service.upgrade('installation-1', 'version-2', actor);

    expect(result.installedVersionId).toBe('version-2');
    expect(prisma.extensionVersion.findFirst).toHaveBeenCalledWith({
      where: { id: 'version-2', extensionId: 'extension-1', lifecycleStatus: 'PUBLISHED' },
      include: { assets: true, signingKey: true },
    });
  });

  it('requires explicit acknowledgement when an upgrade adds permissions', async () => {
    prisma.extensionInstallation.findUnique.mockResolvedValue({
      id: 'installation-1', schoolId: 'school-a', extensionId: 'extension-1', installedVersionId: 'version-1',
      installedAt: new Date(), enabled: false, configuration: null,
      extension: { name: 'Rewards', runtimeType: 'DECLARATIVE_MODULE' },
      installedVersion: { version: '1.0.0', lifecycleStatus: 'PUBLISHED', manifest: { permissions: ['rewards:read'] }, assets: [] },
    });
    prisma.extensionVersion.findFirst.mockResolvedValue({
      id: 'version-2', version: '2.0.0', manifest: { permissions: ['rewards:read', 'rewards:write'] }, assets: [],
    });

    await expect(service.upgrade('installation-1', 'version-2', actor)).rejects.toThrow('Upgrade requests new permissions: rewards:write');
    expect(prisma.extensionInstallation.update).not.toHaveBeenCalled();

    prisma.extensionInstallation.update.mockImplementation(({ data }) => Promise.resolve({ id: 'installation-1', ...data }));
    const result = await service.upgrade('installation-1', 'version-2', actor, true);
    expect(result.installedVersionId).toBe('version-2');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ permissionReview: expect.objectContaining({ added: ['rewards:write'] }) }),
    }));
  });

  it('stores an audited school update policy', async () => {
    prisma.extensionInstallation.findUnique.mockResolvedValue({
      id: 'installation-1', schoolId: 'school-a', extensionId: 'extension-1', updatePolicy: 'MANUAL',
      extension: { name: 'Rewards' }, installedVersion: { assets: [] },
    });
    prisma.extensionInstallation.update.mockResolvedValue({ id: 'installation-1', updatePolicy: 'NOTIFY' });

    const result = await service.setUpdatePolicy('installation-1', 'NOTIFY', actor);

    expect(result.updatePolicy).toBe('NOTIFY');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'UPDATE_POLICY' }));
  });

  it('rolls back only to a published or deprecated non-blocked version', async () => {
    prisma.extensionInstallation.findUnique.mockResolvedValue({
      id: 'installation-1', schoolId: 'school-a', extensionId: 'extension-1', installedVersionId: 'version-2',
      installedAt: new Date(), enabled: false, configuration: { rollbackVersionId: 'version-1' },
      extension: { name: 'Rewards', runtimeType: 'DECLARATIVE_MODULE' },
      installedVersion: { lifecycleStatus: 'PUBLISHED', assets: [] },
    });
    prisma.extensionVersion.findFirst.mockResolvedValue({ id: 'version-1', manifest: {}, assets: [] });
    prisma.extensionInstallation.update.mockImplementation(({ data }) => Promise.resolve({ id: 'installation-1', ...data }));

    const result = await service.rollback('installation-1', actor);

    expect(result.installedVersionId).toBe('version-1');
    expect(prisma.extensionVersion.findFirst).toHaveBeenCalledWith({
      where: { id: 'version-1', extensionId: 'extension-1', lifecycleStatus: { in: ['PUBLISHED', 'DEPRECATED'] } },
      include: { assets: true, signingKey: true },
    });
  });

  it('blocks installation when a required dependency is missing', async () => {
    prisma.extensionInstallation.findUnique.mockResolvedValue({
      id: 'installation-1', schoolId: 'school-a', extensionId: 'extension-1', approvedAt: new Date(),
      extension: { key: 'REPORTS_PLUS', name: 'Reports Plus', runtimeType: 'DECLARATIVE_MODULE' },
      installedVersion: { lifecycleStatus: 'PUBLISHED', assets: [] },
    });
    prisma.extensionVersion.findFirst.mockResolvedValue({
      id: 'version-1', version: '1.0.0', manifest: { dependencies: [{ key: 'STUDENT_REWARDS', versionRange: '>=1.0.0', optional: false }] }, assets: [],
    });
    prisma.extensionInstallation.findMany.mockResolvedValue([]);

    await expect(service.install('installation-1', 'version-1', actor)).rejects.toThrow('STUDENT_REWARDS (MISSING)');
    expect(prisma.extensionInstallation.update).not.toHaveBeenCalled();
  });

  it('reports satisfied optional and required dependencies and conflicts', async () => {
    prisma.extensionInstallation.findUnique.mockResolvedValue({
      id: 'installation-1', schoolId: 'school-a', extensionId: 'extension-1',
      extension: { key: 'REPORTS_PLUS', name: 'Reports Plus' }, installedVersion: { assets: [] },
    });
    prisma.extensionVersion.findFirst.mockResolvedValue({
      id: 'version-1', version: '1.0.0', manifest: {
        dependencies: [{ key: 'STUDENT_REWARDS', versionRange: '>=1.0.0 <2.0.0', optional: false }],
        conflicts: ['OLD_REPORTS'],
      },
    });
    prisma.extensionInstallation.findMany.mockResolvedValue([
      { id: 'rewards-install', extension: { key: 'STUDENT_REWARDS' }, installedVersion: { version: '1.2.0', manifest: {} } },
      { id: 'old-install', extension: { key: 'OLD_REPORTS' }, installedVersion: { version: '1.0.0', manifest: {} } },
    ]);

    const review = await service.dependencyReview('installation-1', 'version-1');

    expect(review.dependencies).toEqual([expect.objectContaining({ key: 'STUDENT_REWARDS', status: 'SATISFIED', installedVersion: '1.2.0' })]);
    expect(review.conflicts).toEqual(['OLD_REPORTS']);
  });

  it('prevents uninstall while an active extension requires it', async () => {
    prisma.extensionInstallation.findUnique.mockResolvedValue({
      id: 'installation-1', schoolId: 'school-a', extensionId: 'extension-1',
      extension: { key: 'STUDENT_REWARDS', name: 'Student Rewards' }, installedVersion: { lifecycleStatus: 'PUBLISHED' },
    });
    prisma.extensionInstallation.findMany.mockResolvedValue([{
      id: 'dependent-install', extension: { name: 'Reports Plus' },
      installedVersion: { manifest: { dependencies: [{ key: 'STUDENT_REWARDS', optional: false }] } },
    }]);

    await expect(service.uninstall('installation-1', actor)).rejects.toThrow('Reports Plus');
    expect(prisma.extensionInstallation.update).not.toHaveBeenCalled();
  });

  it('applies a controlled record migration and stores rollback backups', async () => {
    prisma.extensionInstallation.findUnique.mockResolvedValue({
      id: 'installation-1', schoolId: 'school-a', extensionId: 'extension-1', installedVersionId: 'version-1', installedAt: new Date(), enabled: false, configuration: null,
      extension: { key: 'REWARDS', name: 'Rewards', runtimeType: 'DECLARATIVE_MODULE' },
      installedVersion: { id: 'version-1', version: '1.0.0', lifecycleStatus: 'PUBLISHED', manifest: {}, assets: [] },
    });
    prisma.extensionVersion.findFirst.mockResolvedValue({
      id: 'version-2', version: '2.0.0', assets: [], manifest: {
        migrations: [{ fromVersion: '1.0.0', toVersion: '2.0.0', operations: [{ type: 'renameField', resource: 'rewards', from: 'points', to: 'score' }] }],
      },
    });
    prisma.extensionInstallation.findMany.mockResolvedValue([]);
    prisma.extensionRecord.findMany.mockResolvedValue([{ id: 'record-1', resource: 'rewards', data: { points: 10 }, byteSize: 13 }]);
    prisma.extensionMigrationRun.create.mockResolvedValue({ id: 'migration-1' });
    prisma.extensionMigrationBackup.create.mockResolvedValue({});
    prisma.extensionRecord.update.mockResolvedValue({});
    prisma.extensionInstallation.update.mockImplementation(({ data }) => Promise.resolve({ id: 'installation-1', ...data }));

    const result = await service.upgrade('installation-1', 'version-2', actor);

    expect(prisma.extensionMigrationBackup.create).toHaveBeenCalledWith({ data: expect.objectContaining({ recordId: 'record-1', data: { points: 10 } }) });
    expect(prisma.extensionRecord.update).toHaveBeenCalledWith({ where: { id: 'record-1' }, data: expect.objectContaining({ data: { score: 10 } }) });
    expect(result.configuration).toEqual(expect.objectContaining({ migrationRunId: 'migration-1', rollbackVersionId: 'version-1' }));
  });

  it('restores migrated records during version rollback', async () => {
    prisma.extensionInstallation.findUnique.mockResolvedValue({
      id: 'installation-1', schoolId: 'school-a', extensionId: 'extension-1', installedVersionId: 'version-2', enabled: false,
      configuration: { rollbackVersionId: 'version-1', migrationRunId: 'migration-1' },
      extension: { key: 'REWARDS', name: 'Rewards', runtimeType: 'DECLARATIVE_MODULE' },
      installedVersion: { id: 'version-2', version: '2.0.0', lifecycleStatus: 'PUBLISHED', manifest: {}, assets: [] },
    });
    prisma.extensionVersion.findFirst.mockResolvedValue({ id: 'version-1', version: '1.0.0', manifest: {}, assets: [] });
    prisma.extensionMigrationRun.findUnique.mockResolvedValue({
      id: 'migration-1', installationId: 'installation-1', fromVersionId: 'version-1', toVersionId: 'version-2', status: 'APPLIED',
      backups: [{ recordId: 'record-1', resource: 'rewards', data: { points: 10 }, byteSize: 13 }],
    });
    prisma.extensionRecord.findUnique.mockResolvedValue({ id: 'record-1', byteSize: 12 });
    prisma.extensionRecord.update.mockResolvedValue({});
    prisma.extensionMigrationRun.update.mockResolvedValue({});
    prisma.extensionInstallation.update.mockImplementation(({ data }) => Promise.resolve({ id: 'installation-1', ...data }));

    const result = await service.rollback('installation-1', actor);

    expect(prisma.extensionRecord.update).toHaveBeenCalledWith({ where: { id: 'record-1' }, data: { data: { points: 10 }, byteSize: 13 } });
    expect(prisma.extensionMigrationRun.update).toHaveBeenCalledWith({ where: { id: 'migration-1' }, data: { status: 'ROLLED_BACK', rolledBackAt: expect.any(Date) } });
    expect((result.configuration as any).migrationRunId).toBeUndefined();
  });
});
