-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "LeaveAudience" AS ENUM ('ALL', 'SELECTED');

-- AlterEnum
ALTER TYPE "NotificationCategory" ADD VALUE 'RESOURCE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'ATTENDANCE_EARLY_CHECKOUT';
ALTER TYPE "NotificationType" ADD VALUE 'RESOURCE_RETURN_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE 'RESOURCE_ASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE 'RESOURCE_RETURNED';

-- AlterEnum
ALTER TYPE "NotificationEntityType" ADD VALUE 'RESOURCE_ASSIGNMENT';

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "birthdayDismissedYear" INTEGER,
ADD COLUMN     "dateOfBirth" DATE,
ADD COLUMN     "gender" "Gender";

-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN     "earlyCheckoutMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "isEarlyCheckout" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "LeaveType" ADD COLUMN     "audience" "LeaveAudience" NOT NULL DEFAULT 'ALL',
ADD COLUMN     "eligibleGender" "Gender";

-- AlterTable
ALTER TABLE "EmployeeRequest" ADD COLUMN     "requestCategoryId" TEXT,
ADD COLUMN     "resourceId" TEXT,
ADD COLUMN     "resourceQuantity" INTEGER;

-- CreateTable
CREATE TABLE "LeaveTypeAssignment" (
    "employeeId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "assignedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeaveTypeAssignment_pkey" PRIMARY KEY ("employeeId","leaveTypeId")
);

-- CreateTable
CREATE TABLE "OfficeHoliday" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "date" DATE NOT NULL,
    "description" VARCHAR(1000),
    "isOfficeClosed" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfficeHoliday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestCategory" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "legacyCategory" "EmployeeRequestCategory",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RequestCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestAttachment" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "bucket" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resource" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "description" VARCHAR(1000),
    "totalQuantity" INTEGER NOT NULL,
    "availableQuantity" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Resource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourceAssignment" (
    "id" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "assetTag" VARCHAR(100),
    "note" VARCHAR(1000),
    "assignedByUserId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "returnRequestedAt" TIMESTAMP(3),
    "returnRequestedByUserId" TEXT,
    "returnRequestNote" VARCHAR(1000),
    "returnedAt" TIMESTAMP(3),
    "returnedByUserId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResourceAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OfficeHoliday_date_key" ON "OfficeHoliday"("date");

-- CreateIndex
CREATE UNIQUE INDEX "RequestCategory_name_key" ON "RequestCategory"("name");

-- CreateIndex
CREATE UNIQUE INDEX "RequestCategory_legacyCategory_key" ON "RequestCategory"("legacyCategory");

-- CreateIndex
CREATE UNIQUE INDEX "RequestAttachment_storagePath_key" ON "RequestAttachment"("storagePath");

-- CreateIndex
CREATE INDEX "RequestAttachment_requestId_idx" ON "RequestAttachment"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "Resource_name_key" ON "Resource"("name");

-- CreateIndex
CREATE INDEX "ResourceAssignment_employeeId_returnedAt_idx" ON "ResourceAssignment"("employeeId", "returnedAt");

-- CreateIndex
CREATE INDEX "ResourceAssignment_resourceId_returnedAt_idx" ON "ResourceAssignment"("resourceId", "returnedAt");

