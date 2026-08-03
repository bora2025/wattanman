import { BadRequestException, ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createHash, createPrivateKey, createPublicKey, sign, verify } from 'crypto';
import { PrismaService } from '../database/prisma.service';
import { R2StorageService } from '../storage/r2-storage.service';

interface SignableVersion {
  id: string;
  extensionId: string;
  packageStorageKey: string | null;
  packageChecksum: string | null;
  packageSignature?: string | null;
  signingKeyId?: string | null;
  signingKey?: { status: string; publicKeyPem: string } | null;
}

@Injectable()
export class ExtensionSigningService {
  constructor(private prisma: PrismaService, private storage: R2StorageService) {}

  async signForPublication(version: SignableVersion, publisherId: string) {
    if (!version.packageStorageKey || !version.packageChecksum) throw new ConflictException('Package artifact is required for signing');
    const configuredKeyId = process.env.EXTENSION_SIGNING_KEY_ID?.trim();
    const privateKeyBase64 = process.env.EXTENSION_SIGNING_PRIVATE_KEY_BASE64?.trim();
    if (!configuredKeyId || !privateKeyBase64) throw new ServiceUnavailableException('Extension package signing is not configured');
    const signingKey = await this.prisma.extensionSigningKey.findFirst({
      where: { keyId: configuredKeyId, publisherId, status: 'ACTIVE' },
    });
    if (!signingKey) throw new ServiceUnavailableException('Configured extension signing key is not active for this publisher');
    const packageContents = await this.storage.getPrivate(version.packageStorageKey);
    this.assertChecksum(packageContents, version.packageChecksum);
    let privateKey;
    try {
      privateKey = createPrivateKey(Buffer.from(privateKeyBase64, 'base64').toString('utf8'));
    } catch {
      throw new ServiceUnavailableException('Extension signing private key is invalid');
    }
    const signature = sign(null, packageContents, privateKey).toString('base64');
    if (!verify(null, packageContents, createPublicKey(signingKey.publicKeyPem), Buffer.from(signature, 'base64'))) {
      throw new ServiceUnavailableException('Configured private key does not match the registered public key');
    }
    return { signingKeyId: signingKey.id, packageSignature: signature, signedAt: new Date() };
  }

  async verifyPublished(version: SignableVersion) {
    if (!version.packageStorageKey || !version.packageChecksum || !version.packageSignature || !version.signingKeyId || !version.signingKey) {
      throw new ConflictException('Published package is unsigned');
    }
    if (version.signingKey.status === 'REVOKED') throw new ConflictException('Package signing key has been revoked');
    const packageContents = await this.storage.getPrivate(version.packageStorageKey);
    this.assertChecksum(packageContents, version.packageChecksum);
    let valid = false;
    try {
      valid = verify(
        null,
        packageContents,
        createPublicKey(version.signingKey.publicKeyPem),
        Buffer.from(version.packageSignature, 'base64'),
      );
    } catch {
      valid = false;
    }
    if (!valid) throw new ConflictException('Package signature verification failed');
    return true;
  }

  validatePublicKey(publicKeyPem: string) {
    try {
      const key = createPublicKey(publicKeyPem);
      if (key.asymmetricKeyType !== 'ed25519') throw new Error('wrong key type');
    } catch {
      throw new BadRequestException('publicKeyPem must contain a valid Ed25519 public key');
    }
  }

  private assertChecksum(contents: Buffer, expected: string) {
    const actual = createHash('sha256').update(contents).digest('hex');
    if (actual !== expected) throw new ConflictException('Published package checksum verification failed');
  }
}
