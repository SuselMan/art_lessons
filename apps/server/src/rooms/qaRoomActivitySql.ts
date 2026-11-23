import type { QaRoomActivityStore } from './qaRoomActivity.js'

/** Call only after verifying the QA installation identity and taking the
 * exclusive database lease. No automatic schema setup or backend wiring. */
export type SqlExecutor = (sql: string, values?: readonly string[]) => Promise<void>

export const QA_ACTIVITY_SQL = {
  create: `CREATE TABLE IF NOT EXISTS "QaRoomActivity" (
    "lessonId" TEXT PRIMARY KEY, "lastActiveAt" TIMESTAMPTZ NOT NULL,
    "wasOpen" BOOLEAN NOT NULL DEFAULT false)`,
  // Existing lessons with no trustworthy historical clock get one 30-day
  // grace period, once. Later restarts never refresh these closed rows.
  seedMissing: `INSERT INTO "QaRoomActivity" ("lessonId", "lastActiveAt", "wasOpen")
    SELECT id, CURRENT_TIMESTAMP, false FROM "Room" WHERE "lessonId" IS NULL
    ON CONFLICT ("lessonId") DO NOTHING`,
  recover: `UPDATE "QaRoomActivity" SET "lastActiveAt" = GREATEST("lastActiveAt", CURRENT_TIMESTAMP), "wasOpen" = false WHERE "wasOpen" = true`,
  opened: `INSERT INTO "QaRoomActivity" ("lessonId", "lastActiveAt", "wasOpen") VALUES ($1, CURRENT_TIMESTAMP, true)
    ON CONFLICT ("lessonId") DO UPDATE SET "lastActiveAt" = GREATEST("QaRoomActivity"."lastActiveAt", EXCLUDED."lastActiveAt"), "wasOpen" = true`,
  closed: `INSERT INTO "QaRoomActivity" ("lessonId", "lastActiveAt", "wasOpen") VALUES ($1, CURRENT_TIMESTAMP, false)
    ON CONFLICT ("lessonId") DO UPDATE SET "lastActiveAt" = GREATEST("QaRoomActivity"."lastActiveAt", EXCLUDED."lastActiveAt"), "wasOpen" = false`,
  touched: `INSERT INTO "QaRoomActivity" ("lessonId", "lastActiveAt", "wasOpen") VALUES ($1, CURRENT_TIMESTAMP, false)
    ON CONFLICT ("lessonId") DO UPDATE SET "lastActiveAt" = GREATEST("QaRoomActivity"."lastActiveAt", EXCLUDED."lastActiveAt")`,
} as const

export function createQaActivityStore(execute: SqlExecutor): QaRoomActivityStore {
  return {
    async recoverInterrupted() { await execute(QA_ACTIVITY_SQL.create); await execute(QA_ACTIVITY_SQL.seedMissing); await execute(QA_ACTIVITY_SQL.recover) },
    async opened(id) { await execute(QA_ACTIVITY_SQL.opened, [id]) },
    async closed(id) { await execute(QA_ACTIVITY_SQL.closed, [id]) },
    async touched(id) { await execute(QA_ACTIVITY_SQL.touched, [id]) },
  }
}
