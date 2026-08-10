CREATE TABLE "ExtensionPaymentSetting" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "bankName" TEXT,
  "accountName" TEXT,
  "accountNumber" TEXT,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "instructions" TEXT,
  "qrStorageKey" TEXT,
  "qrContentType" TEXT,
  "qrFileName" TEXT,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExtensionPaymentSetting_pkey" PRIMARY KEY ("id")
);
