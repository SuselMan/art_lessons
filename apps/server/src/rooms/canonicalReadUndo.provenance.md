# Scoped V2 read/undo prefix preparation (2026-10-31)

The SAME CanonicalRoomTransport read owner now offers internal preparePrefix.
It establishes the known anchor from an actual indexed row or exact succeeded
resident receipt, queries one target at the captured durable cut, reauthorizes
and rechecks board/lesson/storage/operator/lifetime, then binds every decoded
frame against the anchor's immutable ROOM-only V2 capability. An absent original
author or conflicting reader personal library confers no new append grant. No
pin/import/write, descriptor change, session publication or new registry occurs.
Runtime purpose must be exactly read or undo-redo; unknown/missing purpose cannot
downgrade the latter. Open prefixes remain readable; undo/redo requires recorded
normal gestureEnd. This is not an invented partial-close or zero-draw author frame.

Structural projection moved from the targeted query into existing roomPersistence
projectCanonicalIndexedOperation. Query, loader and read binder reuse ONE closed
bounded header projection and actual indexed-row verifier. RGB count/scalars,
known own fields and packed byte bound precede clone/normalized UTF8 size walks;
material domain still belongs to the SAME shared decoder. The projection itself
confers neither query provenance nor read/paint authority and adopts no receipts.

Existing snapshotReplayLoader accepts an optional internal preparer. It validates
all represented V2 gestures, including no-snapshot cold tails, and resolves known
undo/redo target chains before any returned plan. Complete prefix rows merge into
existing byId/canonicalRows/historicalIds only after proof and aggregate checks:
64 V2 gestures,1024 total operation bindings,4MiB normalized canonical evidence
across ALL groups, not64×4MiB. Local grouping/proven/sizing metadata exists only
within that preparation attempt; no persisted completeness or body registry.
Legacy operation payload schemas retain their existing owners. The loader's
existing watermark retry discards the whole candidate on concurrent change.

Pure snapshot planning uses a V2 group's verified ordinal0 firstSeq for canonical
history dependency cutoff. A0seq1/Aend4/snapshot2 + undo(target Aend)seq6 therefore
rejects snapshot2, just like undo of A0. Missing, duplicate or conflicting first
context is unresolved. Immutable header context includes author/layer/brush/
stroke/profile/RGB/composition and excludes a materialV1 first frame as V2 proof.
Full decoded material/fence authority remains the loader's job. Historical PNG
materialV1 keeps its prior addressed-chunk lane; it is not granted the new read
contract, and malformed/unknown tags never enter that V1 exception. Revoke stays
its existing single-entry command semantics; conservative dependency rejection
is not a promise of whole-gesture revoke.

Straight join prepares its genuine authorized read owner BEFORE dependency
loading; candidate+finish→seat commit→channel join→state emit still has no await.
Failure preserves the old seat/participation/channel state. The existing HTTP
snapshot-index route passes the SAME injected owner's preparer to the existing
query helper; failed/stale proof returns409, never a false204/index. No endpoint,
payload schema, renderer, source author, editor or coverage gate was enabled.

Validation:272 tests/15 suites PASS in broad shared/server regression, then35
focused loader/plan tests PASS with the final V1-first-as-V2 context case. Final
server TypeScript82508 PASS; scoped oxlint/diff checks PASS. Real socket.io tests
exercise durable V2 confirmation→undo→rejoin/capability delivery, redo preserving
normal-end admission closure, late frame rejection, and failed known-prefix
preflight with no membership write/state emission. Real transport/query tests
exercise absent author, conflicting personal descriptor, immutable binding,
open-read/closed-undo distinction, purpose/permission/lifetime failures and no
read-side pin/write/append grants. DB outcomes are mocked; no physical storage
or native whole-stroke raster claim.

Remaining: durable ordinary undo ACK/outcome, authoritative commitPartial close
META, live-only reconciliation, historical closedAt(cut) snapshot bake/coverage,
scoped client history repair and actual editor/source activation are separate
coherent gates. Canonical snapshotCoverage remains false. Tests close their
socket servers and remove BrushStorage temp dirs; no persistent processes,
browser contexts, dependency copies or QA services were created or retained.

HTTP index follow-up: after dependency loading, reauthorize the reader and call
the ORIGINAL prepared read owner finish([],[]) synchronously after the final
await, including empty/V1-only indexes. Same-record storage/operator swaps now
return409; revoked access returns403 before publication. No fresh owner can
bless stale index bytes. Actual CanonicalRoomTransport/BrushStorage tests cover
both context swaps without a prefix callback; all26 route tests, scoped oxlint
and final server TypeScript62224 PASS. Temporary BrushStorage directories are
removed in finally; no persistent runtime resources remain.
