import { BadRequestException, ConflictException } from '@nestjs/common';
import { createHash } from 'crypto';
import { ExtensionsService } from './extensions.service';

describe('ExtensionsService', () => {
  const prisma = {
    extension: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    extensionVersion: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    extensionValidation: {
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    extensionInstallation: { updateMany: jest.fn() },
    extensionAsset: { upsert: jest.fn() },
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const storage = { putPrivate: jest.fn().mockResolvedValue(undefined), getPrivate: jest.fn() };
  const packageValidator = { validate: jest.fn() };
  const service = new ExtensionsService(prisma as any, audit as any, storage as any, packageValidator as any);
  const actor = { userId: 'platform-admin', role: 'PLATFORM_ADMIN' };

  beforeEach(() => jest.clearAllMocks());

  it('creates an internal declarative extension', async () => {
    prisma.extension.findUnique.mockResolvedValue(null);
    prisma.extension.create.mockImplementation(({ data }) => Promise.resolve({ id: 'ext-1', ...data }));

    const result = await service.createExtension({
      key: 'STUDENT_REWARDS',
      name: 'Student Rewards',
      runtimeType: 'DECLARATIVE_MODULE',
      commercialType: 'ADDON',
    }, actor);

    expect(result.publisher).toBe('WATTAMAN');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ resource: 'EXTENSION', action: 'CREATE' }));
  });

  it('rejects executable extensions during the declarative-only release', async () => {
    await expect(service.createExtension({
      key: 'SERVER_CODE',
      name: 'Server Code',
      runtimeType: 'CODE_EXTENSION',
      commercialType: 'ADDON',
    }, actor)).rejects.toThrow(BadRequestException);
  });

  it('requires review notes before approval', async () => {
    prisma.extensionVersion.findUnique.mockResolvedValue({ id: 'version-1', version: '1.0.0', lifecycleStatus: 'AWAITING_REVIEW' });

    await expect(service.transition('version-1', 'APPROVED', undefined, actor)).rejects.toThrow('reviewNotes are required');
  });

  it('rejects lifecycle transitions that skip validation and review', async () => {
    prisma.extensionVersion.findUnique.mockResolvedValue({ id: 'version-1', version: '1.0.0', lifecycleStatus: 'UPLOADED' });

    await expect(service.transition('version-1', 'PUBLISHED', 'ship it', actor)).rejects.toThrow(ConflictException);
  });

  it('prevents published versions from being edited', async () => {
    prisma.extensionVersion.findUnique.mockResolvedValue({ id: 'version-1', version: '1.0.0', lifecycleStatus: 'PUBLISHED' });

    await expect(service.updateDraft('version-1', { releaseNotes: 'changed' }, actor)).rejects.toThrow('immutable');
  });

  it('publishes only from approved and records publication time', async () => {
    prisma.extensionVersion.findUnique.mockResolvedValue({ id: 'version-1', extensionId: 'ext-1', version: '1.0.0', lifecycleStatus: 'APPROVED' });
    prisma.extensionVersion.update.mockImplementation(({ data }) => Promise.resolve({ id: 'version-1', version: '1.0.0', ...data }));

    await service.transition('version-1', 'PUBLISHED', undefined, actor);

    expect(prisma.extensionVersion.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ lifecycleStatus: 'PUBLISHED', publishedAt: expect.any(Date) }),
    }));
    expect(prisma.extension.update).toHaveBeenCalledWith({ where: { id: 'ext-1' }, data: { isListed: true, status: 'ACTIVE' } });
  });

  it('deactivates every installation of an emergency-blocked version', async () => {
    prisma.extensionVersion.findUnique.mockResolvedValue({ id: 'version-1', extensionId: 'ext-1', version: '1.0.0', lifecycleStatus: 'PUBLISHED' });
    prisma.extensionVersion.update.mockImplementation(({ data }) => Promise.resolve({ id: 'version-1', version: '1.0.0', ...data }));

    await service.transition('version-1', 'BLOCKED', 'security response', actor);

    expect(prisma.extensionInstallation.updateMany).toHaveBeenCalledWith({
      where: { installedVersionId: 'version-1', enabled: true },
      data: { enabled: false },
    });
  });

  it('returns validated theme preview CSS from private storage', async () => {
    prisma.extensionVersion.findUnique.mockResolvedValue({
      id: 'version-1', version: '1.0.0', lifecycleStatus: 'VALIDATED', manifest: { mode: 'dark' },
      extension: { runtimeType: 'THEME' }, assets: [{ path: 'style.css', storageKey: 'validated/style.css' }],
    });
    storage.getPrivate.mockResolvedValue(Buffer.from('.card { color: teal; }'));

    const result = await service.themePreview('version-1');

    expect(result.css).toBe('.card { color: teal; }');
    expect(storage.getPrivate).toHaveBeenCalledWith('validated/style.css');
  });

  it('uploads a package to a checksum-addressed quarantine key', async () => {
    prisma.extensionVersion.findUnique.mockResolvedValue({
      id: 'version-1', extensionId: 'ext-1', version: '1.0.0', lifecycleStatus: 'UPLOADED',
      extension: { key: 'TEST_THEME', runtimeType: 'THEME' }, manifest: {},
    });
    prisma.extensionVersion.update.mockImplementation(({ data }) => Promise.resolve({ id: 'version-1', version: '1.0.0', ...data }));
    prisma.extensionValidation.create.mockResolvedValue({ id: 'validation-1' });
    packageValidator.validate.mockResolvedValue({
      valid: true,
      manifest: { key: 'TEST_THEME' },
      errors: [],
      warnings: [],
      files: [{ path: 'theme.json', size: 2, checksum: 'asset-checksum', mimeType: 'application/json', contents: Buffer.from('{}') }],
    });
    const buffer = Buffer.from('zip-content');
    const file = { originalname: 'extension.zip', buffer, size: buffer.length } as Express.Multer.File;

    const result = await service.uploadPackage('version-1', file, actor);

    expect(storage.putPrivate).toHaveBeenCalledWith(expect.stringMatching(/^quarantine\/extensions\/ext-1\/version-1\/[a-f0-9]{64}\.zip$/), buffer, 'application/zip');
    expect(result.lifecycleStatus).toBe('VALIDATED');
    expect(storage.putPrivate).toHaveBeenCalledWith(
      'validated/extensions/ext-1/version-1/asset-checksum/theme.json',
      Buffer.from('{}'),
      'application/json',
    );
    expect(prisma.extensionAsset.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ path: 'theme.json', checksum: 'asset-checksum' }),
    }));
    expect(prisma.extensionValidation.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'PASSED' }),
    }));
  });

  it('treats retrying the same quarantined package as idempotent', async () => {
    const buffer = Buffer.from('zip-content');
    const checksum = createHash('sha256').update(buffer).digest('hex');
    const existing = {
      id: 'version-1', extensionId: 'ext-1', version: '1.0.0', lifecycleStatus: 'QUARANTINED',
      packageChecksum: checksum, packageStorageKey: `quarantine/extensions/ext-1/version-1/${checksum}.zip`, extension: {},
    };
    prisma.extensionVersion.findUnique.mockResolvedValue(existing);

    const result = await service.uploadPackage('version-1', { originalname: 'extension.zip', buffer, size: buffer.length } as Express.Multer.File, actor);

    expect(result).toBe(existing);
    expect(storage.putPrivate).not.toHaveBeenCalled();
  });
});
