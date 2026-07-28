-- AlterTable
ALTER TABLE "Room" ADD COLUMN     "parentRoomId" TEXT;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_parentRoomId_fkey" FOREIGN KEY ("parentRoomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
