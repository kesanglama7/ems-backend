/*
  Warnings:

  - You are about to drop the `EmployeeRequestMessage` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[requestNumber]` on the table `EmployeeRequest` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "EmployeeRequestActivityAction" AS ENUM ('CREATED', 'STATUS_CHANGED', 'ASSIGNED', 'ADMIN_NOTE_UPDATED', 'CANCELLED');

-- DropForeignKey
ALTER TABLE "EmployeeRequestMessage" DROP CONSTRAINT "EmployeeRequestMessage_requestId_fkey";

-- AlterTable
ALTER TABLE "EmployeeRequest" ADD COLUMN     "adminNote" TEXT,
ADD COLUMN     "requestNumber" SERIAL NOT NULL;

-- DropTable
DROP TABLE "EmployeeRequestMessage";

-- CreateTable
CREATE TABLE "EmployeeRequestActivity" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "performedByUserId" TEXT,
    "action" "EmployeeRequestActivityAction" NOT NULL,
    "fromStatus" "EmployeeRequestStatus",
    "toStatus" "EmployeeRequestStatus",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeRequestActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmployeeRequestActivity_requestId_createdAt_idx" ON "EmployeeRequestActivity"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "EmployeeRequestActivity_performedByUserId_idx" ON "EmployeeRequestActivity"("performedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeRequest_requestNumber_key" ON "EmployeeRequest"("requestNumber");

-- CreateIndex
CREATE INDEX "EmployeeRequest_status_createdAt_idx" ON "EmployeeRequest"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "EmployeeRequest" ADD CONSTRAINT "EmployeeRequest_assignedAdminId_fkey" FOREIGN KEY ("assignedAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeRequest" ADD CONSTRAINT "EmployeeRequest_resolvedByAdminId_fkey" FOREIGN KEY ("resolvedByAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeRequestActivity" ADD CONSTRAINT "EmployeeRequestActivity_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "EmployeeRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeRequestActivity" ADD CONSTRAINT "EmployeeRequestActivity_performedByUserId_fkey" FOREIGN KEY ("performedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
