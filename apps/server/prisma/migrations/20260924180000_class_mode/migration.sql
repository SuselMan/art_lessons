-- (#595, ADR 015) Class mode: assignments and personal boards. Purely additive —
-- every existing room is a lesson with no assignment and teacher_only visibility,
-- every existing thumbnail a PNG.
-- CreateEnum
CREATE TYPE "AssignmentSeed" AS ENUM ('blank', 'copy_board');

-- CreateEnum
CREATE TYPE "ClassVisibility" AS ENUM ('teacher_only', 'class');

-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "activeAssignmentId" TEXT,
ADD COLUMN     "assignmentId" TEXT,
ADD COLUMN     "boardOwnerId" TEXT,
ADD COLUMN     "classVisibility" "ClassVisibility" NOT NULL DEFAULT 'teacher_only',
ADD COLUMN     "spotlightBoardId" TEXT;

-- AlterTable
ALTER TABLE "RoomThumbnail" ADD COLUMN     "contentType" TEXT NOT NULL DEFAULT 'image/png';

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "seed" "AssignmentSeed" NOT NULL DEFAULT 'blank',
    "seedBoardId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Assignment_lessonId_order_idx" ON "Assignment"("lessonId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "Room_assignmentId_boardOwnerId_key" ON "Room"("assignmentId", "boardOwnerId");

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

