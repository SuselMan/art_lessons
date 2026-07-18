-- CreateTable
CREATE TABLE "RoomPalette" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "colors" TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomPalette_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RoomPalette_roomId_key" ON "RoomPalette"("roomId");

-- AddForeignKey
ALTER TABLE "RoomPalette" ADD CONSTRAINT "RoomPalette_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
