/** Inert QA-only guard: no schema changes or room deletion. The session must be
 * dedicated, never returned to a pool, and all guarded work must use it.
 * Advisory locks only exclude cooperative instances: separate enforcement of
 * exclusive access by database roles and external writers remains mandatory. */
export interface QaLeaseSession {
  query<T>(sql: string, values?: readonly unknown[]): Promise<{ rows: T[] }>
  on(event: 'error' | 'end', listener: () => void): unknown
}

export interface QaDatabaseIdentity {
  database: string
  serverAddress: string
  serverPort: number
  installationId: string
}

// Namespace reserved for this QA collector. Session-scoped, not a transaction lock.
export const QA_LEASE_SQL = {
  identity: `SELECT current_database() AS database, host(inet_server_addr()) AS "serverAddress", inet_server_port() AS "serverPort", pg_backend_pid() AS pid, (SELECT "installationId"::text FROM "QaInstallationIdentity" WHERE singleton = true) AS "installationId"`,
  lock: `SELECT pg_try_advisory_lock(1196573521, 1380928845) AS acquired`,
  held: `SELECT EXISTS (SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND pid = pg_backend_pid() AND classid = 1196573521 AND objid = 1380928845 AND objsubid = 2 AND granted) AS held`,
  unlock: `SELECT pg_advisory_unlock(1196573521, 1380928845) AS released`,
} as const

type IdentityRow = QaDatabaseIdentity & { pid: number }
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

export class QaDatabaseLease {
  private valid = false
  private lost = false
  private pid = 0
  private busy = false
  private constructor(private readonly session: QaLeaseSession, private readonly expected: QaDatabaseIdentity) {
    session.on('error', () => { this.lost = true; this.valid = false })
    session.on('end', () => { this.lost = true; this.valid = false })
  }

  static async acquire(session: QaLeaseSession, expected: QaDatabaseIdentity): Promise<QaDatabaseLease> {
    if (!expected.database || !expected.serverAddress || !Number.isInteger(expected.serverPort) || expected.serverPort < 1 || expected.serverPort > 65535 || !UUID_V4.test(expected.installationId)) throw new Error('Invalid QA database identity')
    const lease = new QaDatabaseLease(session, expected)
    try {
      const row = await lease.identity()
      lease.pid = row.pid
      const result = await session.query<{ acquired: boolean }>(QA_LEASE_SQL.lock)
      if (result.rows.length !== 1 || result.rows[0].acquired !== true) throw new Error('QA database lease already held')
      lease.valid = true
      await lease.assertHeld()
      return lease
    } catch (error) {
      lease.lost = true
      lease.valid = false
      // Caller must close the dedicated session on any acquisition failure.
      throw error
    }
  }

  private async identity(): Promise<IdentityRow> {
    const result = await this.session.query<IdentityRow>(QA_LEASE_SQL.identity)
    const row = result.rows[0]
    if (result.rows.length !== 1 || !row || row.database !== this.expected.database || row.serverAddress !== this.expected.serverAddress || row.serverPort !== this.expected.serverPort || row.installationId !== this.expected.installationId || !Number.isInteger(row.pid)) throw new Error('QA database identity mismatch')
    return row
  }

  async assertHeld(): Promise<void> {
    if (!this.valid || this.lost) throw new Error('QA database lease unavailable')
    try {
      const row = await this.identity()
      const result = await this.session.query<{ held: boolean }>(QA_LEASE_SQL.held)
      if (this.lost || row.pid !== this.pid || result.rows.length !== 1 || result.rows[0].held !== true) throw new Error('QA database lease lost')
    } catch (error) { this.lost = true; this.valid = false; throw error }
  }

  /** Caller must also hold the global activity gate. The callback must execute
   * all database work on this exact session. Loss means the caller must abort,
   * never retry destructive operations using a different connection. */
  async withLease<T>(work: (session: QaLeaseSession) => Promise<T>): Promise<T> {
    if (this.busy) throw new Error('QA database lease is already in use')
    this.busy = true
    try {
      await this.assertHeld()
      const result = await work(this.session)
      await this.assertHeld()
      return result
    } catch (error) { this.lost = true; this.valid = false; throw error }
    finally { this.busy = false }
  }

  async release(): Promise<void> {
    if (this.busy) throw new Error('QA database lease is in use')
    if (!this.valid || this.lost) return
    this.valid = false
    try { await this.session.query(QA_LEASE_SQL.unlock) } finally { this.lost = true }
  }
}
