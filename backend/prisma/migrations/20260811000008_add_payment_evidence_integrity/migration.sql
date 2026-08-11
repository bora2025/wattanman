ALTER TABLE "ExtensionInstallation"
ADD COLUMN "invoiceSize" INTEGER,
ADD COLUMN "invoiceChecksum" TEXT;

ALTER TABLE "ExtensionInstallation"
ADD CONSTRAINT "ExtensionInstallation_invoice_size_check"
CHECK ("invoiceSize" IS NULL OR ("invoiceSize" > 0 AND "invoiceSize" <= 5242880)),
ADD CONSTRAINT "ExtensionInstallation_invoice_checksum_check"
CHECK ("invoiceChecksum" IS NULL OR "invoiceChecksum" ~ '^[a-f0-9]{64}$');
