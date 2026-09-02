-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('OPEN', 'COMPLETED', 'MISSING_CHECKOUT');

-- CreateEnum
CREATE TYPE "AttendanceSource" AS ENUM ('EMPLOYEE', 'ADMIN');

-- CreateEnum
CREATE TYPE "AttendanceAuditAction" AS ENUM ('ADMIN_CREATE', 'ADMIN_UPDATE');

-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN     "afterHoursMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "checkInAccuracyMeters" DOUBLE PRECISION,
ADD COLUMN     "checkInDistanceMeters" DOUBLE PRECISION,
ADD COLUMN     "checkInLatitude" DOUBLE PRECISION,
ADD COLUMN     "checkInLongitude" DOUBLE PRECISION,
ADD COLUMN     "checkOutAccuracyMeters" DOUBLE PRECISION,
ADD COLUMN     "checkOutDistanceMeters" DOUBLE PRECISION,
ADD COLUMN     "checkOutLatitude" DOUBLE PRECISION,
ADD COLUMN     "checkOutLongitude" DOUBLE PRECISION,
ADD COLUMN     "earlyMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "gracePeriodMinutesSnapshot" INTEGER,
ADD COLUMN     "lateMinutes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "officeLatitudeSnapshot" DOUBLE PRECISION,
ADD COLUMN     "officeLongitudeSnapshot" DOUBLE PRECISION,
ADD COLUMN     "officeRadiusMetersSnapshot" INTEGER,
ADD COLUMN     "officeTimezoneSnapshot" TEXT,
ADD COLUMN     "overtimeMinutes" INTEGER,
ADD COLUMN     "scheduledEndAt" TIMESTAMP(3),
ADD COLUMN     "scheduledMinutes" INTEGER,
ADD COLUMN     "scheduledStartAt" TIMESTAMP(3),
ADD COLUMN     "source" "AttendanceSource" NOT NULL DEFAULT 'EMPLOYEE',
ADD COLUMN     "status" "AttendanceStatus" NOT NULL DEFAULT 'OPEN',
ADD COLUMN     "workModeSnapshot" "EmployeeWorkMode";

-- CreateTable
CREATE TABLE "AttendanceAudit" (
    "id" TEXT NOT NULL,
    "attendanceId" TEXT NOT NULL,
    "adminUserId" TEXT NOT NULL,
    "action" "AttendanceAuditAction" NOT NULL,
    "reason" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttendanceAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttendanceAudit_attendanceId_idx" ON "AttendanceAudit"("attendanceId");

-- CreateIndex
CREATE INDEX "AttendanceAudit_adminUserId_idx" ON "AttendanceAudit"("adminUserId");

-- CreateIndex
CREATE INDEX "Attendance_employeeId_idx" ON "Attendance"("employeeId");

-- CreateIndex
CREATE INDEX "Attendance_workDate_idx" ON "Attendance"("workDate");

-- CreateIndex
CREATE INDEX "Attendance_status_idx" ON "Attendance"("status");

-- AddForeignKey
ALTER TABLE "AttendanceAudit" ADD CONSTRAINT "AttendanceAudit_attendanceId_fkey" FOREIGN KEY ("attendanceId") REFERENCES "Attendance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
