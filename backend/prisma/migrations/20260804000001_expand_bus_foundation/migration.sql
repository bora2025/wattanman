ALTER TABLE "Bus"
ADD COLUMN "assistantId" TEXT,
ADD COLUMN "make" TEXT,
ADD COLUMN "model" TEXT,
ADD COLUMN "year" INTEGER,
ADD COLUMN "color" TEXT,
ADD COLUMN "accessible" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "gpsDeviceId" TEXT,
ADD COLUMN "statusReason" TEXT,
ADD COLUMN "lastServiceAt" TIMESTAMP(3),
ADD COLUMN "nextServiceAt" TIMESTAMP(3);

UPDATE "Bus" AS bus
SET "driverId" = NULL
WHERE "driverId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "User" AS driver
    WHERE driver."id" = bus."driverId"
      AND driver."schoolId" = bus."schoolId"
  );

ALTER TABLE "BusRoute"
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'DRAFT',
ADD COLUMN "direction" TEXT NOT NULL DEFAULT 'BOTH',
ADD COLUMN "effectiveFrom" TIMESTAMP(3),
ADD COLUMN "effectiveTo" TIMESTAMP(3),
ADD COLUMN "distanceMeters" INTEGER,
ADD COLUMN "durationSeconds" INTEGER,
ADD COLUMN "routeGeometry" JSONB,
ADD COLUMN "geometryProvider" TEXT;

ALTER TABLE "BusStop"
ADD COLUMN "pickupTime" TEXT,
ADD COLUMN "dropoffTime" TEXT,
ADD COLUMN "dwellSeconds" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN "geofenceRadiusMeters" INTEGER NOT NULL DEFAULT 150,
ADD COLUMN "instructions" TEXT;

CREATE TABLE "BusStudentAssignment" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "busId" TEXT,
  "routeId" TEXT NOT NULL,
  "pickupStopId" TEXT,
  "dropoffStopId" TEXT,
  "direction" TEXT NOT NULL DEFAULT 'BOTH',
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "handoffPolicy" TEXT NOT NULL DEFAULT 'GUARDIAN',
  "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effectiveTo" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BusStudentAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BusSchedule" (
  "id" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "routeId" TEXT NOT NULL,
  "busId" TEXT,
  "name" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "departureTime" TEXT NOT NULL,
  "weekdays" TEXT[],
  "effectiveFrom" TIMESTAMP(3) NOT NULL,
  "effectiveTo" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BusSchedule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Bus_schoolId_gpsDeviceId_key" ON "Bus"("schoolId", "gpsDeviceId");
CREATE INDEX "Bus_driverId_idx" ON "Bus"("driverId");
CREATE INDEX "Bus_assistantId_idx" ON "Bus"("assistantId");
CREATE INDEX "Bus_routeId_idx" ON "Bus"("routeId");
CREATE INDEX "BusStop_routeId_order_idx" ON "BusStop"("routeId", "order");
CREATE INDEX "BusStudentAssignment_schoolId_status_idx" ON "BusStudentAssignment"("schoolId", "status");
CREATE INDEX "BusStudentAssignment_studentId_status_idx" ON "BusStudentAssignment"("studentId", "status");
CREATE INDEX "BusStudentAssignment_routeId_direction_idx" ON "BusStudentAssignment"("routeId", "direction");
CREATE INDEX "BusStudentAssignment_busId_status_idx" ON "BusStudentAssignment"("busId", "status");
CREATE INDEX "BusSchedule_schoolId_status_idx" ON "BusSchedule"("schoolId", "status");
CREATE INDEX "BusSchedule_routeId_status_idx" ON "BusSchedule"("routeId", "status");
CREATE INDEX "BusSchedule_busId_status_idx" ON "BusSchedule"("busId", "status");

ALTER TABLE "Bus" ADD CONSTRAINT "Bus_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Bus" ADD CONSTRAINT "Bus_assistantId_fkey" FOREIGN KEY ("assistantId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BusStudentAssignment" ADD CONSTRAINT "BusStudentAssignment_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BusStudentAssignment" ADD CONSTRAINT "BusStudentAssignment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BusStudentAssignment" ADD CONSTRAINT "BusStudentAssignment_busId_fkey" FOREIGN KEY ("busId") REFERENCES "Bus"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BusStudentAssignment" ADD CONSTRAINT "BusStudentAssignment_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "BusRoute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BusStudentAssignment" ADD CONSTRAINT "BusStudentAssignment_pickupStopId_fkey" FOREIGN KEY ("pickupStopId") REFERENCES "BusStop"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BusStudentAssignment" ADD CONSTRAINT "BusStudentAssignment_dropoffStopId_fkey" FOREIGN KEY ("dropoffStopId") REFERENCES "BusStop"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BusSchedule" ADD CONSTRAINT "BusSchedule_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BusSchedule" ADD CONSTRAINT "BusSchedule_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "BusRoute"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BusSchedule" ADD CONSTRAINT "BusSchedule_busId_fkey" FOREIGN KEY ("busId") REFERENCES "Bus"("id") ON DELETE SET NULL ON UPDATE CASCADE;
