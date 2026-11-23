/** Run only with QA_LEASE_TEST_PORT pointing at the disposable container from
 * qaDatabaseLease.postgres-check.sh and QA_PG_MODULE at a local pg install. */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { test } from 'node:test'
import { QaCommitOutcomeUnknown, QaDatabaseLease, type QaLeaseSession } from './qaDatabaseLease.js'

const port = Number(process.env.QA_LEASE_TEST_PORT)
const pgModule = process.env.QA_PG_MODULE
if (!port || !pgModule) throw new Error('Disposable QA PostgreSQL and pg driver required')
const { Client } = createRequire(import.meta.url)(pgModule) as { Client: new (options: object) => any }
const options = { host: '127.0.0.1', port, user: 'postgres', password: 'disposable-test', database: 'qa_test', connectionTimeoutMillis: 3000 }
async function connect(): Promise<{ client: any, session: QaLeaseSession }> {
  const client = new Client(options)
  await client.connect()
  const session: QaLeaseSession = {
    query: (sql, values) => client.query(sql, values),
    on: (event, listener) => client.on(event, listener),
    destroy: () => client.connection.stream.destroy(),
  }
  return { client, session }
}

test('real PostgreSQL lease excludes peers and tears down safely on failure, timeout and connection loss', async () => {
  const control = await connect()
  const installationId = randomUUID()
  try {
    await control.client.query('CREATE TABLE "QaInstallationIdentity" (singleton boolean PRIMARY KEY, "installationId" uuid NOT NULL)')
    await control.client.query('INSERT INTO "QaInstallationIdentity" VALUES (true, $1)', [installationId])
    await control.client.query('CREATE TABLE qa_test_data (id integer PRIMARY KEY)')
    const server = (await control.client.query('SELECT host(inet_server_addr()) AS address, inet_server_port() AS port')).rows[0]
    const identity = { database: 'qa_test', serverAddress: server.address, serverPort: server.port, installationId }
    const wrong = await connect()
    await assert.rejects(QaDatabaseLease.acquire(wrong.session, { ...identity, installationId: randomUUID() }))
    const first = await connect()
    const lease = await QaDatabaseLease.acquire(first.session, identity)
    const peer = await connect()
    await assert.rejects(QaDatabaseLease.acquire(peer.session, identity), /already held/)
    let escaped!: QaLeaseSession['query']
    const start = Date.now()
    await lease.transaction(async query => { escaped = query; void query('SELECT pg_sleep(0.2)') })
    assert.ok(Date.now() - start >= 150, 'in-flight query must finish before COMMIT')
    await assert.rejects(escaped('INSERT INTO qa_test_data VALUES (99)'), /query is closed/)
    await lease.transaction(async query => { await query('INSERT INTO qa_test_data VALUES (1)') })
    assert.equal((await control.client.query('SELECT count(*)::int AS count FROM qa_test_data')).rows[0].count, 1)
    await assert.rejects(lease.transaction(async query => {
      await query('INSERT INTO qa_test_data VALUES (2)')
      // A callback cannot hide a database error and proceed to COMMIT.
      try { await query('INSERT INTO qa_test_data VALUES (2)') } catch {}
    }))
    for (let i = 0; i < 50; i++) {
      if (!(await control.client.query('SELECT EXISTS (SELECT FROM pg_locks WHERE locktype = $1 AND classid = 1196573521 AND objid = 1380928845 AND granted) AS held', ['advisory'])).rows[0].held) break
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    assert.equal((await control.client.query('SELECT count(*)::int AS count FROM qa_test_data')).rows[0].count, 1)
    const next = await connect()
    const nextLease = await QaDatabaseLease.acquire(next.session, identity)
    await assert.rejects(nextLease.transaction(async query => { await query('SELECT pg_sleep(3)') }, 100), /timed out/)
    // A server running pg_sleep may notice the closed TCP connection only
    // after the query returns. Wait for the actual lock, never infer release.
    for (let i = 0; i < 200; i++) {
      if (!(await control.client.query('SELECT EXISTS (SELECT FROM pg_locks WHERE locktype = $1 AND classid = 1196573521 AND objid = 1380928845 AND granted) AS held', ['advisory'])).rows[0].held) break
      await new Promise(resolve => setTimeout(resolve, 25))
    }
    const last = await connect()
    const lastLease = await QaDatabaseLease.acquire(last.session, identity)
    await control.client.query('SELECT pg_terminate_backend($1)', [last.client.processID])
    await new Promise(resolve => setTimeout(resolve, 50))
    await assert.rejects(lastLease.transaction(async () => {}))
    for (let i = 0; i < 100; i++) {
      if (!(await control.client.query('SELECT EXISTS (SELECT FROM pg_locks WHERE locktype = $1 AND classid = 1196573521 AND objid = 1380928845 AND granted) AS held', ['advisory'])).rows[0].held) break
      await new Promise(resolve => setTimeout(resolve, 20))
    }
    // Simulate losing the COMMIT response after the server has committed.
    const uncertain = await connect()
    const realQuery = uncertain.session.query.bind(uncertain.session)
    uncertain.session.query = async <T>(sql: string, values?: readonly unknown[]) => {
      const value = await realQuery<T>(sql, values)
      if (sql === 'COMMIT') { uncertain.session.destroy(); throw new Error('lost commit response') }
      return value
    }
    const uncertainLease = await QaDatabaseLease.acquire(uncertain.session, identity)
    await assert.rejects(uncertainLease.transaction(async query => { await query('INSERT INTO qa_test_data VALUES (3)') }), QaCommitOutcomeUnknown)
    assert.equal((await control.client.query('SELECT count(*)::int AS count FROM qa_test_data WHERE id = 3')).rows[0].count, 1)
    await assert.rejects(uncertainLease.transaction(async () => {}))
  } finally { await control.client.end() }
})
