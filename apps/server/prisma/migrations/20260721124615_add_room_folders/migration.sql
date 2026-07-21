-- AlterTable
ALTER TABLE "RoomParticipant" ADD COLUMN     "folderId" TEXT;

-- CreateTable
CREATE TABLE "RoomFolder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentFolderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomFolder_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "RoomParticipant" ADD CONSTRAINT "RoomParticipant_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "RoomFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomFolder" ADD CONSTRAINT "RoomFolder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomFolder" ADD CONSTRAINT "RoomFolder_parentFolderId_fkey" FOREIGN KEY ("parentFolderId") REFERENCES "RoomFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
