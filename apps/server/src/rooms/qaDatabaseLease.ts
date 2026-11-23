/** Inert QA-only guard: no schema changes or room deletion. The session must be
 * dedicated, never returned to a pool, and all guarded work must use it.
 * Advisory locks only exclude cooperative instances: separate enforcement of
 * exclusive access by database roles and external writers remains mandatory. */
export interface QaLeaseSession {
  query<T>(sql: string, values?: readonly unknown[]): Promise<{ rows: T[] }>
  on(event: 'error' | 'end', listener: () => void): unknown
  /** Immediately destroy the dedicated socket; never release to a pool. */
  destroy(): void
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
  private closed = false
  private constructor(private readonly session: QaLeaseSession, private readonly expected: QaDatabaseIdentity) {
    session.on('error', () => { this.lost = true; this.valid = false; this.destroy() })
    session.on('end', () => { this.lost = true; this.valid = false; this.destroy() })
  }

  static async acquire(session: QaLeaseSession, expected: QaDatabaseIdentity, timeoutMs = 10_000): Promise<QaDatabaseLease> {
    const lease = new QaDatabaseLease(session, expected)
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      if (!expected.database || !expected.serverAddress || !Number.isInteger(expected.serverPort) || expected.serverPort < 1 || expected.serverPort > 65535 || !UUID_V4.test(expected.installationId) || !Number.isInteger(timeoutMs) || timeoutMs < 1) throw new Error('Invalid QA database identity or timeout')
      const acquire = async () => {
        const row = await lease.identity()
        lease.pid = row.pid
        const result = await session.query<{ acquired: boolean }>(QA_LEASE_SQL.lock)
        if (result.rows.length !== 1 || result.rows[0].acquired !== true) throw new Error('QA database lease already held')
        if (lease.lost) throw new Error('QA database lease unavailable')
        lease.valid = true
        await lease.assertHeld()
        return lease
      }
      const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { lease.lost = true; lease.valid = false; lease.destroy(); reject(new Error('QA database lease acquisition timed out')) }, timeoutMs) })
      return await Promise.race([acquire(), timeout])
    } catch (error) {
      lease.lost = true
      lease.valid = false
      lease.destroy()
      throw error
    } finally { if (timer) clearTimeout(timer) }
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
    } catch (error) { this.lost = true; this.valid = false; this.destroy(); throw error }
  }

  private destroy(): void {
    if (this.closed) return
    this.closed = true
    try { this.session.destroy() } catch { /* already disconnected */ }
  }

  /** Only trusted, predefined statements are allowed in work: no transaction
   * control, no independently acquired sessions. A failed COMMIT has an
   * unknown outcome; callers must not infer rollback or blindly retry. */
  async transaction<T>(work: (query: QaLeaseSession['query']) => Promise<T>, timeoutMs = 10_000): Promise<T> {
    if (this.busy) throw new Error('QA database lease is already in use')
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1) throw new Error('Invalid lease timeout')
    this.busy = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { this.lost = true; this.valid = false; this.destroy(); reject(new Error('QA database lease timed out')) }, timeoutMs)
    })
    const run = async (): Promise<T> => {
      await this.assertHeld()
      await this.session.query('BEGIN')
      await this.assertHeld()
      const query: QaLeaseSession['query'] = async <R>(sql: string, values?: readonly unknown[]) => {
        if (!this.valid || this.lost) throw new Error('QA database lease unavailable')
        // Restrict accidental transaction control; this is not a SQL sandbox.
        if (!/^\s*(SELECT|INSERT|UPDATE|DELETE)\b/i.test(sql) || sql.includes(';')) throw new Error('QA transaction accepts one data statement only')
        try { return await this.session.query<R>(sql, values) }
        catch (error) { this.lost = true; this.valid = false; this.destroy(); throw error }
      }
      const result = await work(query)
      await this.assertHeld()
      await this.session.query('COMMIT')
      await this.assertHeld()
      return result
    }
    try { return await Promise.race([run(), timeout]) }
    catch (error) { this.lost = true; this.valid = false; this.destroy(); throw error }
    finally { if (timer) clearTimeout(timer); this.busy = false }
  }

  async release(): Promise<void> {
    if (this.busy) throw new Error('QA database lease is in use')
    this.valid = false
    this.lost = true
    // Closing a session releases PostgreSQL session advisory locks. Avoid a
    // network round-trip whose failure could leave a lock held indefinitely.
    this.destroy()
  }
}
