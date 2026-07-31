-- #226: the display name someone joined a room under, kept per room.
--
-- Nullable with no backfill on purpose: there is nothing to backfill from.
-- The name is typed on the join screen and has never been persisted anywhere
-- (User.name is set for 5 rows out of ~400 — accounts that filled it in), so
-- existing rows genuinely do not know it. They fill in on the next join.

-- AlterTable
ALTER TABLE "RoomParticipant" ADD COLUMN     "name" TEXT;
