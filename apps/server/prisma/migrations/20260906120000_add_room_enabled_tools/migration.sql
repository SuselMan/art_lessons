-- (#548) Which tools a room offers. Empty = no restriction, which is what
-- every existing room backfills to, so no room's behaviour changes here.
ALTER TABLE "Room" ADD COLUMN "enabledTools" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
