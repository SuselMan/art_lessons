# Closed-format canonical operation transport

This unit wires actual shared `CanonicalStrokeOperation`, authenticated
`canonical_stroke_begin`, `canonical_stroke_live`, and the existing acknowledged
`operation` channel to the concrete descriptor/CAS binder and frame admission.
There is no caller-provided resolver which quietly grants everything, no new
renderer/RNG/author execution, and no DB migration. Straight room creation/open
and the legacy web renderer remain CLOSED. Tests inject an authoritative
straight resident record only after normal legacy join; this is not a production
room-opening API. Numerical profile selection is the named server
`CANONICAL_ROOM_EXECUTION_POLICY`, not a frame claim.

## Authority and ordering

Begin uses the socket's authenticated principal and current pixel-owning board.
The binder validates runtime RGB8/outer opacity, explicit server alpha whitelist,
exact descriptor revision/source geometry and CAS. It prepares a grant without
publishing it. Successful brush pin precedes grant/session commit and the copied
data-only snapshot ack. A pin failure leaves no executable session. Later frame
colour, composition, numerical profile, source asset and static geometry must
match that pinned context. Begin retries preserve exactly the same grant.

All three canonical channels share a per-socket FIFO with at most 8 pending
commands. Overflow explicitly requests repair; it never silently skips a frame.
DB preflight does not reorder ordinal0/1. There are at most 4 asynchronous begin
loads process-wide, 64 resident room contexts, and 1024 pinned gestures. These
are explicit metadata bounds, not hard JS-heap guarantees or a second journal.

Live: prepare → immutable brush pin → admission commit → ack/peer relay; exact
live duplicates are not relayed. Recorded: authoritative duplicate-ID preflight
if the ID is absent from resident `operationsById`, then recheck the socket,
room/session/board+lesson identity and permissions. The synchronous critical
section is prepare → brush pin → existing recordOperation(server seq and existing
persistence queue) → admission commit → ack/broadcast. There is no await between
mutation and commit. Client user identity cannot replace the authenticated one;
new records cannot assign seq. Persisted same-ID/different room, user, timestamp,
layer or frame is rejected. An identical old retry returns its existing seq
without repinning, rerecording or relaying it.

Existing persistence remains fire-and-forget through the established queue;
this unit does not claim a new DB transaction durability guarantee. DB transport
failures preserve work with server_error. A recorded DTO is copied/decoded to a
frozen envelope before awaiting DB, so caller mutation cannot change the record
whose ID was checked.

## Prefix and lifetime repair

Unknown gestures drain the existing room write queue and query the authoritative
persisted canonical count for room + authenticated user + strokeId up to a pinned
seq watermark. A fresh begin requires count0 AND no contradictory resident
prefix. For an existing gesture, reuse the existing getOperationsBefore reader:
at most 64 recent room operations, 32 target frames, and 4 MiB serialized history.
Every target frame must be present, same identity, increasing seq and contiguous
ordinal/fences; the normal shared decoder/admission validates them. A bounded
read that misses a snapshot-covered prefix returns canonical_repair_required,
never a new ordinal0 grant. This intentionally does not implement an unbounded
full-history loader. The future ordinary repair reader must reconstruct longer
prefixes before enabling that continuation.

A validated reconstructed session advances both recorded and old-live cursors
without relay or a new DB write. Ack reports their next ordinals and whether the
gesture ended. Exact room AND lesson resident-object lifetimes are rechecked
after awaits. Replacement invalidates in-flight work and old grants, while a
socket reconnect to the same still-resident board can reuse its session. State
is not cleared merely because one of several sockets disconnects. Obsolete
lifetimes are reclaimed on subsequent canonical access; all retained metadata
is bounded. Epochs remain resident-lifetime identifiers, not durable DB epochs.

## Writer and checkpoint limitations

PM/unknown rooms reject canonical before pin/store/relay, including ID retries.
Old pixel writers in a straight room also reject before duplicate acknowledgement
or side effects. This temporary gate includes byte-neutral clear: it is not
intrinsically incompatible with straight pixels, but its serialization with an
active wash has not been integrated. Structural/meta operations retain existing
permissions. Blocking these scenarios is NOT a claim of complete straight-room
support.

