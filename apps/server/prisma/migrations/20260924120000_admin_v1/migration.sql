-- (#586, #587) Admin v1: last-seen time, account ban, and the admin journal.
-- Purely additive: every existing user reads as never-banned and not-yet-seen.
ALTER TABLE "User" ADD COLUMN "lastSeenAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "registeredAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "bannedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "banReason" TEXT;
ALTER TABLE "User" ADD COLUMN "bannedById" TEXT;

CREATE TABLE "AdminAction" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetUserId" TEXT,
    "targetRoomId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdminAction_createdAt_idx" ON "AdminAction"("createdAt");
CREATE INDEX "AdminAction_targetUserId_idx" ON "AdminAction"("targetUserId");

-- The real moment of signing up was never stored, and the first visit is the
-- closest thing we have: an upper bound on how long the account has existed.
UPDATE "User" SET "registeredAt" = "createdAt" WHERE "email" IS NOT NULL;
