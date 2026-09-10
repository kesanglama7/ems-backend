-- CreateEnum
CREATE TYPE "EmployeeRequestCategory" AS ENUM ('ATTENDANCE_CORRECTION', 'PROFILE_UPDATE', 'DOCUMENT', 'LEAVE', 'PAYROLL', 'TECHNICAL_SUPPORT', 'WORKPLACE_CONCERN', 'GENERAL_QUESTION', 'OTHER');

-- CreateEnum
CREATE TYPE "EmployeeRequestStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EmployeeRequestPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'EMPLOYEE_REQUEST_CREATED';
ALTER TYPE "NotificationType" ADD VALUE 'EMPLOYEE_REQUEST_REPLIED';
ALTER TYPE "NotificationType" ADD VALUE 'EMPLOYEE_REQUEST_STATUS_CHANGED';
ALTER TYPE "NotificationType" ADD VALUE 'EMPLOYEE_REQUEST_ASSIGNED';

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "employeeRequestId" TEXT;

-- CreateTable
CREATE TABLE "EmployeeRequest" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "category" "EmployeeRequestCategory" NOT NULL,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "EmployeeRequestStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "EmployeeRequestPriority" NOT NULL DEFAULT 'NORMAL',
    "attendanceId" TEXT,
    "assignedAdminId" TEXT,
    "resolvedByAdminId" TEXT,
    "resolutionNote" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeRequestMessage" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "senderUserId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeRequestMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmployeeRequest_employeeId_status_idx" ON "EmployeeRequest"("employeeId", "status");

-- CreateIndex
CREATE INDEX "EmployeeRequest_category_status_idx" ON "EmployeeRequest"("category", "status");

-- CreateIndex
CREATE INDEX "EmployeeRequest_assignedAdminId_status_idx" ON "EmployeeRequest"("assignedAdminId", "status");

-- CreateIndex
CREATE INDEX "EmployeeRequest_createdAt_idx" ON "EmployeeRequest"("createdAt");

-- CreateIndex
CREATE INDEX "EmployeeRequestMessage_requestId_createdAt_idx" ON "EmployeeRequestMessage"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "EmployeeRequestMessage_senderUserId_idx" ON "EmployeeRequestMessage"("senderUserId");

-- CreateIndex
CREATE INDEX "Notification_employeeRequestId_idx" ON "Notification"("employeeRequestId");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_employeeRequestId_fkey" FOREIGN KEY ("employeeRequestId") REFERENCES "EmployeeRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeRequest" ADD CONSTRAINT "EmployeeRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeRequest" ADD CONSTRAINT "EmployeeRequest_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "Attendance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeRequestMessage" ADD CONSTRAINT "EmployeeRequestMessage_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "EmployeeRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