Canonical frames are pixel writes in shared/web log metadata. All chunks of one
author's canonical frame.strokeId form one undo gesture, independently of legacy
stroke IDs. They are deliberately NOT added to generic snapshot coverability:
a wash frame may only be a preview backed by immutable original/local surfaces.
A future straight snapshot writer must use executor.checkpointReady/completed
fences and warm-prefix restoration, rather than treating each frame as an
independent stable prefix. Snapshot creation/opening is still legacy-only.

The future client drain must serialize/rebase ALL writes to an active wash
layer: A0/B0/A1 against A's immutable base would otherwise erase B. Server total
order does not perform this client rendering task. Teacher/owner intervention
still makes this necessary even on personal boards. Repair rejection is
transient; the existing outbox already bounds retries and retains stalled work,
rather than discarding it. No canonical author UI/outbox activation is added.

## Evidence

Actual Socket.IO tests use real binder, storage/CAS and room registry with a
mocked persistence boundary. They cover closed legacy formats, immutable begin
ack, live/recorded/durable retries, FIFO under delayed DB lookup, pin failure,
rights/lifetime changes after await, complete and missing persisted prefixes,
cross-room/user/frame ID collisions and bounded queue overflow. Independent
metadata tests cover pixel classification and canonical gesture undo/redo with
legacy and other-author controls. Existing room, socket, log and layer suites
remain regression gates. These are host/protocol tests, not GPU/native identity
or end-to-end straight-room rendering proof. Test sockets/servers and temporary
CAS directories are closed in cleanup; no persistent service/device is started.

## Auto V2 transport slice, policy remains OFF by default

The existing coordinator accepts an explicit immutable server execution policy;
the default keeps defaultAuto:false. There is no new route or optional bypass.
It uses the same concrete binder/admission, authenticated begin, bounded persisted
prefix reader and synchronous prepare→descriptor pin→record(seq)→commit→ack/relay
section. Auto's descriptor still gets pinned, but its assets[] requires no CAS
lookup. Shared snapshot gains a tagged V2 variant containing the pure server-pinned
material context; original V1 snapshot fields/shape remain unchanged. A snapshot
or source echo from the client is never authority.

The one typed trusted decoder seam covers live/record, durable duplicate checking
and cold prefix hydration. Existing MAX_ROOMS/MAX_GESTURES/MAX_BEGIN_JOBS and
PREFIX_WINDOW64/PREFIX_FRAMES32/PREFIX_BYTES4MiB are unchanged. After awaits, same
board/lesson/storage/authenticated session/permissions are rechecked. A missing,
clipped or incompatible prefix returns repair-required; it cannot create a fresh
stroke0. Hydration advances both recorded/live cursors without replay relay.

Host tests cover actual7 descriptors, three pressure/mirror packets each through
the actual author/adapter/encoder, live+record+duplicates, partial-prefix cold begin
and continuation, completed replay, missing-prefix rejection, pin failures in
begin/live/record without ghost grant/ordinal/seq, default-off/legacy/permission
rejection before effects, and bounded33-frame denial. DB operations are a bounded
in-memory test double; real coordinator/storage/operation seq/write queue execute.
Test-only dynamic imports exercise web author glue without making server
production modules depend on web code. Existing actual Socket.IO V1 tests remain
green. No service/process/device resource, persistent data migration, room opening
or client renderer/author hook activation was created.

Validation for this extension:74 focused tests/7files (including existing V1/V2
codec goldens),12 existing actual Socket.IO canonical tests, shared build, server
TSC and common web TSC5428 pass. Scoped lint/map:check/diff pass; map:rules reports
0 errors with15 existing orphan/cycle warnings. Test stores and write queues are
closed/drained in finally; no service, device, dependency or runtime remains.

Gaussian uses the SAME V2 begin/live/record/dedupe/reconnect and persisted-prefix
reconstruction path under an explicit server autoSources.gaussianAuto policy.
Actual six paint KPP descriptors, both scalar-Bionic and NEON profiles, pass
actual author/adapter/encoder packets through live, duplicate record, mid-prefix
cold reconstruction and final ended replay. Missing prefix rejects as repair.
No CAS reads occur. Normalized auto policy is deep-copied/frozen at construction,
while startup's default map remains empty. Existing image/default socket
regressions are retained. DB mocks prove ordering/admission, not actual durable
write success: awaited persistence outcomes and authoritative partial-close
remain separately open gates. No live room or renderer activation here.

