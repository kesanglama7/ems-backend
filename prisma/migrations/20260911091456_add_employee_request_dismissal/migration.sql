-- CreateEnum
CREATE TYPE "EmployeeRequestDismissalReason" AS ENUM ('SPAM_OR_INAPPROPRIATE', 'DUPLICATE', 'INVALID_REQUEST', 'INSUFFICIENT_INFORMATION', 'OTHER');

-- AlterEnum
ALTER TYPE "EmployeeRequestActivityAction" ADD VALUE 'DISMISSED';

-- AlterEnum
ALTER TYPE "EmployeeRequestStatus" ADD VALUE 'DISMISSED';

-- AlterTable
ALTER TABLE "EmployeeRequest" ADD COLUMN     "dismissalNote" TEXT,
ADD COLUMN     "dismissalReason" "EmployeeRequestDismissalReason",
ADD COLUMN     "dismissedAt" TIMESTAMP(3),
ADD COLUMN     "dismissedByAdminId" TEXT;

-- AddForeignKey
ALTER TABLE "EmployeeRequest" ADD CONSTRAINT "EmployeeRequest_dismissedByAdminId_fkey" FOREIGN KEY ("dismissedByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
