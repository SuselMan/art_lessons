import assert from 'node:assert/strict'
import { test } from 'node:test'
import { collectQaLesson, QA_COLLECTOR_SQL, type QaCollectorQuery } from './qaRoomCollector.js'

test('collector passes only the lesson id to its single static statement', async () => {
  let called = 0
  const query: QaCollectorQuery = async <T>(sql: string, values?: readonly unknown[]) => {
    called++
    assert.equal(sql, QA_COLLECTOR_SQL)
    assert.deepEqual(values, ['lesson'])
    return { rows: [{ id: 'lesson' } as T] }
  }
  assert.equal(await collectQaLesson(query, 'lesson'), true)
  assert.equal(called, 1)
  await assert.rejects(collectQaLesson(query, ''))
  assert.equal(called, 1)
})

test('missing safety evidence or DB error never reports deletion', async () => {
  const none: QaCollectorQuery = async () => ({ rows: [] })
  assert.equal(await collectQaLesson(none, 'lesson'), false)
  const failed: QaCollectorQuery = async () => { throw new Error('database failed') }
  await assert.rejects(collectQaLesson(failed, 'lesson'), /database failed/)
  const wrong: QaCollectorQuery = async <T>() => ({ rows: [{ id: 'other' } as T] })
  await assert.rejects(collectQaLesson(wrong, 'lesson'), /Invalid QA collector result/)
})
