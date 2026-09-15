ALTER TYPE "NotificationCategory" ADD VALUE 'ANNOUNCEMENT';
ALTER TYPE "NotificationType" ADD VALUE 'ANNOUNCEMENT_PUBLISHED';
ALTER TYPE "NotificationEntityType" ADD VALUE 'ANNOUNCEMENT';

CREATE TYPE "AnnouncementStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "AnnouncementAudience" AS ENUM ('ALL_EMPLOYEES', 'DEPARTMENT');
CREATE TYPE "AnnouncementPriority" AS ENUM ('NORMAL', 'IMPORTANT', 'URGENT');

CREATE TABLE "Announcement" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "title" VARCHAR(160) NOT NULL,
  "body" TEXT NOT NULL,
  "priority" "AnnouncementPriority" NOT NULL DEFAULT 'NORMAL',
  "status" "AnnouncementStatus" NOT NULL DEFAULT 'DRAFT',
  "audience" "AnnouncementAudience" NOT NULL DEFAULT 'ALL_EMPLOYEES',
  "departmentId" TEXT,
  "showOnLogin" BOOLEAN NOT NULL DEFAULT false,
  "acknowledgmentRequired" BOOLEAN NOT NULL DEFAULT false,
  "publishAt" TIMESTAMP(3),
  "publishedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "authorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Announcement_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Announcement_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "Announcement_status_publishAt_idx" ON "Announcement"("status", "publishAt");
CREATE INDEX "Announcement_status_expiresAt_idx" ON "Announcement"("status", "expiresAt");
CREATE INDEX "Announcement_departmentId_idx" ON "Announcement"("departmentId");

CREATE TABLE "AnnouncementReceipt" (
  "announcementId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "readAt" TIMESTAMP(3),
  "acknowledgedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AnnouncementReceipt_pkey" PRIMARY KEY ("announcementId", "userId"),
  CONSTRAINT "AnnouncementReceipt_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AnnouncementReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "AnnouncementReceipt_userId_readAt_idx" ON "AnnouncementReceipt"("userId", "readAt");
