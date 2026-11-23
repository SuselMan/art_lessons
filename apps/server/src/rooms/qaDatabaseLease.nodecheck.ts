import assert from 'node:assert/strict'
import { test } from 'node:test'
import { QaDatabaseLease, QA_LEASE_SQL, type QaDatabaseIdentity, type QaLeaseSession } from './qaDatabaseLease.js'

const expected: QaDatabaseIdentity = { database: 'qa_test', serverAddress: '127.0.0.1', serverPort: 5432, installationId: '992ea8ce-1e2d-4ed8-b841-457fc5b6f384' }
class Session implements QaLeaseSession {
  identity = { ...expected, pid: 77 }
  locked = false
  allowed = true
  held = true
  listeners: Array<() => void> = []
  on(_event: 'error' | 'end', cb: () => void) { this.listeners.push(cb) }
  async query<T>(sql: string): Promise<{ rows: T[] }> {
    const row = sql === QA_LEASE_SQL.identity ? this.identity : sql === QA_LEASE_SQL.lock ? { acquired: this.allowed } : sql === QA_LEASE_SQL.held ? { held: this.held } : sql === QA_LEASE_SQL.unlock ? { released: true } : null
    if (sql === QA_LEASE_SQL.lock && this.allowed) this.locked = true
    return { rows: [row as T] }
  }
  end() { for (const cb of this.listeners) cb() }
}

test('identity mismatch and held lease reject acquisition', async () => {
  for (const changed of [{ database: 'other' }, { serverAddress: '10.0.0.1' }, { serverPort: 5433 }, { installationId: '492ea8ce-1e2d-4ed8-b841-457fc5b6f384' }]) {
    const session = new Session(); Object.assign(session.identity, changed)
    await assert.rejects(QaDatabaseLease.acquire(session, expected))
    assert.equal(session.locked, false)
  }
  const session = new Session(); session.allowed = false
  await assert.rejects(QaDatabaseLease.acquire(session, expected), /already held/)
  await assert.rejects(QaDatabaseLease.acquire(new Session(), { ...expected, installationId: 'not-uuid' }))
})

test('lease loss, connection error, identity change and failed work permanently close gate', async () => {
  for (const how of ['lock', 'connection', 'pid', 'identity', 'work']) {
    const session = new Session(); const lease = await QaDatabaseLease.acquire(session, expected)
    if (how === 'lock') session.held = false
    if (how === 'connection') session.end()
    if (how === 'pid') session.identity.pid++
    if (how === 'identity') session.identity.installationId = '492ea8ce-1e2d-4ed8-b841-457fc5b6f384'
    await assert.rejects(lease.withLease(async () => { if (how === 'work') throw Error('failure') }))
    await assert.rejects(lease.assertHeld())
  }
})

test('release and concurrent work fail closed', async () => {
  const session = new Session(); const lease = await QaDatabaseLease.acquire(session, expected)
  let done!: () => void
  const wait = new Promise<void>(resolve => { done = resolve })
  const work = lease.withLease(async s => { assert.equal(s, session); await wait })
  await assert.rejects(lease.withLease(async () => {}), /already in use/)
  await assert.rejects(lease.release(), /in use/)
  done(); await work
  await lease.release(); await assert.rejects(lease.assertHeld())
})
