-- Additive migration: existing leave types remain unlimited and existing requests remain valid.
ALTER TYPE "LeaveStatus" ADD VALUE IF NOT EXISTS 'AUTO_REJECTED';

CREATE TYPE "LeaveDuration" AS ENUM ('FULL_DAY', 'FIRST_HALF', 'SECOND_HALF');
CREATE TYPE "LeaveSource" AS ENUM ('EMPLOYEE', 'ADMIN');
CREATE TYPE "NotificationType" AS ENUM ('LEAVE_REQUESTED', 'LEAVE_APPROVED', 'LEAVE_REJECTED', 'LEAVE_AUTO_REJECTED', 'LEAVE_CANCELLED', 'LEAVE_REMINDER', 'LEAVE_CREATED_BY_ADMIN');

ALTER TABLE "LeaveType"
  ADD COLUMN "yearlyAllowance" DECIMAL(6,2) NOT NULL DEFAULT 0,
  ADD COLUMN "hasLimitedBalance" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "allowHalfDay" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "isEmployeeRequestable" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "isPaid" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "isSystem" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "LeaveRequest"
  ADD COLUMN "duration" "LeaveDuration" NOT NULL DEFAULT 'FULL_DAY',
  ADD COLUMN "requestedDays" DECIMAL(6,2) NOT NULL DEFAULT 1,
  ADD COLUMN "source" "LeaveSource" NOT NULL DEFAULT 'EMPLOYEE',
  ADD COLUMN "reviewDeadlineAt" TIMESTAMP(3),
  ADD COLUMN "reminderSentAt" TIMESTAMP(3),
  ADD COLUMN "autoRejectedAt" TIMESTAMP(3),
  ADD COLUMN "createdByUserId" TEXT;

-- Preserve historical ranges with a safe inclusive calendar-day value.
-- The idempotent backfill script later recalculates current records with office working days.
UPDATE "LeaveRequest"
SET "requestedDays" = GREATEST(1, ("endDate"::date - "startDate"::date) + 1);

CREATE TABLE "EmployeeLeaveBalance" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "leaveTypeId" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "totalDays" DECIMAL(6,2) NOT NULL DEFAULT 0,
  "usedDays" DECIMAL(6,2) NOT NULL DEFAULT 0,
  "pendingDays" DECIMAL(6,2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmployeeLeaveBalance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LeaveBalanceAdjustment" (
  "id" TEXT NOT NULL,
  "employeeLeaveBalanceId" TEXT NOT NULL,
  "adjustmentDays" DECIMAL(6,2) NOT NULL,
  "reason" TEXT NOT NULL,
  "adminUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeaveBalanceAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Notification" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "NotificationType" NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "leaveRequestId" TEXT,
  "isRead" BOOLEAN NOT NULL DEFAULT false,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EmployeeLeaveBalance_employeeId_leaveTypeId_year_key" ON "EmployeeLeaveBalance"("employeeId", "leaveTypeId", "year");
CREATE INDEX "EmployeeLeaveBalance_employeeId_year_idx" ON "EmployeeLeaveBalance"("employeeId", "year");
CREATE INDEX "LeaveBalanceAdjustment_employeeLeaveBalanceId_idx" ON "LeaveBalanceAdjustment"("employeeLeaveBalanceId");
CREATE INDEX "LeaveBalanceAdjustment_adminUserId_idx" ON "LeaveBalanceAdjustment"("adminUserId");
CREATE INDEX "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId", "createdAt");
CREATE INDEX "LeaveRequest_employeeId_startDate_endDate_idx" ON "LeaveRequest"("employeeId", "startDate", "endDate");
CREATE INDEX "LeaveRequest_status_reviewDeadlineAt_idx" ON "LeaveRequest"("status", "reviewDeadlineAt");

ALTER TABLE "EmployeeLeaveBalance" ADD CONSTRAINT "EmployeeLeaveBalance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmployeeLeaveBalance" ADD CONSTRAINT "EmployeeLeaveBalance_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LeaveBalanceAdjustment" ADD CONSTRAINT "LeaveBalanceAdjustment_employeeLeaveBalanceId_fkey" FOREIGN KEY ("employeeLeaveBalanceId") REFERENCES "EmployeeLeaveBalance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_leaveRequestId_fkey" FOREIGN KEY ("leaveRequestId") REFERENCES "LeaveRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
