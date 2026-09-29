import type { Operation } from '@grafetto/shared'

// (#289 epic, reliable history spec v0.2 §9) One record per operation this
// client has sent but not yet gotten a definitive SendResult for.
export interface OutboxEntry {
  op: Operation
  // (#358) Which room this operation was drawn in. An `Operation` says nothing
  // about that — the server records one against whatever room the sending
  // socket has joined — so without it a queue shared by every room in one
  // browser profile has no way to tell whose work it is holding. It had none:
  // opening any next room drained the previous room's unconfirmed strokes into
  // it, and they were accepted (every room's first layer carries the same
  // INITIAL_LAYER_ID, so even the alive-id check passed) and painted for
  // everyone there.
  roomId: string
  attempts: number
  nextRetryAt: number
}

// Storage seam Outbox (outbox.ts) is built against, so its retry/backoff
// logic can be unit-tested against a plain in-memory fake instead of real
// IndexedDB — vitest runs in a Node environment with no IndexedDB (same
// reasoning engineTestUtils.ts already applies to rAF/fetch).
export interface OutboxStorage {
  /** Everything still queued for `roomId`, and nothing else (#358). Another
   *  room's entries are not returned, not merged, and not touched — they wait,
   *  durably, for that room to be opened again. */
  getAll(roomId: string): Promise<OutboxEntry[]>
  put(entry: OutboxEntry): Promise<void>
  delete(operationId: string): Promise<void>
}

const DB_NAME = 'pencil-outbox'
const STORE_NAME = 'pending-operations'
const ROOM_INDEX = 'roomId'
// (#358) 1 → 2: adds the `roomId` index the room-scoped read above needs.
const DB_VERSION = 2

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = event => {
      const db = req.result
      const store = db.objectStoreNames.contains(STORE_NAME)
        ? req.transaction!.objectStore(STORE_NAME)
        : db.createObjectStore(STORE_NAME, { keyPath: 'op.id' })
      if (!store.indexNames.contains(ROOM_INDEX)) store.createIndex(ROOM_INDEX, 'roomId')
      // (#358) Records written before this version carry no room, and nothing
      // anywhere else remembers which room they belong to — so they are
      // dropped rather than kept. Not a comfortable line to write: these are
      // unconfirmed strokes, i.e. somebody's drawing. But the only two things
      // that can be done with an unattributable operation are to leave it
      // queued forever (invisible to every room-scoped read, so never sent and
      // never cleared — tens of MB of stroke JSON parked on a tablet) or to
      // send it into whichever room is opened next, which is the bug this
      // version exists to fix.
      if (event.oldVersion > 0 && event.oldVersion < 2) store.clear()
    }
    // (#358) An upgrade waits for every other tab still holding the old
    // version open, and without this the wait is silent and unbounded: the
    // promise simply never settles, so `getDb` never returns and this tab's
    // queue loses durability for the rest of its life with nothing said.
    // Found on the tablet, where it is not a corner case — two rooms in two
    // tabs is how the app gets used, and a background tab on Android can sit
    // on an old build for hours before Chrome reloads it. Rejecting instead
    // means the failure is reported, and `getDb` drops the cached promise so
    // the next operation tries again (see #296's reasoning there); the older
    // tab meanwhile keeps working on the version it opened.
    req.onblocked = () => {
      reject(new Error(`outbox: upgrade to v${DB_VERSION} is blocked by another tab holding an older version open`))
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
      const db = await dbPromise
      // (#358) The other half of the blocked-upgrade problem: never be the tab
      // that blocks the next migration. `versionchange` fires when another tab
      // wants a higher version, and holding this connection open is exactly
      // what stalls it — so close it and forget it. The next operation reopens
      // at whatever version now exists, which is why this clears the cached
      // promise as well as closing: a closed connection kept in the cache
      // would fail every transaction from here on.
      //
      // This cannot repair a tab that is already running an older build (it
      // has no such handler), so it is a fix for the *next* migration rather
      // than for the one that went wrong. There is no way to make it retroactive
      // from here, and that is the point worth remembering about IndexedDB
      // migrations: the code that has to cooperate is the code already shipped.
      db.onversionchange = () => { db.close(); dbPromise = null }
      return db
    } catch (err) {
      dbPromise = null
      throw err
    }
  }

  return {
    async getAll(roomId) {
      const db = await getDb()
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly')
        // Through the index rather than reading everything and filtering: a
        // backlog is measured in tens of MB of stroke JSON (#298), and
        // deserializing another room's share of it just to discard it is the
        // kind of memory spike that got this app killed on a tablet once.
        const req = tx.objectStore(STORE_NAME).index(ROOM_INDEX).getAll(roomId)
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

/** The in-memory fake's one widening of the real contract: `roomId` is
 *  optional, and omitting it returns every room's entries at once. Tests need
 *  that to assert on what a room-scoped Outbox deliberately did *not* touch
 *  — "another room's work is still queued" is unobservable through a seam that
 *  only ever shows you your own room (#358). */
export interface InMemoryOutboxStorage extends OutboxStorage {
  getAll(roomId?: string): Promise<OutboxEntry[]>
}

/** Plain in-memory fake of OutboxStorage, exported for Room's own tests
 *  (outbox.test.ts) — same idea as engine/testing/mockGL.ts, just for this
 *  much smaller seam. Not used by the app itself. */
export function createInMemoryOutboxStorage(): InMemoryOutboxStorage {
  const entries = new Map<string, OutboxEntry>()
  return {
    async getAll(roomId) {
      const all = [...entries.values()]
      return roomId === undefined ? all : all.filter(e => e.roomId === roomId)
    },
    async put(entry) { entries.set(entry.op.id, entry) },
    async delete(operationId) { entries.delete(operationId) },
  }
}
