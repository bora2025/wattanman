import { ConflictException } from '@nestjs/common';
import { createHash, generateKeyPairSync } from 'crypto';
import { ExtensionSigningService } from './extension-signing.service';

describe('ExtensionSigningService', () => {
  const prisma = { extensionSigningKey: { findFirst: jest.fn() } };
  const storage = { getPrivate: jest.fn() };
  const service = new ExtensionSigningService(prisma as any, storage as any);
  const keys = generateKeyPairSync('ed25519');
  const privateKeyPem = keys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const publicKeyPem = keys.publicKey.export({ type: 'spki', format: 'pem' }).toString();

  it('normalizes a public PEM flattened by a browser prompt', () => {
    const flattened = publicKeyPem.replace(/\r?\n/g, ' ');
    expect(service.normalizePublicKey(flattened)).toBe(publicKeyPem.trim());
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.EXTENSION_SIGNING_KEY_ID = 'wattaman-test-1';
    process.env.EXTENSION_SIGNING_PRIVATE_KEY_BASE64 = Buffer.from(privateKeyPem).toString('base64');
  });

  afterAll(() => {
    delete process.env.EXTENSION_SIGNING_KEY_ID;
    delete process.env.EXTENSION_SIGNING_PRIVATE_KEY_BASE64;
  });

  it('signs and verifies the exact checksum-addressed package bytes', async () => {
    const contents = Buffer.from('signed extension package');
    const checksum = createHash('sha256').update(contents).digest('hex');
    prisma.extensionSigningKey.findFirst.mockResolvedValue({ id: 'key-row-1', publicKeyPem, status: 'ACTIVE' });
    storage.getPrivate.mockResolvedValue(contents);
    const version = { id: 'version-1', extensionId: 'extension-1', packageStorageKey: 'quarantine/package.zip', packageChecksum: checksum };

    const signed = await service.signForPublication(version, 'publisher-1');
    await expect(service.verifyPublished({
      ...version,
      packageStorageKey: 'published/package.zip',
      ...signed,
      signingKey: { status: 'ACTIVE', publicKeyPem },
    })).resolves.toBe(true);
    await expect(service.verifyPublished({
      ...version,
      packageStorageKey: 'published/package.zip',
      ...signed,
      signingKey: { status: 'RETIRED', publicKeyPem },
    })).resolves.toBe(true);

    expect(signed.packageSignature).toBeTruthy();
    expect(prisma.extensionSigningKey.findFirst).toHaveBeenCalledWith({
      where: { keyId: 'wattaman-test-1', publisherId: 'publisher-1', status: 'ACTIVE' },
    });
  });

  it('rejects tampered package bytes and revoked keys', async () => {
    const contents = Buffer.from('original');
    const checksum = createHash('sha256').update(contents).digest('hex');
    prisma.extensionSigningKey.findFirst.mockResolvedValue({ id: 'key-row-1', publicKeyPem, status: 'ACTIVE' });
    storage.getPrivate.mockResolvedValue(contents);
    const version = { id: 'version-1', extensionId: 'extension-1', packageStorageKey: 'package.zip', packageChecksum: checksum };
    const signed = await service.signForPublication(version, 'publisher-1');

    storage.getPrivate.mockResolvedValue(Buffer.from('tampered'));
    await expect(service.verifyPublished({ ...version, ...signed, signingKey: { status: 'ACTIVE', publicKeyPem } }))
      .rejects.toThrow('checksum verification failed');
    storage.getPrivate.mockResolvedValue(contents);
    await expect(service.verifyPublished({ ...version, ...signed, signingKey: { status: 'REVOKED', publicKeyPem } }))
      .rejects.toThrow(ConflictException);
  });
});
