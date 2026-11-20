-- #807 / ADR017. Index actual immutable originals, not a visibility projection.
-- The indexed reader still validates all rows and original target/source laws.
CREATE INDEX "Operation_canonical_gesture_seq_idx"
ON "Operation" ("roomId", "userId", (data #>> '{frame,strokeId}'), seq)
WHERE type = 'canonical_stroke';

CREATE INDEX "Operation_canonical_metadata_target_seq_idx"
ON "Operation" ("roomId", (data ->> 'targetOpId'), seq)
WHERE type IN ('operation_undo', 'operation_redo');

CREATE INDEX "Operation_canonical_root_actor_seq_idx"
ON "Operation" ("roomId", "userId", seq)
WHERE type = 'canonical_stroke' AND data #>> '{frame,frameOrdinal}' = '0';

CREATE INDEX "Operation_canonical_close_gesture_seq_idx"
ON "Operation" ("roomId", (data ->> 'targetUserId'), (data ->> 'strokeId'), seq)
WHERE type = 'canonical_stroke_close';
