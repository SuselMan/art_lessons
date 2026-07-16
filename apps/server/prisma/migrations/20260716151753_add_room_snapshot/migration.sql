-- CreateTable
CREATE TABLE "RoomSnapshot" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "layerState" JSONB NOT NULL,
    "data" BYTEA NOT NULL,
    "hash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RoomSnapshot_roomId_seq_key" ON "RoomSnapshot"("roomId", "seq");

-- AddForeignKey
ALTER TABLE "RoomSnapshot" ADD CONSTRAINT "RoomSnapshot_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
