# B1: internal recorded seal + existing metadata persistence

No socket listener, transport producer/emitter, source grant, absent-target BEGIN,
new registry/queue, renderer or activation is added. A typed pure seal remains
DATA: the future transport must verify actual indexed complete prefix/context and
current actor policy before using this internal control.

CanonicalStrokeAdmission.prepareRecordedClose only addresses an EXISTING session.
It checks recordedNext and the retained last recorded operation identity, plus
first identity while retained. It copies bounded seal scalars, then returns an
immutable exact-receiver revision ticket. Spread/copied/detached tickets and a
changed/cleared session fail before mutation. Commit sets recordedEnded and ONE
recordedSealNext scalar. It never creates a session/grant, increments an authored
ordinal/fingerprint or rewrites material entry/fences/average/source state.

After explicit seal, recorded ordinal>=N is rejected EVEN when that fingerprint
was already accepted live. Already accepted live retries may remain duplicates
and therefore never acquire a fresh relay; fresh live work is rejected. Retained
recorded0..N-1 retries keep existing digest/window semantics. Previously prepared
frame tickets become stale. Normal material gestureEnd remains separate; no
second explicit seal is admitted for an already recorded-ended session.

recordCanonicalCloseOperation accepts only an internal draft with NO caller seq.
It preserves own descriptors, supplies current server nextSeq, and uses the SAME
shared closed recorded parser before append. Hidden/symbol/accessor extras fail
before seq/receipt mutation without invoking getters. Same room/seq is rechecked
before the existing append, immutable resident object, receipt WeakMaps/counters
and ordered persistence queue. Unknown/copy objects cannot obtain receipts.

Existing metadata verifier/repair dispatches close through SAME shared parser
and full indexed row/body identity. Failed close remains failed after flush;
explicit retry of its actual same-ID object repairs one row, never seq2, another
ID or implicit upsert. Metadata is copied before queued work, so caller mutation
cannot alter repair. This is not row adoption or a completeness proof.

Tests combine real admission preparation, synchronous metadata append+seal,
actual queue outcomes and mocked Prisma: rejected close write leaves the admitted
cursor sealed and same-ID repair preserves seq/state. Additional tests exercise
stale/copy/reset, live-only ended tail, old-recorded retries, indexed column/body
conflicts, P2002 conflict verification, mutation and hidden/accessor input. No
physical DB durability, cold close reconstruction or native whole-stroke claim.

Validation:123 tests/6 suites PASS including existing source transport/socket
regressions, then33 tests/3 focused suites PASS after the own-key bound. Final
server TypeScript87903, scoped oxlint and diff checks PASS. The1000-extra-key
witness confirms zero descriptor-clone calls/seq/receipt mutation. No shared build or
web typecheck was needed. Tests drain their write queues and clear room fixtures;
no service/browser/device process, dependency copy or temporary runtime remains.

Remaining B2: actual actor/ROOM-prefix owner, expected-tail race, ordered actual
frame+close indexed recovery and existing-session sealing under SAME synchronous
append. C: genuine source-prefix executor/coordinator seal and live-only
reconciliation. Ingress execution stays OFF; canonical snapshotCoverage is false.
