# Canonical undo/redo: same log, actual write outcome

This is the existing operation event and undo/redo schema. No close META,
renderer/source activation, new queue, receipt registry or default policy grant.

Socket routing precedes generic duplicate ACK: straight-room undo/redo and an
actual resident SAME-ID receipt enter the existing bounded canonical FIFO.
Closed request fields are copied before queuing. Transport metadata returns an
explicit legacy classification only for a proven legacy/V1 terminal. Missing,
malformed, cyclic, out-of-order, over64-hop or failed-query targets never fall
back to legacy. PM/V1 existing admission and ACK behavior remain unchanged.

The classifier follows actual resident identities or actual indexed query rows
at a captured cut. Intermediate tracked metadata waits for its existing outcome
without retryFailed; failed dependencies are never repaired under another ID.
An untracked resident intermediate needs its exact actual indexed row before
following its target, with member identity/body rechecked after the await. Indexed identity verifies room/author/id/seq/type/layer/tool
AND JSON. Metadata projection retains only bounded own fields; canonical source
frames use the existing projector/decoder/ROOM binder. Resident metadata chain
snapshots are rechecked after awaits. No queried operation gets a fabricated
receipt, adoption, personal brush lookup, pin, import or append grant.

A cold resident frame without a succeeded receipt is first cross-checked against
its actual indexed row and projected as read evidence, without minting/adopting
a receipt. Missing/tampered row fails closed. Existing metadata duplicates start
the decreasing dependency sequence at their VERIFIED own seq, not the current
cut or caller requested seq; a target at/after that metadata cannot qualify.

For a V2 canonical terminal, the existing read owner proves the full ended
prefix with purpose undo-redo. That read is NOT editing permission. The actor's
existing operation gate, membership, room/lesson/storage/operator lifetime and
original current callback are checked after awaits. The target must belong to
the actor. Captured verified target-layer policy is checked inside current()
after EVERY await, including persistence and indexed duplicate checks. Tracked
SAME-ID retries first resolve a legitimate actual target, then repair the
existing receipt without rerunning read-prefix preparation behind its own failed
write fence; the anchor still needs a succeeded actual frame receipt or exact
indexed row. No new read/paint grant is created by that retry. Source
policy OFF remains closed. Open/missing prefixes never append metadata.

The synchronous section updates existing mirrors and appends immutable small
metadata through the SAME operationLog receipt WeakMaps, room counters and
persistence queue used for canonical frames. No await separates those effects.
ACK success and confirmed relay wait for the actual queue outcome, then recheck
current ownership and policy. A failed insert remains failed after flush. Same-ID
retry joins pending work or repairs exactly the same immutable indexed row;
no second seq, mirror application or appended record. Copies, foreign owners,
conflicting IDs/bodies/indexed rows do not acquire receipts or false success.
At-least-once successful confirmation uses existing client ID/seq deduplication.

Tests use real socket.io, BrushStorage, current transport, actual frame author/
adapter/encoder and the real persistence queue. Prisma outcomes/rows are mocked;
this is NOT a physical Postgres or native whole-stroke rendering claim. Tests
cover delayed ACK/relay, failed insert and repair, row conflicts, old receipts,
connection/room/operator/closed-policy changes, bounded cold target chains,
mutation while awaiting prefix proof, open target, policy OFF and legacy/V1
classification. Temporary BrushStorage dirs and socket servers are removed by
existing finally/afterEach; no persistent runtime or dependency copies retained.

Remaining: explicit commitPartial META requires a separately reviewed additive
shared parser/client META owner, persisted close recovery and recorded-prefix
seal. Undo/redo never provides such a seal. Historical closedAt(cut) snapshot
coverage, live-only reconciliation and actual editor activation remain separate.
Canonical snapshotCoverage remains false.

Validation:142 tests/6 suites PASS (transport, log receipts, persistence, real
socket handlers, replay loader and HTTP routes), then43 focused transport tests
PASS with explicit cycle evidence and the64-hop query bound. A final13-test persistence run also confirms repair captures its closed metadata
before waiting, so caller mutation cannot change the queued row. Final server
TypeScript4626 PASS; scoped oxlint/diff checks PASS. Layer lock/deletion
witnesses run during write and the final indexed duplicate query. Cold resident
anchor and intermediate metadata missing/tampered rows fail without adoption;
pending intermediate failure never causes a repair of that different ID.
No shared/web source change or duplicate common web typecheck was needed.
