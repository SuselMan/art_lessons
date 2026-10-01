CREATE TABLE "RoomOpenMeasurement" (
    "userId" TEXT NOT NULL, "attemptId" TEXT NOT NULL, "roomId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL, "appVersion" TEXT NOT NULL, "deviceType" TEXT NOT NULL,
    "platform" TEXT NOT NULL, "browser" TEXT NOT NULL, "wasHidden" BOOLEAN NOT NULL,
    "outcome" TEXT NOT NULL, "totalMs" INTEGER NOT NULL,
    "joinMs" INTEGER, "paperMs" INTEGER, "snapshotMs" INTEGER, "replayMs" INTEGER,
    "reached" TEXT NOT NULL, "facts" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RoomOpenMeasurement_pkey" PRIMARY KEY ("userId", "attemptId")
);
CREATE INDEX "RoomOpenMeasurement_createdAt_idx" ON "RoomOpenMeasurement"("createdAt");
CREATE INDEX "RoomOpenMeasurement_roomId_createdAt_idx" ON "RoomOpenMeasurement"("roomId", "createdAt");
