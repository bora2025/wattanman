CREATE TABLE "ExtensionSigningKey" (
    "id" TEXT NOT NULL,
    "publisherId" TEXT NOT NULL,
    "keyId" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL DEFAULT 'Ed25519',
    "publicKeyPem" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retiredAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "ExtensionSigningKey_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ExtensionVersion" ADD COLUMN "signingKeyId" TEXT;
ALTER TABLE "ExtensionVersion" ADD COLUMN "packageSignature" TEXT;
ALTER TABLE "ExtensionVersion" ADD COLUMN "signedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "ExtensionSigningKey_keyId_key" ON "ExtensionSigningKey"("keyId");
CREATE INDEX "ExtensionSigningKey_publisherId_status_idx" ON "ExtensionSigningKey"("publisherId", "status");
CREATE INDEX "ExtensionVersion_signingKeyId_idx" ON "ExtensionVersion"("signingKeyId");

ALTER TABLE "ExtensionSigningKey" ADD CONSTRAINT "ExtensionSigningKey_publisherId_fkey"
    FOREIGN KEY ("publisherId") REFERENCES "ExtensionPublisher"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExtensionVersion" ADD CONSTRAINT "ExtensionVersion_signingKeyId_fkey"
    FOREIGN KEY ("signingKeyId") REFERENCES "ExtensionSigningKey"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
