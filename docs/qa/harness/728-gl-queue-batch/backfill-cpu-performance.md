# CPU backfill admission: bounded synthetic measurement

Current VPS, instrumented per-method timers; not a user room log, device, GPU or drawing benchmark. Histories have confirmed serverseq, three chunks/gesture then Undo/Redo, 1k/5k/10k ops; one missing earliest chunk accepted, or unknown-authoritative-undone page rejected. All six state/count/seq/pending or rejection-no-mutation oracles PASS. Total run <30s; no services/GPU/dependencies.

| ops | accept ms | reject ms |
|---|---:|---:|
|1000|42.7|31.6|
|5000|416.5|348.4|
|10000|1092.1|1104.1|

10k accept instrumented self-times: applyUndo369ms/2000calls, reconciliation362ms/1call, applyRedo202ms/2000calls, append134ms/10000calls, candidate promotion18ms. Reconcile contains repeated target `find`, entry `indexOf`, full scratch fold. Undo/Redo repeatedly scan/filter entire scratch prefix; append walks entire history for author branch invalidation. Thus background room load can synchronously stall ~1s even on this VPS. Timer instrumentation perturbs this measurement; one pass per size/mode, no statistical or device-speed claim.

## Narrow next proposal, not implemented

First obvious rejected cases already produce unresolved before scratch fold: return immediately before expensive fold (same admission outcome) rather than spending another ~1s to reconfirm rejection. Test terminal-conflict guard still needs fold for laterRedo counterexample.

For supported candidates, build immutable id→entry/index and (user,strokeId/opID)→affected members maps once. Fold only affected gesture states in one chronological pass through known union. Every non-meta author action must still invalidate affected undone states for that author even if the action is unrelated; meta target lookup uses map and original ownership/type guards. Keep per-author set of currently undone affected entries, so branching updates only actual changed affected states, not all historical entries. Undo/Redo of unrelated gesture are no-ops for affected fold, while controls addressing an affected member update exactly that gesture's eligible states. Preserve gone tombstones/skip gone controls, pending-tail order, unknown-prefix terminal guards. Commit exact count deltas to admitted candidate only.

Expected O(n + affected-state-transitions), worst O(n×affected-members) when everycontroltogglesa hugegesture; do not claim universally linear. Reuse full scratch fold as CPU oracle across existing cases and randomized bounded histories before deleting it. No implementation authorized here; root review first. This is a load optimization, not a live pencil latency fix.


## Narrow indexed witness + early reject implementation

Only target-id/index lookups became per-admission maps (first duplicate-ID behavior matches original find), plus immediate return for already-proven unresolved before scratch. Full scratch fold and terminal conflict guard remain. Reject atomic candidate semantics stay unchanged; early diagnostics report proven missing-witness identities without scanning later terminal conflicts. Unsupported page is still unaccepted as a whole.

Same exact synthetic six inputs, one instrumented repeat on this VPS: 1k accept35.6/reject5.0ms;5k340.0/16.1ms;10k734.9/34.1ms. Against prior1092.1/1104.1ms at10k: ~33%/~97% less time; NOT statistical device speed claim. Reconcile self362→24.9ms; remaining applyUndo333/applyRedo202/append145ms are unchanged fullfold costs. Reject has0 append/Undo/Redo calls. No complete indexed fold introduced.

52 CPU tests PASS including80 fixedseed random ordered U/R/revoke/author ownership/pending/gone scenarios against frozen pre-optimization reconciliation oracle; actual SnapshotIO rejection/terminal/control fixtures retained. Frozen helper is test-only, not a second runtime path. Accepted journal states/counts/revision match; rejected candidates never commit even when early diagnostics are a subset of eventual conflict witnesses.