## Durable canonical confirmation on the existing write queue

The current transport supersedes the earlier immediate ACK after resident seal.
prepare→descriptor pin→append(seq)→admission.commit is still synchronous; only
after that section does it await the actual stamped object's persistence receipt.
Pending writes produce no accepted confirmation. Failure returns transient
canonical_repair_required without rolling back seq, pin, immutable body or cursor.
An exact resident duplicate joins the pending receipt or explicitly retries the
SAME indexed row/ID/seq; it never allocates another sequence. A successful repaired
duplicate returns the verified accepted operation too, for at-least-once peer
confirmation through existing ID/seq deduplication. Unknown resident provenance
fails closed. The verified loader adoption seam registers only the actual frozen
objects in the winning resident record; indexed DB duplicate lookup now reuses
the SAME row projection/verifier as loader adoption and same-row repair.

Each session keeps only durableRecordedNext and its actual recorded tail object.
A new ordinal waits for its recorded predecessor, then rechecks lifetime/session,
permissions and admission before any pin or seq. The room's known failed-write
fence also prevents a different gesture's successful insert from falsely
confirming a room with an earlier failed slot. Current identity is rechecked after
the write settles; disconnect/replacement cannot publish a stale confirmation.
Already appended durable history is retained even if its requester leaves.

Actual default/Gaussian author-generated V2 tests exercise deferred inserts,
pending duplicate/begin/next ordinal, failed seal, coalesced explicit repair,
unchanged packed bytes/ID/seq/pin, next ordinal after repair, cross-gesture failure
and stale caller/room replacement. An actual Socket.IO test proves no ACK/peer
event while create is pending and confirms same-ID repair at its original seq.
DB outcomes are controlled Prisma mocks: these tests prove transport handling of
outcomes, not physical DB durability, arbitrary cold history completeness,
room_state/fork/snapshot readiness, authoritative close or renderer activation.
Those separate gates remain closed. No persistent service/device/DB resource was
created; test servers/stores close and their existing write queues drain.

## Atomic V2 confirmation attachment

After successful durability of the actual immutable accepted object (or verified
indexed duplicate row), the SAME session grant produces a closed V2 capability
attachment bound to actual operation ID/seq/original user. The shared attachment
validator runs before returning success to the socket handler. The handler emits
capability and operation in one operation_confirmed message; no capability-only
message, fabricated DB row, extra registry or early ACK is used. A preparation
failure after durability requires repair; it never invites replacing the stored
operation body. Pathological legal source metadata exceeding attachment byte
limits still needs an earlier BEGIN/pre-admission byte gate before activation.

V2 confirmations require the attachment. Historical canonical PNG/V1 retains its
exact old closed-lane payload/bytes without the field; the new V2 reader rejects
that unsupported domain rather than painting a fallback. This does not complete
V1 capability delivery or activate rooms/engine. Actual Socket.IO tests exercise
explicit test-only auto policy, delayed DB completion, mandatory V2 peer atom and
unchanged V1 shape. Production auto policy remains empty/OFF.

## Two-phase resident read preparation (not joined yet)

prepareReadDelivery checks actual mayReadBoardContent asynchronously, captures the
current board/lesson/storage/binder and caller's socket lifetime, then returns a
synchronous finish callback. The scope's boardEpoch comes from the SAME resolver
resident epoch owner as BEGIN, including empty history. It is not inferred from
an incoming attachment. finish rechecks context before/after preparation and
accepts only actual immutable resident objects with successful receipts owned by
the current room; equal copies, pending/failed/unknown or replaced-room receipts
fail closed. Existing loader adoption remains the source of cold resident
receipt provenance. No fake indexed row is manufactured.

The shared room_state type now permits canonicalReadScope/canonicalCapabilities,
but no join callsite emits them yet. Reader preparation must occur before channel
join; final snapshot finish, channel join and emit must be synchronous with no
await between them. joinRoom currently mutates seats/boardOfSocket and may evict
the old board, so blindly awaiting read permission after it and compensating with
leaveRoom would race newer joins. Existing authorized prepare/commit seating
needs review before wiring this seam. Global evacuateBoard similarly lacks the
register-local transport owner and stays an explicit straight-read blocker.
