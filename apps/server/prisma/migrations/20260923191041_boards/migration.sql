-- (#176, ADR 014) Boards: a Room row with lessonId is a page of that lesson.
-- Purely additive — every existing row is a lesson with one board.
-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "activeBoardId" TEXT,
ADD COLUMN     "boardOrder" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lessonId" TEXT;

-- CreateIndex
CREATE INDEX "Room_lessonId_boardOrder_idx" ON "Room"("lessonId", "boardOrder");

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
