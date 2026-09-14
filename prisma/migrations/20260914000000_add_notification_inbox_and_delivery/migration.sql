-- Forward-only migration: preserve all existing business rows and device registrations.
BEGIN;

-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM ('LEAVE', 'REQUEST', 'DOCUMENT', 'ATTENDANCE');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('LEAVE_REQUESTED', 'LEAVE_APPROVED', 'LEAVE_REJECTED', 'LEAVE_AUTO_REJECTED', 'LEAVE_CANCELLED', 'LEAVE_REMINDER', 'LEAVE_CREATED_BY_ADMIN', 'LEAVE_BALANCE_ADJUSTED', 'EMPLOYEE_REQUEST_CREATED', 'EMPLOYEE_REQUEST_STATUS_CHANGED', 'EMPLOYEE_REQUEST_ASSIGNED', 'EMPLOYEE_REQUEST_CANCELLED', 'EMPLOYEE_REQUEST_DISMISSED', 'DOCUMENT_UPLOADED', 'DOCUMENT_VERIFIED', 'DOCUMENT_REJECTED', 'DOCUMENT_DELETED', 'ATTENDANCE_CREATED_BY_ADMIN', 'ATTENDANCE_UPDATED_BY_ADMIN');

-- CreateEnum
CREATE TYPE "NotificationEntityType" AS ENUM ('LEAVE_REQUEST', 'EMPLOYEE_REQUEST', 'DOCUMENT', 'ATTENDANCE', 'LEAVE_BALANCE');

-- CreateEnum
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'RETRY', 'ACCEPTED', 'FAILED', 'SKIPPED');

-- AlterTable
ALTER TABLE "PushDeviceToken" ADD COLUMN     "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "sessionId" TEXT;

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "eventId" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "message" VARCHAR(500) NOT NULL,
    "entityType" "NotificationEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationDelivery" (
    "id" TEXT NOT NULL,
    "notificationId" TEXT NOT NULL,
    "deviceTokenId" TEXT,
    "targetSessionId" TEXT,
    "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedUntil" TIMESTAMP(3),
    "claimToken" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_recipientUserId_createdAt_id_idx" ON "Notification"("recipientUserId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Notification_recipientUserId_readAt_expiresAt_idx" ON "Notification"("recipientUserId", "readAt", "expiresAt");

-- CreateIndex
CREATE INDEX "Notification_expiresAt_idx" ON "Notification"("expiresAt");

-- CreateIndex
CREATE INDEX "Notification_entityType_entityId_idx" ON "Notification"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_eventId_recipientUserId_key" ON "Notification"("eventId", "recipientUserId");

-- CreateIndex
CREATE INDEX "NotificationDelivery_status_nextAttemptAt_idx" ON "NotificationDelivery"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "NotificationDelivery_status_lockedUntil_idx" ON "NotificationDelivery"("status", "lockedUntil");

-- CreateIndex
CREATE INDEX "NotificationDelivery_deviceTokenId_idx" ON "NotificationDelivery"("deviceTokenId");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDelivery_notificationId_deviceTokenId_key" ON "NotificationDelivery"("notificationId", "deviceTokenId");

-- AddForeignKey
ALTER TABLE "PushDeviceToken" ADD CONSTRAINT "PushDeviceToken_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AuthSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_deviceTokenId_fkey" FOREIGN KEY ("deviceTokenId") REFERENCES "PushDeviceToken"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Preserve token freshness from the original registration timestamp.
UPDATE "PushDeviceToken" SET "lastSeenAt" = "updatedAt";
CREATE INDEX "PushDeviceToken_sessionId_idx" ON "PushDeviceToken"("sessionId");
CREATE INDEX "PushDeviceToken_lastSeenAt_idx" ON "PushDeviceToken"("lastSeenAt");
COMMIT;
