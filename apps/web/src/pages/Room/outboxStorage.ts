import type { Operation } from '@grafetto/shared'

// (#289 epic, reliable history spec v0.2 §9) One record per operation this
// client has sent but not yet gotten a definitive SendResult for.
export interface OutboxEntry {
  op: Operation
  attempts: number
  nextRetryAt: number
}

// Storage seam Outbox (outbox.ts) is built against, so its retry/backoff
// logic can be unit-tested against a plain in-memory fake instead of real
// IndexedDB — vitest runs in a Node environment with no IndexedDB (same
// reasoning engineTestUtils.ts already applies to rAF/fetch).
export interface OutboxStorage {
  getAll(): Promise<OutboxEntry[]>
  put(entry: OutboxEntry): Promise<void>
  delete(operationId: string): Promise<void>
}

const DB_NAME = 'pencil-outbox'
const STORE_NAME = 'pending-operations'
const DB_VERSION = 1

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { keyPath: 'op.id' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error as unknown)
  })
}

/** Real, browser-only IndexedDB-backed outbox storage — persists operations
 *  not yet confirmed by the server so a reload or crash doesn't silently
 *  lose them (see Outbox's own doc comment in outbox.ts for the retry/
 *  backoff logic built on top of this). The database connection is opened
 *  lazily, once, on first use. */
export function createIndexedDbOutboxStorage(): OutboxStorage {
  let dbPromise: Promise<IDBDatabase> | null = null
  // (#296) A *rejected* promise must not be cached. `dbPromise ??= openDb()`
  // alone kept one failed open forever, so a single transient error — the
  // browser prompting for storage, a database left inconsistent by a crashed
  // tab — disabled persistence for the rest of the page's life with no way
  // back. Clearing it on failure means the next call simply tries again.
  const getDb = async (): Promise<IDBDatabase> => {
    dbPromise ??= openDb()
    try {
      return await dbPromise
    } catch (err) {
      dbPromise = null
      throw err
    }
  }

  return {
    async getAll() {
      const db = await getDb()
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly')
        const req = tx.objectStore(STORE_NAME).getAll()
        req.onsuccess = () => resolve(req.result as OutboxEntry[])
        req.onerror = () => reject(req.error as unknown)
      })
    },
    async put(entry) {
      const db = await getDb()
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        tx.objectStore(STORE_NAME).put(entry)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error as unknown)
      })
    },
    async delete(operationId) {
      const db = await getDb()
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        tx.objectStore(STORE_NAME).delete(operationId)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error as unknown)
      })
    },
  }
}

/** Plain in-memory fake of OutboxStorage, exported for Room's own tests
 *  (outbox.test.ts) — same idea as engine/testing/mockGL.ts, just for this
 *  much smaller seam. Not used by the app itself. */
export function createInMemoryOutboxStorage(): OutboxStorage {
  const entries = new Map<string, OutboxEntry>()
  return {
    async getAll() { return [...entries.values()] },
    async put(entry) { entries.set(entry.op.id, entry) },
    async delete(operationId) { entries.delete(operationId) },
  }
}
