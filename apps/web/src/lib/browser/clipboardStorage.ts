// (#521) The editor's own clipboard, kept somewhere it can outlive the room
// it was filled in.
//
// #446 put it in `roomStore`, which was right for as long as a copy could only
// ever be pasted a few seconds later into the same canvas. It does not survive
// the two things this issue is about: `resetRoomStore()` replaces the whole
// room state on every Room mount, so opening another room empties it, and a
// second tab has its own JS heap and therefore never sees it at all. Copying a
// piece out of one lesson and into the next is exactly the case asked for, so
// the clipboard needs a container that is neither reset nor per-tab.
//
// It is stored in two halves, and the split is what makes it work:
//
//   - the pixels go to IndexedDB. They are a base64-encoded PNG, and
//     localStorage is a ~5 MB budget *for the whole origin*, shared with every
//     other preference this app keeps (`al_*` in settingsStore). A lasso round
//     one corner of an A3 sheet can spend that alone, and the failure mode is a
//     `QuotaExceededError` thrown at the moment someone copied something big —
//     i.e. the storage would break precisely when asked to do its job.
//   - everything else — the rect, the room, the timestamp — is mirrored into
//     localStorage, because it is tiny, because reading it is *synchronous*
//     ("is there anything to paste?" has to be answerable during the first
//     render, not one promise later), and because a `storage` event is the only
//     way another tab finds out something changed. IndexedDB fires no such
//     event.
//
// sessionStorage plays no part here: it is per-tab by definition, which is the
// one property this must not have.
//
// What this deliberately still is not: the *system* clipboard. ADR 008 put
// `navigator.clipboard.write` out of scope (its own permissions, its own
// tablet behaviour, and it carries pixels without the rect below), and that
// has not changed — this is the editor's clipboard, shared between the
// editor's own tabs.

/** Everything but the pixels: small enough for localStorage, and enough on its
 *  own to answer "is there something to paste, and where would it land". */
export interface ClipboardMeta {
  /** Which room the rect below is expressed in (#358 makes the same point
   *  about `OutboxEntry`: a store shared by every room in one browser profile
   *  has no way to tell whose work it is holding unless the record says so).
   *  World coordinates only mean something relative to a room — pasting them
   *  verbatim into a different one lands the piece at a place nobody chose,
   *  possibly off the sheet entirely. See `pastePlacement.ts`, which is where
   *  this field is actually read. */
  roomId: string
  x: number
  y: number
  width: number
  height: number
  /** Wall-clock ms at the copy. Not used to expire anything — it is what makes
   *  two tabs writing in the same millisecond distinguishable, and what a
   *  human debugging a stale clipboard needs to see. */
  updatedAt: number
}

/** A copied selection in full. Same `image`/`x`/`y`/`width`/`height` shape the
 *  engine's `AreaImage` and the `area_paste` operation already use, so a
 *  record drops into a paste unchanged apart from placement. */
export interface ClipboardRecord extends ClipboardMeta {
  /** PNG data URL, straight (un-premultiplied) alpha — see `readAreaImage`. */
  image: string
}

/** Storage seam for the heavy half, so the store built on top of it can be
 *  exercised against a plain in-memory fake: vitest runs in a Node environment
 *  with no IndexedDB (the same reasoning `outboxStorage.ts` states for the
 *  outbox, and `engineTestUtils.ts` for rAF/fetch). */
export interface ClipboardStorage {
  read(): Promise<ClipboardRecord | null>
  write(record: ClipboardRecord): Promise<void>
  clear(): Promise<void>
}

const DB_NAME = 'pencil-clipboard'
const STORE_NAME = 'clipboard'
const DB_VERSION = 1

/** One clipboard per browser profile, so one record under a fixed key rather
 *  than a keyed collection. A history of past copies is a different feature
 *  with a different UI; storing one would only mean the disk fills up with
 *  rasters nobody can reach. */
const RECORD_KEY = 'current'

/** localStorage key for the light half. Same `al_` prefix as every other
 *  client-side preference this app stores. */
export const CLIPBOARD_META_KEY = 'al_clipboard'

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME)
    }
    // Same trap the outbox hit on the tablet (#358): an upgrade waits for every
    // other tab still holding an older version open, and an unhandled wait is
    // silent and unbounded — the promise never settles and nothing says why.
    // Two rooms in two tabs is how this app gets used, so this is not a corner
    // case. Rejecting reports it and lets `getDb` drop the cached promise, so
    // the next copy tries again.
    req.onblocked = () => {
      reject(new Error(`clipboard: upgrade to v${DB_VERSION} is blocked by another tab holding an older version open`))
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error as unknown)
  })
}

