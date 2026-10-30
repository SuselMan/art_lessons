# Canonical write receipts: first prerequisite only

This unit adds an observable outcome to the SAME room write queue. It does NOT
wire durable ACKs, relay, canonical prefix/close, loaders, fork or snapshot gates.
Existing canonical transport still has its old acknowledgement behavior until
that separate integration is implemented. Straight room/engine activation stays
closed. No shared schema, DB migration, additional queue or operation journal is
introduced.

## API and ownership

- `enqueueWrite<T>(roomId,run): Promise<RoomWriteOutcome<T>>`, where outcome is
  `{ok:true,value:T}|{ok:false,error:unknown}`. It never exposes a rejected write
  promise to ignored legacy callers. Existing queue ordering, failure logging,
  failure-continues behavior, tail identity cleanup and `flushRoomWrites` remain.
  Flush means SETTLED, not successful. Even a throwing diagnostic sink must not
  create an unhandled rejection.
- `persistOperation` returns `RoomWriteOutcome<void>`. It does not keep the ORM's
  full returned operation JSON in a settled receipt. The original immutable row
  projection is reused by `retryCanonicalOperationWrite`. Retry queries existing
  ID, verifies all indexed columns and full data, or creates the SAME row. P2002
  triggers another exact verification; no update/upsert/seq assignment occurs.
- `recordOperation` still returns the actual resident stamped Operation
  synchronously. Canonical header/frame/composition/RGB metadata is copied/frozen
  BEFORE seq mutation; the material string is not duplicated. Legacy operations
  keep existing mutable behavior and ignore queue outcomes.
- `knownCanonicalWrite(op)` gives readonly `{status,outcome}` or undefined.
  Status is `pending|succeeded|failed`. The WeakMap key is the ACTUAL stamped
  object already in `operationsById`, not an ID->body copy. Equal copied objects
  have no receipt. This is status, not an authorization.
- `ensureCanonicalWrite(record,op,{retryFailed?})` requires current actual
  RoomRecord, actual `operationsById` identity and the same counter owner. It
  returns the same pending/success/failed promise by default. Explicit failed
  retry replaces it with ONE coalesced same-row attempt; no append/pin/cursor/
  newseq or automatic loop. Invalid, unknown and stale owners reject before I/O.
- `canonicalWriteFence(record)` gives frozen `{pending,failed}` counters for
  tracked writes. Their owner is a WeakMap key of actual RoomRecord. Receipt
  values refer only to a small numeric owner, never the room/whole log. An old
  completion cannot modify a replacement record's counters. Zero is NOT proof
  for untracked DB-loaded rows, whole durable prefix, global pending state or
  completed wash coverage. A future loader/read gate must establish provenance.

All original DB work is queued synchronously before recordOperation returns;
only receipt completion is asynchronous. There is no await inserted between
append and the caller's admission seal. A DB error after sealing keeps the
actual immutable resident operation/seq and a failed receipt, even though queue
flush resolves. A different later successful operation cannot clear that error.

## Evidence and next gate

Deferred host tests exercise the actual queue, persistence projection and actual
CanonicalStrokeAdmission prepare->record->seal before injected DB failure. They
cover ignored rejection/synchronous throw, exact ORM-result disposal, full-column
conflicts, uncertain committed response, P2002 race, coalescing, no duplicate seq,
immutable caller-copy isolation, stale/equal/untracked objects, replacement-owner
completion and legacy queue ordering. DB access is mocked; no real database or
runtime was changed.

The next concrete transport unit must wait for these outcomes before ACK/relay,
repair RAM duplicates via the same identity, preserve outbox transient rejection,
confirm successfully repaired duplicates idempotently, and prevent different-
gesture failed-seq gaps from becoming falsely complete room state. Prefix,
loader/fork/snapshot fences and authoritative close remain explicit consumers,
not claims made by these primitives.

## Verified cold-loader provenance (separate from read readiness)

`roomPersistence.verifyCanonicalOperationRow` is shared by same-row repair and
cold load: positive safe sequence plus full indexed id/room/user/sequence/type/
layer/tool and JSON identity against the one existing insert projection.
`canonicalOperationRowSelect` adds indexed metadata without a second body read.
Legacy data-only test rows retain their existing behavior.

`adoptLoadedCanonicalWrites(record, rows)` is server-internal loader authority,
not a client grant. It requires the actual current resident record and exact
`row.data === record.operationsById.get(id)` identities, validates all canonical
rows before receipt changes, rejects duplicate inputs and ALL existing receipts
(including pending/failed), and registers succeeded receipts on the SAME numeric
owner. No row/ID/body journal is retained. The cold loader selects its winning
record and adopts synchronously; a losing cold load never marks its objects.
Malformed indexed/header rows reject before resident publication. Failed adoption
removes its just-created candidate; no asynchronous publication window exists.

Focused loader/log/persistence tests: 27 passed; existing room/snapshot regression
suite: 203 passed. Cases include equal-copy refusal, atomic mixed-row conflict,
replacement owner, pending/failed overwrite refusal, and deferred two-loader
race with only the winner known durable. These are mocked DB provenance tests,
not an actual database or publication gate receipt.

A zero numeric fence STILL does not prove cold-prefix completeness, historical
wash closure, or reader readiness. No join/fork/HTTP/snapshot gates are activated
by this slice; unknown historical objects remain unknown.
