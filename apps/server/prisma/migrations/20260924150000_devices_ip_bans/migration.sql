-- (#589, #590) Devices, IP sightings, IP bans, "sign out everywhere". Additive only.
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "sessionsRevokedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "AdminAction" ADD COLUMN     "targetIp" TEXT;

-- CreateTable
CREATE TABLE "UserDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "browser" TEXT NOT NULL,
    "lastIp" TEXT,
    "env" JSONB,
    "envAt" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IpSighting" (
    "id" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IpSighting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IpBan" (
    "id" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "liftedAt" TIMESTAMP(3),

    CONSTRAINT "IpBan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UserDevice_lastSeenAt_idx" ON "UserDevice"("lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserDevice_userId_deviceId_key" ON "UserDevice"("userId", "deviceId");

-- CreateIndex
CREATE INDEX "IpSighting_userId_idx" ON "IpSighting"("userId");

-- CreateIndex
CREATE INDEX "IpSighting_lastSeenAt_idx" ON "IpSighting"("lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "IpSighting_ip_userId_deviceId_key" ON "IpSighting"("ip", "userId", "deviceId");

-- CreateIndex
CREATE INDEX "IpBan_ip_idx" ON "IpBan"("ip");

-- CreateIndex
CREATE INDEX "IpBan_expiresAt_idx" ON "IpBan"("expiresAt");

-- AddForeignKey
ALTER TABLE "UserDevice" ADD CONSTRAINT "UserDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