/** The real, browser-only store. The connection is opened lazily, once, on
 *  first use — a session that never copies anything never opens a database. */
export function createIndexedDbClipboardStorage(): ClipboardStorage {
  let dbPromise: Promise<IDBDatabase> | null = null

  // A *rejected* promise must not be cached (#296 made this mistake in the
  // outbox and paid for it): one failed open kept forever means a single
  // transient error — the browser prompting about storage, a database left
  // inconsistent by a crashed tab — disables the clipboard for the rest of the
  // page's life with no way back.
  const getDb = async (): Promise<IDBDatabase> => {
    dbPromise ??= openDb()
    try {
      const db = await dbPromise
      // The other half of the blocked-upgrade problem: never be the tab that
      // blocks the next migration. Holding this connection open is what stalls
      // it, so close it and forget it; the next call reopens at whatever
      // version exists by then. Clearing the cache matters as much as closing —
      // a closed connection left cached fails every transaction from here on.
      db.onversionchange = () => { db.close(); dbPromise = null }
      return db
    } catch (err) {
      dbPromise = null
      throw err
    }
  }

  return {
    async read() {
      const db = await getDb()
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly')
        const req = tx.objectStore(STORE_NAME).get(RECORD_KEY)
        req.onsuccess = () => resolve((req.result as ClipboardRecord | undefined) ?? null)
        req.onerror = () => reject(req.error as unknown)
      })
    },
    async write(record) {
      const db = await getDb()
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        tx.objectStore(STORE_NAME).put(record, RECORD_KEY)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error as unknown)
      })
    },
    async clear() {
      const db = await getDb()
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        tx.objectStore(STORE_NAME).delete(RECORD_KEY)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error as unknown)
      })
    },
  }
}

/** Plain in-memory fake, for tests of anything built on the seam. Not used by
 *  the app itself — same idea as `createInMemoryOutboxStorage`. */
export function createInMemoryClipboardStorage(): ClipboardStorage {
  let record: ClipboardRecord | null = null
  return {
    async read() { return record },
    async write(next) { record = next },
    async clear() { record = null },
  }
}

/** Validates rather than casts. This reads a string another build of this app
 *  wrote — possibly an older one, possibly a newer one — and a bad record must
 *  read as "nothing on the clipboard" rather than as a rect of `undefined`s
 *  that reaches the paste placement math and turns into `NaN` coordinates. */
export function parseClipboardMeta(raw: string | null): ClipboardMeta | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const meta = parsed as Record<string, unknown>
  if (typeof meta.roomId !== 'string' || meta.roomId === '') return null
  for (const key of ['x', 'y', 'width', 'height', 'updatedAt'] as const) {
    if (typeof meta[key] !== 'number' || !Number.isFinite(meta[key])) return null
  }
  // A zero-sized rect is not a clipboard: nothing would be visible on paste,
  // and it would still light the paste button up as if something were there.
  if ((meta.width as number) <= 0 || (meta.height as number) <= 0) return null
  return {
    roomId: meta.roomId,
    x: meta.x as number,
    y: meta.y as number,
    width: meta.width as number,
    height: meta.height as number,
    updatedAt: meta.updatedAt as number,
  }
}

/** Drops the pixels — everything else *is* the meta, so this is a projection
 *  rather than a conversion, and the two halves cannot drift apart. */
export function metaOf(record: ClipboardRecord): ClipboardMeta {
  const { image: _image, ...meta } = record
  return meta
}

export function readClipboardMeta(): ClipboardMeta | null {
  try {
    return parseClipboardMeta(localStorage.getItem(CLIPBOARD_META_KEY))
  } catch {
    // Reading localStorage throws outright in a few real configurations
    // (Safari with site data blocked, some privacy modes). An unusable
    // clipboard is a missing feature; an exception here would be a blank
    // editor.
    return null
  }
}

export function writeClipboardMeta(meta: ClipboardMeta): void {
  try {
    localStorage.setItem(CLIPBOARD_META_KEY, JSON.stringify(meta))
  } catch {
    // Ignored on purpose, and it is worth being precise about what is lost:
    // the record itself is in IndexedDB and pastes fine in *this* tab, which
    // holds the meta in memory. What a failure here costs is the other tabs
    // noticing.
  }
}

export function clearClipboardMeta(): void {
  try {
    localStorage.removeItem(CLIPBOARD_META_KEY)
  } catch { /* see writeClipboardMeta */ }
}
