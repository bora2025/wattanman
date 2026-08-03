import { ConflictException, NotFoundException } from '@nestjs/common';
import { tenantContext } from '../tenancy/tenant-context';
import { ExtensionInstallationsService } from './extension-installations.service';

describe('ExtensionInstallationsService', () => {
  const prisma = {
    extension: { findMany: jest.fn(), findFirst: jest.fn() },
    extensionVersion: { findFirst: jest.fn() },
    extensionInstallation: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    siteSetting: { findUnique: jest.fn(), upsert: jest.fn(), update: jest.fn() },
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const storage = { getPrivate: jest.fn() };
  const signing = { verifyPublished: jest.fn().mockResolvedValue(true) };
  const service = new ExtensionInstallationsService(prisma as any, audit as any, storage as any, signing as any);
  const actor = { userId: 'admin-1', role: 'ADMIN' };

  beforeEach(() => jest.clearAllMocks());

  it('creates a request using the authoritative tenant school', async () => {
    prisma.extension.findFirst.mockResolvedValue({
      id: 'extension-1', name: 'Rewards', versions: [{ id: 'version-1' }],
    });
    prisma.extensionInstallation.findFirst.mockResolvedValue(null);
    prisma.extensionInstallation.create.mockImplementation(({ data }) => Promise.resolve({ id: 'installation-1', ...data }));

    const result = await tenantContext.run({ schoolId: 'school-a', mode: 'scoped' }, () => service.request('extension-1', actor));

    expect(result.schoolId).toBe('school-a');
    expect(prisma.extensionInstallation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ schoolId: 'school-a', extensionId: 'extension-1', installedVersionId: 'version-1' }),
    });
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
});
