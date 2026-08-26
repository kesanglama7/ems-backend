-- CreateTable
CREATE TABLE "OfficeSetting" (
    "id" TEXT NOT NULL,
    "officeName" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Kathmandu',
    "workStartTime" TEXT NOT NULL,
    "workEndTime" TEXT NOT NULL,
    "workingDays" TEXT[],
    "gracePeriodMinutes" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfficeSetting_pkey" PRIMARY KEY ("id")
);
