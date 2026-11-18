-- Undo/redo restoration looks up all chunks of a gesture without scanning or
-- repeatedly decompressing the room's entire stroke history.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Operation_room_gesture_idx"
ON "Operation" ("roomId", "userId", ((data #> '{strokeId}')))
WHERE type = 'stroke';
