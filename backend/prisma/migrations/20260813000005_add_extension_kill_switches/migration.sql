CREATE TABLE "ExtensionKillSwitch" (
  "id" TEXT NOT NULL,
  "scopeType" TEXT NOT NULL,
  "scopeId" TEXT NOT NULL,
  "capability" TEXT NOT NULL DEFAULT '',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "reason" TEXT NOT NULL,
  "activatedBy" TEXT,
  "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deactivatedBy" TEXT,
  "deactivatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExtensionKillSwitch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ExtensionKillSwitch_scopeType_check" CHECK ("scopeType" IN ('PUBLISHER','EXTENSION','VERSION','SCHOOL','CAPABILITY')),
  CONSTRAINT "ExtensionKillSwitch_shape_check" CHECK (("scopeType"='CAPABILITY') = ("capability"<>''))
);

CREATE UNIQUE INDEX "ExtensionKillSwitch_scopeType_scopeId_capability_key" ON "ExtensionKillSwitch"("scopeType", "scopeId", "capability");
CREATE INDEX "ExtensionKillSwitch_active_scopeType_scopeId_idx" ON "ExtensionKillSwitch"("active", "scopeType", "scopeId");
