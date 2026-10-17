import type { Operation, SendResult } from '@grafetto/shared'

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
  /** PROTOTYPE: local-only definitive rejection, never a server Operation. */
  terminal?: {result: Extract<SendResult,{ok:false}>; recordedAt:number}
}

/** Compact sticky fence after atomic handoff; never returned as a wire op. */
export interface RetiredOutboxRecord {
  op: {id:string}
  roomId: string
  retired: {handoffId:string}
}
export type StoredOutboxRecord = OutboxEntry | RetiredOutboxRecord
export type GuardedOutboxWrite = {kind:'entry';entry:OutboxEntry} | {kind:'retired'}
const isRetired=(entry:StoredOutboxRecord):entry is RetiredOutboxRecord=>'retired' in entry
const clone=<T>(value:T):T=>structuredClone(value)
function guardedResult(existing:StoredOutboxRecord|undefined,incoming:OutboxEntry):GuardedOutboxWrite {
  if(existing && isRetired(existing))return {kind:'retired'}
  return {kind:'entry',entry:existing?.terminal ? existing : incoming}
}
function validateHandoff(roomId:string,ids:readonly string[],replacement:readonly OutboxEntry[],records:ReadonlyMap<string,StoredOutboxRecord|undefined>):boolean {
  if(!replacement.length)throw new Error('handoff requires durable replacement rows')
  if(!ids.length || new Set(ids).size!==ids.length)throw new Error('handoff needs distinct terminal IDs')
  if(ids.some(id=>{const entry=records.get(id);return !entry || isRetired(entry) || !entry.terminal || entry.roomId!==roomId}))return false
  const newIds=new Set<string>()
  for(const entry of replacement){
    if(entry.roomId!==roomId || entry.terminal || records.has(entry.op.id) && records.get(entry.op.id) || newIds.has(entry.op.id))throw new Error('invalid or colliding recovery replacement')
    newIds.add(entry.op.id)
  }
  return true
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
  /** All-new-reader prototype. Existing terminal/retired state wins stale put. */
  putGuarded?(entry:OutboxEntry):Promise<GuardedOutboxWrite>
  /** One transaction: all originals terminal and still present, or no writes. */
  replaceTerminal?(roomId:string,originalIds:readonly string[],replacement:readonly OutboxEntry[]):Promise<boolean>
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

  const writeGuarded=async(entry:OutboxEntry):Promise<GuardedOutboxWrite>=>{
    const db=await getDb()
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE_NAME,'readwrite'),store=tx.objectStore(STORE_NAME)
      let result:GuardedOutboxWrite,error:unknown
      tx.oncomplete=()=>resolve(result)
      tx.onabort=()=>reject(error??tx.error??new Error('outbox write aborted'))
      tx.onerror=()=>{error??=tx.error}
      const req=store.get(entry.op.id)
      req.onsuccess=()=>{try{
        result=guardedResult(req.result as StoredOutboxRecord|undefined,entry)
        if(result.kind==='entry' && !((req.result as OutboxEntry|undefined)?.terminal))store.put(result.entry)
      }catch(cause){error=cause;tx.abort()}}
    })
  }
  return {
    async getAll(roomId) {
      const db=await getDb()
      return new Promise((resolve,reject)=>{
        const tx=db.transaction(STORE_NAME,'readonly')
        const req=tx.objectStore(STORE_NAME).index(ROOM_INDEX).getAll(roomId)
        req.onsuccess=()=>resolve((req.result as StoredOutboxRecord[]).filter((entry):entry is OutboxEntry=>!isRetired(entry)))
        req.onerror=()=>reject(req.error)
      })
    },
    async put(entry){await writeGuarded(entry)},
    putGuarded:writeGuarded,
    async delete(operationId){
      const db=await getDb()
      return new Promise((resolve,reject)=>{
        const tx=db.transaction(STORE_NAME,'readwrite'),store=tx.objectStore(STORE_NAME)
        tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error??new Error('outbox delete aborted'))
        const req=store.get(operationId)
        req.onsuccess=()=>{const old=req.result as StoredOutboxRecord|undefined;if(!old || !isRetired(old) && !old.terminal)store.delete(operationId)}
      })
    },
    async replaceTerminal(roomId,originalIds,replacement){
      const db=await getDb()
      return new Promise((resolve,reject)=>{
        const tx=db.transaction(STORE_NAME,'readwrite'),store=tx.objectStore(STORE_NAME)
        const records=new Map<string,StoredOutboxRecord|undefined>()
        let pending=0,replaced=false,error:unknown
        tx.oncomplete=()=>resolve(replaced)
        tx.onabort=()=>reject(error??tx.error??new Error('outbox handoff aborted'))
        tx.onerror=()=>{error??=tx.error}
        const finish=()=>{try{
          if(!validateHandoff(roomId,originalIds,replacement,records))return
          for(const entry of replacement)store.put(entry)
          for(const id of originalIds)store.put({op:{id},roomId,retired:{handoffId:originalIds[0]}} satisfies RetiredOutboxRecord)
          replaced=true
        }catch(cause){error=cause;tx.abort()}}
        const keys=new Set([...originalIds,...replacement.map(entry=>entry.op.id)])
        if(!keys.size){error=new Error('handoff needs terminal originals');tx.abort();return}
        pending=keys.size
        for(const id of keys){const req=store.get(id);req.onsuccess=()=>{records.set(id,req.result as StoredOutboxRecord|undefined);if(--pending===0)finish()}}
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
  const entries = new Map<string,StoredOutboxRecord>()
  const putGuarded=async(entry:OutboxEntry):Promise<GuardedOutboxWrite>=>{
    const result=guardedResult(entries.get(entry.op.id),entry)
    if(result.kind==='entry'){const stored=clone(result.entry);entries.set(stored.op.id,stored);return {kind:'entry',entry:clone(stored)}}
    return result
  }
  return {
    async getAll(roomId){return [...entries.values()].filter((entry):entry is OutboxEntry=>!isRetired(entry) && (roomId===undefined || entry.roomId===roomId)).map(clone)},
    async put(entry){await putGuarded(entry)},
    putGuarded,
    async delete(operationId){const old=entries.get(operationId);if(!old || !isRetired(old) && !old.terminal)entries.delete(operationId)},
    async replaceTerminal(roomId,ids,replacement){
      if(!validateHandoff(roomId,ids,replacement,entries))return false
      // Stage all clone/validation work before changing any row, like IDB abort.
      const staged=replacement.map(clone)
      for(const entry of staged)entries.set(entry.op.id,entry)
      for(const id of ids)entries.set(id,{op:{id},roomId,retired:{handoffId:ids[0]}})
      return true
    },
  }
}
