-- AlterEnum
ALTER TYPE "LeaveStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "LeaveRequest" ALTER COLUMN "reason" DROP NOT NULL;
