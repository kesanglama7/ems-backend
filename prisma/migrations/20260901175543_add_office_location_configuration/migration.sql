-- AlterTable
ALTER TABLE "OfficeSetting" ADD COLUMN     "attendanceRadiusMeters" INTEGER NOT NULL DEFAULT 100,
ADD COLUMN     "officeAddress" TEXT,
ADD COLUMN     "officeLatitude" DOUBLE PRECISION,
ADD COLUMN     "officeLongitude" DOUBLE PRECISION;
