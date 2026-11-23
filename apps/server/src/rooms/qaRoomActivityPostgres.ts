import { prisma } from '../db/prisma.js'
import { QaRoomActivity, type QaRoomActivityStore } from './qaRoomActivity.js'

// Both flags are required and the live Postgres database is checked before
// making *any* schema or data changes. Not intended for production databases.
const QA_DATABASE = 'grafetto_brush_review'
let activity: QaRoomActivity | undefined

export async function startQaRoomActivity(): Promise<void> {
  if (process.env.GRAFETTO_QA_ROOM_ACTIVITY !== '1') return
  if (process.env.GRAFETTO_QA_ACTIVITY_DATABASE !== QA_DATABASE) {
    throw new Error('QA room activity requires the dedicated QA database')
  }
  const rows = await prisma.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`
  if (rows[0]?.name !== QA_DATABASE) throw new Error('Refusing QA room activity on a different database')
  const store: QaRoomActivityStore = {
    async resetAll() {
      await prisma.$executeRaw`CREATE TABLE IF NOT EXISTS "QaRoomActivity" ("lessonId" TEXT PRIMARY KEY, "lastActiveAt" TIMESTAMPTZ NOT NULL)`
      await prisma.$executeRaw`INSERT INTO "QaRoomActivity" ("lessonId", "lastActiveAt") SELECT id, CURRENT_TIMESTAMP FROM "Room" WHERE "lessonId" IS NULL ON CONFLICT ("lessonId") DO UPDATE SET "lastActiveAt" = CURRENT_TIMESTAMP`
    },
    async touch(lessonId) {
      await prisma.$executeRaw`INSERT INTO "QaRoomActivity" ("lessonId", "lastActiveAt") VALUES (${lessonId}, CURRENT_TIMESTAMP) ON CONFLICT ("lessonId") DO UPDATE SET "lastActiveAt" = GREATEST("QaRoomActivity"."lastActiveAt", EXCLUDED."lastActiveAt")`
    },
  }
  const tracker = new QaRoomActivity(store)
  await tracker.start()
  activity = tracker
}

export function noteQaRoomActivity(lessonId: string): void {
  activity?.touch(lessonId)
}

export async function qaRoomActivityReadyForCollection(): Promise<boolean> {
  return activity ? activity.readyForCollection() : false
}
