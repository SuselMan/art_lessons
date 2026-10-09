# Actual SnapshotIO split-gesture backfill repro

CPU source gate only, no renderer/GPU claim or fix. Chronological actual protocol-shaped operations: A(seq1) and B(seq2) are same user/strokeId gesture on layer L, each has one meaningful dab; U(seq3) undoes B. Whole fold through OperationLog yields A/B both undone, pixelOpDoneCount L=0, layerPixelOps L=[] — correct logical whole gesture.

Joined tail contains B/U while snapshot prefix A is backfilled later. Test calls REAL SnapshotIO.absorbHistorical([A]), with only checkpoint notification/preload seam mocked. Current code yields A done/B undone, pixelOpDoneCount L=1, replay layerPixelOps=['A'] (one resurrected chunk/dab vs zero). Ordinary replay without a checkpoint would therefore receive unwanted A; whether a pinned checkpoint masks particular pixels is separate. No actual GPU pixels captured.

Vitest: one reproduction observation PASS and one EXPECTED FAILURE specifying whole-history equivalence. This is a known failing correctness contract, not two green correctness tests. No handcrafted mixed-state mutation. SnapshotIO scratch folds only unknown page ops; it does not apply held tail controls to newly learned earlier gesture members. Same-author live append after undo instead makes undone entries gone; that earlier proposed live reproducer was invalid and corrected.

Minimal fix must fold control effects over union of prefix/tail preserving server order, ownership, done/undone/gone, pending states and counts; broad inverse is not an exact rollback. No full snapshot fix implemented here. Queued-history worktree untouched.
