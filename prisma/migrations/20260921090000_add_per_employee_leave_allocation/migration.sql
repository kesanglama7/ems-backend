-- A SELECTED leave type can grant a different yearly balance to each employee.
ALTER TABLE "LeaveTypeAssignment"
ADD COLUMN "assignedDays" DECIMAL(6,2);

-- Preserve the previous behaviour for assignments that already exist.
UPDATE "LeaveTypeAssignment" AS assignment
SET "assignedDays" = leave_type."yearlyAllowance"
FROM "LeaveType" AS leave_type
WHERE leave_type."id" = assignment."leaveTypeId";

ALTER TABLE "LeaveTypeAssignment"
ALTER COLUMN "assignedDays" SET NOT NULL;

ALTER TABLE "LeaveTypeAssignment"
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
