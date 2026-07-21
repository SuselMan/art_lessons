-- CreateTable
CREATE TABLE "RoomThumbnail" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomThumbnail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RoomThumbnail_roomId_key" ON "RoomThumbnail"("roomId");

-- AddForeignKey
ALTER TABLE "RoomThumbnail" ADD CONSTRAINT "RoomThumbnail_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
