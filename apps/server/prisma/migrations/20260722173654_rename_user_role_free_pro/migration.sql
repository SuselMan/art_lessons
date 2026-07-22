-- Rename UserRole enum values away from teacher/student framing.
-- The subscription tier gates unrestricted room ownership, not a
-- teacher/student account type — that distinction lives in per-room
-- roles (Room.ownerId / RoomParticipant), not here. No live users yet,
-- so a plain rename is safe (see .claude/rules.md pre-production bias).
ALTER TYPE "UserRole" RENAME VALUE 'FREE_TEACHER' TO 'FREE';
ALTER TYPE "UserRole" RENAME VALUE 'PRO_TEACHER' TO 'PRO';
