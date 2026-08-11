ALTER TABLE "ExtensionPaymentSetting"
ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "ExtensionPaymentSettingHistory" (
  "id" TEXT NOT NULL,
  "settingId" TEXT NOT NULL DEFAULT 'default',
  "version" INTEGER NOT NULL,
  "bankName" TEXT,
  "accountName" TEXT,
  "accountNumber" TEXT,
  "currency" TEXT NOT NULL,
  "instructions" TEXT,
  "qrStorageKey" TEXT,
  "qrContentType" TEXT,
  "qrFileName" TEXT,
  "actorId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExtensionPaymentSettingHistory_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExtensionPaymentSettingHistory_settingId_fkey"
    FOREIGN KEY ("settingId") REFERENCES "ExtensionPaymentSetting"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ExtensionPaymentSettingHistory_settingId_version_key"
ON "ExtensionPaymentSettingHistory"("settingId", "version");
CREATE INDEX "ExtensionPaymentSettingHistory_settingId_createdAt_idx"
ON "ExtensionPaymentSettingHistory"("settingId", "createdAt");

UPDATE "ExtensionPaymentSetting" SET "version" = 1;

INSERT INTO "ExtensionPaymentSettingHistory" (
  "id", "settingId", "version", "bankName", "accountName", "accountNumber",
  "currency", "instructions", "qrStorageKey", "qrContentType", "qrFileName",
  "actorId", "createdAt"
)
SELECT
  'payment-setting-history-' || "id", "id", 1, "bankName", "accountName",
  "accountNumber", "currency", "instructions", "qrStorageKey", "qrContentType",
  "qrFileName", "updatedBy", "updatedAt"
FROM "ExtensionPaymentSetting";

ALTER TABLE "ExtensionPaymentSetting"
ADD CONSTRAINT "ExtensionPaymentSetting_version_check" CHECK ("version" >= 0);
ALTER TABLE "ExtensionPaymentSettingHistory"
ADD CONSTRAINT "ExtensionPaymentSettingHistory_version_check" CHECK ("version" > 0),
ADD CONSTRAINT "ExtensionPaymentSettingHistory_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$');
