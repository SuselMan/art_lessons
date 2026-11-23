/** Inert candidate collector. Never call without the QA database lease, an
 * exclusive activity gate covering HTTP/socket/background work, a drained
 * activity tracker and a transaction on the lease's dedicated connection.
 * Infrastructure MUST prevent non-cooperating DB writers. It does not delete
 * independent forks: any fork link protects both the source and the fork.
 * Missing activity clocks, invalid tree shapes, and unknown timestamps fail
 * closed. No caller, timer, database provisioning, or deployment is included. */
export type QaCollectorQuery = <T>(sql: string, values?: readonly unknown[]) => Promise<{ rows: T[] }>

// Separate static template fragments allow the database, not a JS clock, to
// apply one transaction timestamp consistently. Every nullable or new field
// must be reviewed when the schema changes.
const cutoff = `CURRENT_TIMESTAMP - INTERVAL '30 days'`
const member = `SELECT r.id UNION SELECT b.id FROM "Room" b WHERE b."lessonId" = r.id`
const stale = (table: string, column: string, scope: string) =>
  `NOT EXISTS (SELECT 1 FROM "${table}" x WHERE x."${scope}" IN (${member}) AND (x."${column}" IS NULL OR x."${column}" >= ${cutoff}))`

export const QA_COLLECTOR_SQL = `DELETE FROM "Room" r
WHERE r.id = $1 AND r."lessonId" IS NULL
  AND current_setting('transaction_isolation') = 'serializable'
  AND r."createdAt" IS NOT NULL AND r."createdAt" < ${cutoff}
  AND EXISTS (SELECT 1 FROM "QaRoomActivity" a WHERE a."lessonId" = r.id AND a."wasOpen" = false AND a."lastActiveAt" IS NOT NULL AND a."lastActiveAt" < ${cutoff})
  AND NOT EXISTS (SELECT 1 FROM "Room" b WHERE (b.id = r.id OR b."lessonId" = r.id)
    AND (b."createdAt" IS NULL OR b."createdAt" >= ${cutoff} OR b."parentRoomId" IS NOT NULL
      OR EXISTS (SELECT 1 FROM "Room" fork WHERE fork."parentRoomId" = b.id)
      OR (b.id <> r.id AND EXISTS (SELECT 1 FROM "Room" child WHERE child."lessonId" = b.id))))
  AND ${stale('Operation', 'createdAt', 'roomId')}
  AND ${stale('RoomParticipant', 'firstJoinedAt', 'roomId')}
  AND ${stale('RoomParticipant', 'lastActiveAt', 'roomId')}
  AND ${stale('RoomLayerSnapshot', 'createdAt', 'roomId')}
  AND ${stale('RoomLayerState', 'updatedAt', 'roomId')}
  AND ${stale('RoomPalette', 'updatedAt', 'roomId')}
  AND ${stale('RoomReviewImage', 'updatedAt', 'roomId')}
  AND ${stale('RoomThumbnail', 'updatedAt', 'roomId')}
  AND ${stale('RoomInvite', 'createdAt', 'roomId')}
  AND ${stale('RoomJoinRequest', 'requestedAt', 'roomId')}
  AND ${stale('RoomBlock', 'createdAt', 'roomId')}
  AND ${stale('RoomOpenMeasurement', 'createdAt', 'roomId')}
  AND ${stale('RoomOpenMeasurement', 'updatedAt', 'roomId')}
  AND NOT EXISTS (SELECT 1 FROM "RoomJoinRequest" x WHERE x."roomId" IN (${member}) AND (x."resolvedAt" IS NULL OR x."resolvedAt" >= ${cutoff}))
  AND NOT EXISTS (SELECT 1 FROM "Assignment" x WHERE x."lessonId" = r.id AND (x."createdAt" IS NULL OR x."createdAt" >= ${cutoff} OR x."endedAt" IS NULL OR x."endedAt" >= ${cutoff}))
  AND NOT EXISTS (SELECT 1 FROM "Assignment" x JOIN "Room" board ON board."assignmentId" = x.id WHERE x."lessonId" = r.id AND board."lessonId" IS DISTINCT FROM r.id)
RETURNING r.id`

/** Must run in a single exclusive caller transaction. Unknown lesson or any
 * missing safety evidence yields false. Database/query errors must propagate,
 * forcing the transaction to abort; never retry an ambiguous COMMIT. */
export async function collectQaLesson(query: QaCollectorQuery, lessonId: string): Promise<boolean> {
  if (!lessonId) throw new Error('QA lesson ID is required')
  const { rows } = await query<{ id: string }>(QA_COLLECTOR_SQL, [lessonId])
  if (rows.length > 1 || (rows.length === 1 && rows[0].id !== lessonId)) throw new Error('Invalid QA collector result')
  return rows.length === 1
}
