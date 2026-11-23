import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { QA_ACTIVITY_SQL } from './qaRoomActivitySql.js'

// Opt-in only: a disposable postgres container created and removed by the
// invoking test harness, never the running Grafetto database.
const container = process.env.QA_ACTIVITY_TEST_CONTAINER
function sql(statement: string): string {
  if (!container || !/^qa-activity-test-[a-z0-9]+$/.test(container)) throw new Error('test container required')
  return execFileSync('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-v', 'ON_ERROR_STOP=1'], { input: statement, encoding: 'utf8' }).trim()
}
function query(statement: string, value: string): string {
  if (!/^[a-z]+$/.test(value)) throw new Error('invalid test id')
  return sql(statement.replaceAll('$1', `'${value}'`))
}

describe.skipIf(!container)('QA room activity SQL on disposable PostgreSQL', () => {
  it('keeps closed history across restart and recovers only interrupted rooms', () => {
    sql(QA_ACTIVITY_SQL.create)
    query(QA_ACTIVITY_SQL.opened, 'closed')
    query(QA_ACTIVITY_SQL.closed, 'closed')
    sql(`UPDATE "QaRoomActivity" SET "lastActiveAt" = '2020-01-01T00:00:00Z' WHERE "lessonId" = 'closed'`)
    query(QA_ACTIVITY_SQL.opened, 'interrupted')
    sql(QA_ACTIVITY_SQL.recover)
    expect(sql(`SELECT "wasOpen"::text FROM "QaRoomActivity" WHERE "lessonId" = 'interrupted'`)).toBe('false')
    expect(sql(`SELECT "lastActiveAt"::date::text FROM "QaRoomActivity" WHERE "lessonId" = 'closed'`)).toBe('2020-01-01')
    expect(sql(`SELECT ("lastActiveAt" > '2021-01-01')::text FROM "QaRoomActivity" WHERE "lessonId" = 'interrupted'`)).toBe('true')
  })
  it('backfills missing lessons once without resetting an existing closed clock', () => {
    sql(QA_ACTIVITY_SQL.create)
    sql('CREATE TABLE IF NOT EXISTS "Room" (id TEXT PRIMARY KEY, "lessonId" TEXT)')
    sql(`INSERT INTO "Room" (id, "lessonId") VALUES ('old', null), ('new', null), ('board', 'old')`)
    query(QA_ACTIVITY_SQL.closed, 'old')
    sql(`UPDATE "QaRoomActivity" SET "lastActiveAt" = '2020-01-01T00:00:00Z' WHERE "lessonId" = 'old'`)
    sql(QA_ACTIVITY_SQL.seedMissing)
    expect(sql(`SELECT "lastActiveAt"::date::text FROM "QaRoomActivity" WHERE "lessonId" = 'old'`)).toBe('2020-01-01')
    expect(sql(`SELECT COUNT(*) FROM "QaRoomActivity" WHERE "lessonId" = 'new'`)).toBe('1')
    expect(sql(`SELECT COUNT(*) FROM "QaRoomActivity" WHERE "lessonId" = 'board'`)).toBe('0')
  })
  it('HTTP activity does not clear the open marker', () => {
    query(QA_ACTIVITY_SQL.opened, 'active')
    query(QA_ACTIVITY_SQL.touched, 'active')
    expect(sql(`SELECT "wasOpen"::text FROM "QaRoomActivity" WHERE "lessonId" = 'active'`)).toBe('true')
    query(QA_ACTIVITY_SQL.closed, 'active')
    expect(sql(`SELECT "wasOpen"::text FROM "QaRoomActivity" WHERE "lessonId" = 'active'`)).toBe('false')
  })
})
