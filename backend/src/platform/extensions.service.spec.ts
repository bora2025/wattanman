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
      updateMany: jest.fn(),
    },
    extensionPublisher: { upsert: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    extensionPublisherMember: { findUnique: jest.fn(), upsert: jest.fn() },
    extensionReview: { create: jest.fn(), findMany: jest.fn() },
    extensionSigningKey: { findMany: jest.fn(), findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    user: { findFirst: jest.fn() },
    extensionVersion: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    extensionValidation: {
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    extensionInstallation: { updateMany: jest.fn() },
    extensionVisibilityGrant: { upsert: jest.fn(), deleteMany: jest.fn() },
    school: { findUnique: jest.fn() },
    extensionAsset: { upsert: jest.fn() },
    auditLog: { groupBy: jest.fn() },
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const storage = { putPrivate: jest.fn().mockResolvedValue(undefined), getPrivate: jest.fn(), deletePrivate: jest.fn().mockResolvedValue(undefined) };
  const packageValidator = { validate: jest.fn() };
  const signing = { signForPublication: jest.fn(), validatePublicKey: jest.fn() };
  const service = new ExtensionsService(prisma as any, audit as any, storage as any, packageValidator as any, signing as any);
  const actor = { userId: 'platform-admin', role: 'PLATFORM_ADMIN' };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.extensionPublisherMember.findUnique.mockResolvedValue({
      status: 'ACTIVE', roles: ['UPLOAD', 'REVIEW', 'PUBLISH', 'MANAGE'],
    });
    signing.signForPublication.mockResolvedValue({ signingKeyId: 'key-1', packageSignature: 'signature', signedAt: new Date() });
  });

  it('creates an internal declarative extension', async () => {
    prisma.extensionPublisher.upsert.mockResolvedValue({ id: 'publisher-1', status: 'ACTIVE' });
    prisma.extension.findUnique.mockResolvedValue(null);
    prisma.extension.create.mockImplementation(({ data }) => Promise.resolve({ id: 'ext-1', ...data }));

    const result = await service.createExtension({
      key: 'STUDENT_REWARDS',
      name: 'Student Rewards',
      runtimeType: 'DECLARATIVE_MODULE',
      commercialType: 'ADDON',
    }, actor);

    expect(result.publisher).toBe('WATTAMAN');
    expect(prisma.extension.create).toHaveBeenCalledWith({ data: expect.objectContaining({ publisherId: 'publisher-1' }) });
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
    prisma.extensionVersion.findUnique.mockResolvedValue({ id: 'version-1', version: '1.0.0', lifecycleStatus: 'AWAITING_REVIEW', extension: { publisherId: 'publisher-1' } });

    await expect(service.transition('version-1', 'APPROVED', undefined, actor)).rejects.toThrow('reviewNotes are required');
  });

  it('rejects lifecycle transitions that skip validation and review', async () => {
    prisma.extensionVersion.findUnique.mockResolvedValue({ id: 'version-1', version: '1.0.0', lifecycleStatus: 'UPLOADED', extension: { publisherId: 'publisher-1' } });

    await expect(service.transition('version-1', 'PUBLISHED', 'ship it', actor)).rejects.toThrow(ConflictException);
  });

  it('prevents published versions from being edited', async () => {
    prisma.extensionVersion.findUnique.mockResolvedValue({ id: 'version-1', version: '1.0.0', lifecycleStatus: 'PUBLISHED' });

    await expect(service.updateDraft('version-1', { releaseNotes: 'changed' }, actor)).rejects.toThrow('immutable');
  });

  it('publishes only from approved and records publication time', async () => {
    prisma.extensionVersion.findUnique.mockResolvedValue({
      id: 'version-1', extensionId: 'ext-1', version: '1.0.0', lifecycleStatus: 'APPROVED',
      packageStorageKey: 'quarantine/extensions/ext-1/version-1/checksum.zip', packageChecksum: 'checksum',
      extension: { publisherEntity: { status: 'ACTIVE' } },
    });
    prisma.extensionVersion.update.mockImplementation(({ data }) => Promise.resolve({ id: 'version-1', version: '1.0.0', ...data }));
    storage.getPrivate.mockResolvedValue(Buffer.from('package'));

    await service.transition('version-1', 'PUBLISHED', undefined, actor);

    expect(storage.getPrivate).toHaveBeenCalledWith('quarantine/extensions/ext-1/version-1/checksum.zip');
    expect(storage.putPrivate).toHaveBeenCalledWith(
      'published/extensions/ext-1/version-1/checksum.zip',
      Buffer.from('package'),
      'application/zip',
    );
    expect(prisma.extensionVersion.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        lifecycleStatus: 'PUBLISHED',
        publishedAt: expect.any(Date),
        packageStorageKey: 'published/extensions/ext-1/version-1/checksum.zip',
        signingKeyId: 'key-1',
        packageSignature: 'signature',
        signedAt: expect.any(Date),
      }),
    }));
    expect(prisma.extension.update).toHaveBeenCalledWith({ where: { id: 'ext-1' }, data: { isListed: true, visibility: 'LISTED', status: 'ACTIVE' } });
    expect(storage.deletePrivate).toHaveBeenCalledWith('quarantine/extensions/ext-1/version-1/checksum.zip');
  });

  it('treats retrying a completed lifecycle transition as idempotent', async () => {
    const published = { id: 'version-1', version: '1.0.0', lifecycleStatus: 'PUBLISHED', packageStorageKey: 'published/package.zip' };
    prisma.extensionVersion.findUnique.mockResolvedValue(published);

    const result = await service.transition('version-1', 'PUBLISHED', undefined, actor);

    expect(result).toBe(published);
    expect(prisma.extensionVersion.update).not.toHaveBeenCalled();
    expect(storage.getPrivate).not.toHaveBeenCalled();
  });

  it('reports permission changes against the latest published version', async () => {
    prisma.extensionVersion.findUnique.mockResolvedValue({
      id: 'version-2', version: '2.0.0', compatibilityRange: '>=1.0.0',
      manifest: { permissions: ['rewards:read', 'rewards:write'] },
      extension: { versions: [{ id: 'version-1', version: '1.0.0', manifest: { permissions: ['rewards:read', 'reports:read'] } }] },
    });

    const result = await service.reviewSummary('version-2');

    expect(result.permissions.added).toEqual(['rewards:write']);
    expect(result.permissions.removed).toEqual(['reports:read']);
    expect(result.previousVersion).toBe('1.0.0');
    expect(result.platformCompatible).toBe(true);
  });

  it('requires release notes and compatibility before review', async () => {
    prisma.extensionVersion.findUnique.mockResolvedValue({
      id: 'version-1', version: '1.0.0', lifecycleStatus: 'VALIDATED', releaseNotes: null, compatibilityRange: null,
      extension: { publisherId: 'publisher-1' },
    });
    await expect(service.transition('version-1', 'AWAITING_REVIEW', undefined, actor)).rejects.toThrow('Release notes');
  });

  it('controls private extension visibility and school grants', async () => {
    prisma.extension.findUnique.mockResolvedValue({ id: 'ext-1', name: 'Rewards', publisherId: 'publisher-1', visibility: 'LISTED' });
    prisma.extension.update.mockResolvedValue({ id: 'ext-1', visibility: 'PRIVATE', isListed: false });
    await expect(service.setVisibility('ext-1', 'PRIVATE', actor)).resolves.toEqual(expect.objectContaining({ visibility: 'PRIVATE' }));
    expect(prisma.extension.update).toHaveBeenCalledWith({ where: { id: 'ext-1' }, data: { visibility: 'PRIVATE', isListed: false } });

    prisma.school.findUnique.mockResolvedValue({ id: 'school-1', name: 'School One' });
    await service.grantPrivateAccess('ext-1', 'school-1', true, actor);
    expect(prisma.extensionVisibilityGrant.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { extensionId_schoolId: { extensionId: 'ext-1', schoolId: 'school-1' } },
    }));
  });

  it('deactivates every installation of an emergency-blocked version', async () => {
    prisma.extensionVersion.findUnique.mockResolvedValue({ id: 'version-1', extensionId: 'ext-1', version: '1.0.0', lifecycleStatus: 'PUBLISHED', extension: { publisherId: 'publisher-1' } });
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
      extension: { key: 'TEST_THEME', runtimeType: 'THEME', publisherEntity: { status: 'ACTIVE' } }, manifest: {},
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

  it('keeps a version retryable when quarantine storage fails', async () => {
    prisma.extensionVersion.findUnique.mockResolvedValue({
      id: 'version-1', extensionId: 'ext-1', version: '1.0.0', lifecycleStatus: 'UPLOADED',
      extension: { key: 'TEST_THEME', runtimeType: 'THEME', publisherId: 'publisher-1', publisherEntity: { status: 'ACTIVE' } },
    });
    storage.putPrivate.mockRejectedValueOnce(new Error('R2 unavailable'));
    const buffer = Buffer.from('zip-content');

    await expect(service.uploadPackage('version-1', {
      originalname: 'extension.zip', buffer, size: buffer.length,
    } as Express.Multer.File, actor)).rejects.toThrow('R2 unavailable');

    expect(prisma.extensionVersion.update).not.toHaveBeenCalled();
    expect(prisma.extensionValidation.create).not.toHaveBeenCalled();
    expect(packageValidator.validate).not.toHaveBeenCalled();
  });

  it('persists a failed report and rejects the version when validation times out', async () => {
    prisma.extensionVersion.findUnique.mockResolvedValue({
      id: 'version-1', extensionId: 'ext-1', version: '1.0.0', lifecycleStatus: 'UPLOADED',
      extension: { key: 'TEST_THEME', runtimeType: 'THEME', publisherId: 'publisher-1', publisherEntity: { status: 'ACTIVE' } },
    });
    prisma.extensionVersion.update.mockImplementation(({ data }) => Promise.resolve({ id: 'version-1', version: '1.0.0', ...data }));
    prisma.extensionValidation.create.mockResolvedValue({ id: 'validation-1' });
    packageValidator.validate.mockResolvedValue({
      valid: false,
      errors: [{ code: 'VALIDATION_TIMEOUT', message: 'Package validation exceeded 100ms' }],
      warnings: [],
      files: [],
    });
    const buffer = Buffer.from('zip-content');

    const result = await service.uploadPackage('version-1', {
      originalname: 'extension.zip', buffer, size: buffer.length,
    } as Express.Multer.File, actor);

    expect(result.lifecycleStatus).toBe('REJECTED');
    expect(prisma.extensionValidation.update).toHaveBeenCalledWith({
      where: { id: 'validation-1' },
      data: expect.objectContaining({
        status: 'FAILED',
        errors: [expect.objectContaining({ code: 'VALIDATION_TIMEOUT' })],
        completedAt: expect.any(Date),
      }),
    });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'VALIDATION_FAILED' }));
  });

  it('treats retrying the same quarantined package as idempotent', async () => {
    const buffer = Buffer.from('zip-content');
    const checksum = createHash('sha256').update(buffer).digest('hex');
    const existing = {
      id: 'version-1', extensionId: 'ext-1', version: '1.0.0', lifecycleStatus: 'QUARANTINED',
      packageChecksum: checksum, packageStorageKey: `quarantine/extensions/ext-1/version-1/${checksum}.zip`, extension: { publisherEntity: { status: 'ACTIVE' } },
    };
    prisma.extensionVersion.findUnique.mockResolvedValue(existing);

    const result = await service.uploadPackage('version-1', { originalname: 'extension.zip', buffer, size: buffer.length } as Express.Multer.File, actor);

    expect(result).toBe(existing);
    expect(storage.putPrivate).not.toHaveBeenCalled();
  });

  it('suspends a publisher, unlists its catalog, and disables active installations', async () => {
    prisma.extensionPublisher.findUnique.mockResolvedValue({ id: 'publisher-1', name: 'Wattaman', status: 'ACTIVE' });
    prisma.extensionPublisher.update.mockResolvedValue({ id: 'publisher-1', name: 'Wattaman', status: 'SUSPENDED' });

    const result = await service.setPublisherStatus('publisher-1', 'SUSPENDED', actor);

    expect(result.status).toBe('SUSPENDED');
    expect(prisma.extension.updateMany).toHaveBeenCalledWith({
      where: { publisherId: 'publisher-1' },
      data: { status: 'SUSPENDED', isListed: false },
    });
    expect(prisma.extensionInstallation.updateMany).toHaveBeenCalledWith({
      where: { extension: { publisherId: 'publisher-1' }, enabled: true },
      data: { enabled: false },
    });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ resource: 'EXTENSION_PUBLISHER' }));
  });

  it('rejects lifecycle actions without the required publisher permission', async () => {
    prisma.extensionPublisherMember.findUnique.mockResolvedValue({ status: 'ACTIVE', roles: ['UPLOAD'] });
    prisma.extensionVersion.findUnique.mockResolvedValue({
      id: 'version-1', version: '1.0.0', lifecycleStatus: 'AWAITING_REVIEW', extension: { publisherId: 'publisher-1' },
    });

    await expect(service.transition('version-1', 'APPROVED', 'reviewed', actor)).rejects.toThrow('review permission is required');
    expect(prisma.extensionVersion.update).not.toHaveBeenCalled();
  });

  it('appends review decisions and supports an audited rejection appeal', async () => {
    prisma.extensionVersion.findUnique.mockResolvedValueOnce({
      id: 'version-1', version: '1.0.0', lifecycleStatus: 'AWAITING_REVIEW', extension: { publisherId: 'publisher-1' },
    });
    prisma.extensionVersion.update.mockImplementation(({ data }) => Promise.resolve({ id: 'version-1', version: '1.0.0', ...data }));

    await service.transition('version-1', 'REJECTED', 'Clarify permissions', actor);
    expect(prisma.extensionReview.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ extensionVersionId: 'version-1', action: 'REJECTED', notes: 'Clarify permissions' }),
    });

    prisma.extensionVersion.findUnique.mockResolvedValueOnce({
      id: 'version-1', version: '1.0.0', lifecycleStatus: 'REJECTED', reviewedBy: 'reviewer-1',
      extension: { publisherId: 'publisher-1', publisherEntity: { status: 'ACTIVE' } },
    });
    await service.appeal('version-1', 'Permission description updated', actor);
    expect(prisma.extensionReview.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ extensionVersionId: 'version-1', action: 'APPEALED', notes: 'Permission description updated' }),
    });
  });

  it('reports version adoption, validation failures, storage, and lifecycle activity', async () => {
    prisma.extension.findMany.mockResolvedValue([{
      id: 'ext-1', key: 'REWARDS', name: 'Rewards', publisherEntity: { key: 'WATTAMAN', status: 'ACTIVE' },
      records: [{ byteSize: 40, school: { id: 'school-a', name: 'School A', subdomain: 'a' } }],
      versions: [{
        id: 'version-1', version: '1.0.0', lifecycleStatus: 'PUBLISHED', publishedAt: new Date(), packageSize: 100,
        assets: [{ size: 25 }], validations: [{ status: 'PASSED' }, { status: 'FAILED' }],
        installations: [
          { enabled: true, school: { id: 'school-a', name: 'School A', subdomain: 'a' } },
          { enabled: false, school: { id: 'school-b', name: 'School B', subdomain: 'b' } },
        ],
      }],
    }]);
    prisma.auditLog.groupBy.mockResolvedValue([{ action: 'INSTALL', _count: { _all: 2 } }]);

    const result = await service.health();

    expect(result.totals).toEqual({ extensions: 1, versions: 1, activeInstallations: 1, storageBytes: 125, recordBytes: 40, failedValidations: 1 });
    expect(result.lifecycleActions).toEqual({ INSTALL: 2 });
    expect(result.versions[0].adoption.schools).toHaveLength(2);
    expect(result.schoolUsage).toEqual([expect.objectContaining({ school: expect.objectContaining({ id: 'school-a' }), recordBytes: 40, quotaBytes: 104857600 })]);
  });

  it('revokes a signing key and blocks every affected version and installation', async () => {
    prisma.extensionSigningKey.findUnique.mockResolvedValue({ id: 'key-1', keyId: 'wattaman-2026', publisherId: 'publisher-1', status: 'ACTIVE' });
    prisma.extensionSigningKey.update.mockResolvedValue({ id: 'key-1', keyId: 'wattaman-2026', publisherId: 'publisher-1', status: 'REVOKED' });
    prisma.extensionVersion.updateMany.mockResolvedValue({ count: 2 });

    await service.setSigningKeyStatus('key-1', 'REVOKED', actor);

    expect(prisma.extensionVersion.updateMany).toHaveBeenCalledWith({
      where: { signingKeyId: 'key-1', lifecycleStatus: { in: ['PUBLISHED', 'DEPRECATED'] } },
      data: { lifecycleStatus: 'BLOCKED' },
    });
    expect(prisma.extensionInstallation.updateMany).toHaveBeenCalledWith({
      where: { installedVersion: { signingKeyId: 'key-1' }, enabled: true },
      data: { enabled: false },
    });
  });

  it('rejects publication when required dependencies are unavailable', async () => {
    prisma.extensionVersion.findUnique.mockResolvedValue({
      id: 'version-1', extensionId: 'ext-1', version: '1.0.0', lifecycleStatus: 'APPROVED',
      packageStorageKey: 'quarantine/package.zip', packageChecksum: 'checksum',
      manifest: { dependencies: [{ key: 'MISSING_MODULE', optional: false }] },
      extension: { key: 'REPORTS_PLUS', publisherId: 'publisher-1', runtimeType: 'DECLARATIVE_MODULE', publisherEntity: { status: 'ACTIVE' } },
    });
    prisma.extension.findMany.mockResolvedValue([]);

    await expect(service.transition('version-1', 'PUBLISHED', undefined, actor)).rejects.toThrow('MISSING_MODULE');
    expect(signing.signForPublication).not.toHaveBeenCalled();
  });

  it('detects dependency cycles before publication', async () => {
    prisma.extensionVersion.findUnique.mockResolvedValue({
      id: 'version-a', extensionId: 'ext-a', version: '1.0.0', lifecycleStatus: 'APPROVED',
      packageStorageKey: 'quarantine/package.zip', packageChecksum: 'checksum',
      manifest: { dependencies: [{ key: 'MODULE_B', optional: false }] },
      extension: { key: 'MODULE_A', publisherId: 'publisher-1', runtimeType: 'DECLARATIVE_MODULE', publisherEntity: { status: 'ACTIVE' } },
    });
    prisma.extension.findMany.mockResolvedValue([{
      id: 'ext-b', key: 'MODULE_B', versions: [{ version: '1.0.0', manifest: { dependencies: [{ key: 'MODULE_A', optional: false }] } }],
    }]);

    await expect(service.transition('version-a', 'PUBLISHED', undefined, actor)).rejects.toThrow('cycle');
  });
});