-- AddForeignKey
ALTER TABLE "EmployeeRequest" ADD CONSTRAINT "EmployeeRequest_requestCategoryId_fkey" FOREIGN KEY ("requestCategoryId") REFERENCES "RequestCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeRequest" ADD CONSTRAINT "EmployeeRequest_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveTypeAssignment" ADD CONSTRAINT "LeaveTypeAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveTypeAssignment" ADD CONSTRAINT "LeaveTypeAssignment_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestAttachment" ADD CONSTRAINT "RequestAttachment_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "EmployeeRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceAssignment" ADD CONSTRAINT "ResourceAssignment_resourceId_fkey" FOREIGN KEY ("resourceId") REFERENCES "Resource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResourceAssignment" ADD CONSTRAINT "ResourceAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Preserve existing requests while introducing managed categories.
INSERT INTO "RequestCategory" ("id", "name", "legacyCategory", "updatedAt")
SELECT gen_random_uuid()::text, initcap(replace(value::text, '_', ' ')), value, CURRENT_TIMESTAMP
FROM unnest(enum_range(NULL::"EmployeeRequestCategory")) AS value;
UPDATE "EmployeeRequest" r SET "requestCategoryId" = c."id"
FROM "RequestCategory" c WHERE c."legacyCategory" = r."category";
INSERT INTO "RequestCategory" ("id", "name", "description", "updatedAt") VALUES
(gen_random_uuid()::text, 'Resource Request', 'Request office equipment or supplies.', CURRENT_TIMESTAMP),
(gen_random_uuid()::text, 'Expense Reimbursement', 'Request repayment of office expenses with optional bill photos.', CURRENT_TIMESTAMP);

-- Existing employees receive persisted balances immediately. Preserve prior adjustments/usage.
INSERT INTO "EmployeeLeaveBalance" ("id", "employeeId", "leaveTypeId", "year", "totalDays", "usedDays", "pendingDays", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, e."id", t."id",
  EXTRACT(YEAR FROM CURRENT_TIMESTAMP AT TIME ZONE COALESCE((SELECT "timezone" FROM "OfficeSetting" ORDER BY "createdAt" LIMIT 1), 'Asia/Kathmandu'))::integer,
  t."yearlyAllowance",
  COALESCE((SELECT SUM(r."requestedDays") FROM "LeaveRequest" r WHERE r."employeeId" = e."id" AND r."leaveTypeId" = t."id" AND r."status" = 'APPROVED' AND EXTRACT(YEAR FROM r."startDate") = EXTRACT(YEAR FROM CURRENT_TIMESTAMP AT TIME ZONE COALESCE((SELECT "timezone" FROM "OfficeSetting" ORDER BY "createdAt" LIMIT 1), 'Asia/Kathmandu'))), 0),
  COALESCE((SELECT SUM(r."requestedDays") FROM "LeaveRequest" r WHERE r."employeeId" = e."id" AND r."leaveTypeId" = t."id" AND r."status" = 'PENDING' AND EXTRACT(YEAR FROM r."startDate") = EXTRACT(YEAR FROM CURRENT_TIMESTAMP AT TIME ZONE COALESCE((SELECT "timezone" FROM "OfficeSetting" ORDER BY "createdAt" LIMIT 1), 'Asia/Kathmandu'))), 0),
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Employee" e CROSS JOIN "LeaveType" t
WHERE t."isActive" = true
ON CONFLICT ("employeeId", "leaveTypeId", "year") DO NOTHING;

-- Historical early checkouts are calculated from each record's schedule snapshot.
UPDATE "Attendance" SET
  "isEarlyCheckout" = "checkOutAt" < "scheduledEndAt",
  "earlyCheckoutMinutes" = GREATEST(0, CEIL(EXTRACT(EPOCH FROM ("scheduledEndAt" - "checkOutAt")) / 60)::integer)
WHERE "checkOutAt" IS NOT NULL AND "scheduledEndAt" IS NOT NULL;

ALTER TABLE "Resource" ADD CONSTRAINT "Resource_quantity_check" CHECK ("totalQuantity" >= 0 AND "availableQuantity" >= 0 AND "availableQuantity" <= "totalQuantity");
ALTER TABLE "ResourceAssignment" ADD CONSTRAINT "ResourceAssignment_quantity_check" CHECK ("quantity" > 0);
ALTER TABLE "EmployeeRequest" ADD CONSTRAINT "EmployeeRequest_resource_check" CHECK (("resourceId" IS NULL AND "resourceQuantity" IS NULL) OR ("resourceId" IS NOT NULL AND "resourceQuantity" IS NOT NULL AND "resourceQuantity" > 0));
CREATE UNIQUE INDEX "ResourceAssignment_active_asset_tag_key" ON "ResourceAssignment" ("assetTag") WHERE "returnedAt" IS NULL AND "assetTag" IS NOT NULL;
