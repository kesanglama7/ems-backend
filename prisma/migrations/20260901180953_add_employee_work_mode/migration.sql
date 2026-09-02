-- CreateEnum
CREATE TYPE "EmployeeWorkMode" AS ENUM ('ON_FIELD', 'REMOTE');

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "workMode" "EmployeeWorkMode" NOT NULL DEFAULT 'ON_FIELD';
