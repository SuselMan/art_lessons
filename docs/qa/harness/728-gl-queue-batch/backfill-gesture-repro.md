# Actual SnapshotIO split-gesture backfill repro

CPU source gate only, no renderer/GPU claim or fix. Chronological actual protocol-shaped operations: A(seq1) and B(seq2) are same user/strokeId gesture on layer L, each has one meaningful dab; U(seq3) undoes B. Whole fold through OperationLog yields A/B both undone, pixelOpDoneCount L=0, layerPixelOps L=[] — correct logical whole gesture.

Joined tail contains B/U while snapshot prefix A is backfilled later. Test calls REAL SnapshotIO.absorbHistorical([A]), with only checkpoint notification/preload seam mocked. Current code yields A done/B undone, pixelOpDoneCount L=1, replay layerPixelOps=['A'] (one resurrected chunk/dab vs zero). Ordinary replay without a checkpoint would therefore receive unwanted A; whether a pinned checkpoint masks particular pixels is separate. No actual GPU pixels captured.

Vitest: one reproduction observation PASS and one EXPECTED FAILURE specifying whole-history equivalence. This is a known failing correctness contract, not two green correctness tests. No handcrafted mixed-state mutation. SnapshotIO scratch folds only unknown page ops; it does not apply held tail controls to newly learned earlier gesture members. Same-author live append after undo instead makes undone entries gone; that earlier proposed live reproducer was invalid and corrected.

Minimal fix must fold control effects over union of prefix/tail preserving server order, ownership, done/undone/gone, pending states and counts; broad inverse is not an exact rollback. No full snapshot fix implemented here. Queued-history worktree untouched.

## Scoped fix after algorithm review

SnapshotIO now calls affected-gesture reconciliation after merging the page. Scratch folds ONLY known merged chronology; commits ONLY gestures identified by newly learned stroke chunks/control targets. Actual serverSeq/local seq/pending/order stay unchanged; unrelated known states are not replaced. Known gone control effects are suppressed; existing gone entries stay gone. Counts update by exact done-state deltas.

Unknown-prefix guard: when a held affected gesture is undone but no known valid control witness exists in the bounded union, reconciliation leaves that gesture's states unchanged and reports its identity through SnapshotIO.historicalGestureUnresolved(). It does not infer missing history as done. This leaves unresolved cases for later evidence; not a universal snapshot-state repair. Historical unrelated action branching is represented in scratch when resolving affected gestures, but unrelated known gesture states are intentionally outside commit scope.

Actual reproduction contract is now ordinary PASS (no expected failure). Additional cases cover redo/pages/repeated backfill, different author same strokeId and invalid foreign Undo, late chunk branching with pending confirmation metadata, rejected control tombstones, new historical control without new chunks, single-entry revoke, unknown witness refusal, and opcount stability. CPU semantics only; no GPU/production rollout. Complexity is background scratch-fold work, potentially quadratic with current append/control APIs; not inserted into live drawing.


Independent review found an old-witness counterexample: held Bseq3 undone by missing later control, newly backfilled Aseq1/U(A)seq2. Any-control witness was insufficient: known wholefold A/U/B would incorrectly revive authoritative held B. Guard now requires a valid known same-gesture control **after each authoritative held undone entry** in merged chronology. Otherwise entire gesture reconciliation is unresolved/unchanged. Exact actual SnapshotIO case added; no earlier control can stand in for unavailable later control.


## Atomic admission closes downstream unknown-history exposure

The earlier leave-gesture-unchanged behavior is superseded: any unresolved affected gesture rejects the entire candidate page before commit. OperationLog.prependHistoricalReconciled clones exact existing journal metadata/counts, merges/folds once, and atomically promotes only an admitted candidate. On rejection, known entries/order/pending/serverSeq/revision/counts stay byte-for-byte logically unchanged. SnapshotIO does not increment loaded-prefix count, mark checkpoint coverage or start preload. Newly learned provisional done chunks never enter layerPixelOps or bake inputs. Caller can retry the same page together with the missing later control; supported retry commits once, repeated page is idempotent.

Successful merge replaces entry/op objects just as existing prependHistorical already did; no new external identity contract. CPU tests include no-mutation/no-callback rejection and supported retry. This refuses some useful known history conservatively; no automatic fetch/recovery UI was added. Potential background O(n²) fold remains explicit and unprofiled; no performance claim.
