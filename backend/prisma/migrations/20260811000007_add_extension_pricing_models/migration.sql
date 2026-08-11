ALTER TABLE "Extension"
ADD COLUMN "pricingModel" TEXT NOT NULL DEFAULT 'FREE',
ADD COLUMN "priceMinor" INTEGER,
ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN "billingInterval" TEXT,
ADD COLUMN "contractReference" TEXT;

UPDATE "Extension"
SET
  "pricingModel" = CASE WHEN "price" IS NOT NULL AND "price" > 0 THEN 'ONE_TIME' ELSE 'FREE' END,
  "priceMinor" = CASE WHEN "price" IS NOT NULL AND "price" > 0 THEN ROUND("price" * 100)::INTEGER ELSE NULL END;

ALTER TABLE "ExtensionInstallation"
ADD COLUMN "requestPricingModel" TEXT,
ADD COLUMN "requestPriceMinor" INTEGER,
ADD COLUMN "requestCurrency" TEXT,
ADD COLUMN "requestBillingInterval" TEXT,
ADD COLUMN "requestContractReference" TEXT,
ADD COLUMN "requestPriceNote" TEXT;

UPDATE "ExtensionInstallation" AS installation
SET
  "requestPricingModel" = extension."pricingModel",
  "requestPriceMinor" = extension."priceMinor",
  "requestCurrency" = extension."currency",
  "requestBillingInterval" = extension."billingInterval",
  "requestContractReference" = extension."contractReference",
  "requestPriceNote" = extension."priceNote"
FROM "Extension" AS extension
WHERE extension.id = installation."extensionId";

ALTER TABLE "Extension"
ADD CONSTRAINT "Extension_pricing_model_check"
CHECK ("pricingModel" IN ('FREE', 'ONE_TIME', 'SUBSCRIPTION', 'PRIVATE_CONTRACT')),
ADD CONSTRAINT "Extension_currency_check"
CHECK ("currency" ~ '^[A-Z]{3}$'),
ADD CONSTRAINT "Extension_billing_interval_check"
CHECK ("billingInterval" IS NULL OR "billingInterval" IN ('MONTHLY', 'YEARLY')),
ADD CONSTRAINT "Extension_price_minor_check"
CHECK ("priceMinor" IS NULL OR "priceMinor" > 0),
ADD CONSTRAINT "Extension_pricing_shape_check"
CHECK (
  ("pricingModel" = 'FREE' AND "priceMinor" IS NULL AND "billingInterval" IS NULL AND "contractReference" IS NULL) OR
  ("pricingModel" = 'ONE_TIME' AND "priceMinor" IS NOT NULL AND "billingInterval" IS NULL AND "contractReference" IS NULL) OR
  ("pricingModel" = 'SUBSCRIPTION' AND "priceMinor" IS NOT NULL AND "billingInterval" IN ('MONTHLY', 'YEARLY') AND "contractReference" IS NULL) OR
  ("pricingModel" = 'PRIVATE_CONTRACT' AND "priceMinor" IS NULL AND "billingInterval" IS NULL AND NULLIF(BTRIM("contractReference"), '') IS NOT NULL)
);

ALTER TABLE "ExtensionInstallation"
ADD CONSTRAINT "ExtensionInstallation_request_pricing_model_check"
CHECK ("requestPricingModel" IS NULL OR "requestPricingModel" IN ('FREE', 'ONE_TIME', 'SUBSCRIPTION', 'PRIVATE_CONTRACT')),
ADD CONSTRAINT "ExtensionInstallation_request_currency_check"
CHECK ("requestCurrency" IS NULL OR "requestCurrency" ~ '^[A-Z]{3}$'),
ADD CONSTRAINT "ExtensionInstallation_request_price_minor_check"
CHECK ("requestPriceMinor" IS NULL OR "requestPriceMinor" > 0),
ADD CONSTRAINT "ExtensionInstallation_request_pricing_shape_check"
CHECK (
  "requestPricingModel" IS NULL OR
  ("requestPricingModel" = 'FREE' AND "requestPriceMinor" IS NULL AND "requestBillingInterval" IS NULL AND "requestContractReference" IS NULL) OR
  ("requestPricingModel" = 'ONE_TIME' AND "requestPriceMinor" IS NOT NULL AND "requestBillingInterval" IS NULL AND "requestContractReference" IS NULL) OR
  ("requestPricingModel" = 'SUBSCRIPTION' AND "requestPriceMinor" IS NOT NULL AND "requestBillingInterval" IN ('MONTHLY', 'YEARLY') AND "requestContractReference" IS NULL) OR
  ("requestPricingModel" = 'PRIVATE_CONTRACT' AND "requestPriceMinor" IS NULL AND "requestBillingInterval" IS NULL AND NULLIF(BTRIM("requestContractReference"), '') IS NOT NULL)
);
