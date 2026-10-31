# Original recorded-delivery resource in existing history

`LogEntry.canonicalInput` retains the exact input minted by the original local room-state/network owner. It is a nonenumerable, nonwritable own data property, outside operation JSON; it is not reconstructed from `canonicalRead`, a numeric epoch or a log scan. Existing history entries, ordering, pruning and clearing own its lifetime. No registry, queue, replay controller, source grant or engine/ingress activation is added.

Recorded append requires the original operation pointer before local journal cloning/close capture. Pending entries cannot carry a recorded resource. Confirmation instead compares the pending/local body at its authoritative server sequence against the original input using the same shared bounded closed projection, since local op.seq and object identity necessarily differ. Frame read comes from the original input; a separately supplied read must normalize identically. Existing same-gesture capability pin law remains enforced. Same original-author/stroke entries additionally require the same original lifetime and exact scope object, checked by scanning the existing entries and bounded incoming preparation basis. An equal-epoch replacement owner cannot mix into an already retained gesture; this policy deliberately requires authoritative rebuild rather than saving an unreplayable mixed gesture.

Original delivery and current lifetime are checked before revision/order/state mutation. An equivalent authority-bearing duplicate retains the FIRST exact input; a different/expired lifetime or changed scope/body cannot refresh it. A duplicate ACK without new authority leaves the resource as-is, including its expired status. Refresh requires an explicit authoritative rebuild/new log, not this API.

Incoming canonicalInput is captured through its OWN data descriptor before copying; getters/inherited resources are rejected without invocation. The private existing-entry copy helper copies known journal fields and preserves the captured resource explicitly through historical preparation, ordering and local sequence renumbering. External entry spreads intentionally omit it. Original input.operation and its server seq remain unchanged. Close retention only validates closed metadata/delivery: it does not prove target source, complete prefix or execution seal.

Tests call the actual room-state preparer with a shared V2 source/attachment and exercise original pointer retention, local/server numbering, pending confirmation, repeated/expired/new-lifetime ACKs, historical scratch copies, undo/redo, copied resources, accessors, conflicting normalized reads, changed pending body and whole-batch rejection before mutation. They do not call a network mint factory or open any close ingress. All twelve oplog suites (118 tests) passed with the new eight tests. No device, service, browser or disposable runtime is created; compact logs remain in fixes-v52/canonical-log-input-*.log.

Lifetime retention is real: the original room-state read can itself retain its bounded prepared tail/capabilities. Keeping one entry's original delivery may therefore keep that original bounded owner alive until all such entries are dropped. This unit does not claim per-entry heap isolation, copy that tail, or add another retained registry; future history pruning/rebuild must release the existing entry references normally.

The equivalent-new-delivery branch is also exercised through actual `prepareCanonicalHistoryPage` under the SAME original room-state scope: its new input has the original lifetime, confirmation accepts it, and the retained entry still points to the FIRST input. A separately prepared room state at the same epoch has another lifetime and is rejected for the same gesture on append, confirmation and historical preparation (including within one incoming batch).


## Same empty-journal publication precondition

`prependHistorical(entries, expectedEmptyRevision)` adds a local comparison to
its existing historical publication path. A supplied scalar requires the SAME
journal to remain empty at its captured revision; it is not a source authority,
full-history receipt, undo contract or engine activation flag. Undefined retains
existing historical callers. The early comparison rejects an already occupied
journal; the final comparison follows all original delivery/lifetime callbacks,
copying, ordering, normalization and preparation of initial pixel counters.
Only synchronous field publication remains in the guarded branch after it.
Existing scratch-log preparation is reused; the actual engine must still own
full-prefix validation, GPU replay, coherent layer publication and retirement.
No replacement log, proof registry, queue, source grant or renderer is introduced.

Four new tests failed on the old method. The real room-state preparer's captured
`isCurrent` callback is armed AFTER scratch preparation to reenter the actual
journal via append or undo. An appended live entry survives rejection; a no-op
undo changes the revision while leaving the journal empty and also rejects.
This verifies both conditions rather than only an empty-entry check. Successful
publication keeps exact original inputs, authoritative server sequence, local
numbering and pixel counters; repeated publication and invalid/stale revisions
reject. Existing historical calls and original-input tests remain unchanged.
These are host lifecycle proofs, not device pixels or a completed engine
transaction. No device/service/temporary runtime resources are created.
