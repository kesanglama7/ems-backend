-- Firebase Cloud Messaging replaces the database-backed notification inbox.
-- Keep all older migration files unchanged so databases that already applied
-- them can migrate forward without checksum or migration-history conflicts.

DROP TABLE IF EXISTS "Notification";
DROP TYPE IF EXISTS "NotificationType";

CREATE TYPE "PushPlatform" AS ENUM ('WEB', 'IOS', 'ANDROID');

CREATE TABLE "PushDeviceToken" (
  "id" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "platform" "PushPlatform" NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PushDeviceToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PushDeviceToken_token_key" ON "PushDeviceToken"("token");
CREATE INDEX "PushDeviceToken_userId_idx" ON "PushDeviceToken"("userId");

ALTER TABLE "PushDeviceToken"
  ADD CONSTRAINT "PushDeviceToken_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
