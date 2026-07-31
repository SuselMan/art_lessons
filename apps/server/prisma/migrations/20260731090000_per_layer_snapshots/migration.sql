-- #370/#371: snapshots become one row per layer, and layerState gets its own
-- row per room.
--
-- The old RoomSnapshot rows are dropped rather than converted. They are whole-
-- room bundles, and #369 established that they are not reliably whole: a layer
-- the baking client could not produce was silently left out, so converting one
-- would carry that hole forward as if it were content. Nothing is lost by
-- dropping them — operation pruning has been disabled since #289, so every
-- room's full log is intact and the room simply replays.

-- DropTable
DROP TABLE "RoomSnapshot";

-- CreateTable
CREATE TABLE "RoomLayerSnapshot" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "layerId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "hash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verification" TEXT NOT NULL DEFAULT 'unverified',

    CONSTRAINT "RoomLayerSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomLayerState" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "state" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomLayerState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RoomLayerSnapshot_roomId_layerId_seq_key" ON "RoomLayerSnapshot"("roomId", "layerId", "seq");

-- CreateIndex
CREATE INDEX "RoomLayerSnapshot_roomId_layerId_seq_idx" ON "RoomLayerSnapshot"("roomId", "layerId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "RoomLayerState_roomId_key" ON "RoomLayerState"("roomId");

-- AddForeignKey
ALTER TABLE "RoomLayerSnapshot" ADD CONSTRAINT "RoomLayerSnapshot_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomLayerState" ADD CONSTRAINT "RoomLayerState_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
