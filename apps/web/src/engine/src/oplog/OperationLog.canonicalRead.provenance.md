# Recorded read capability ownership in the existing history

The optional `LogEntry.canonicalRead` is immutable metadata returned by the
shared attachment validator. It is not part of operation JSON, a pixel buffer,
a second gesture registry, an append grant or permission to activate rendering.
Existing operation IDs and entry.serverSeq bind the actual accepted operation;
the locally renumbered op.seq cannot substitute for that server sequence.

Append, confirmation and historical-page preparation validate the entire new
read before revision, undo-state or ordering mutation. Within the same captured
room/server epoch, equal same-author/stroke capabilities share one frozen object
found in the existing entry array. Different capability data or epochs fail
closed rather than silently changing a gesture. Resource readiness still needs
current local socket/room/context generation and authoritative refresh; a saved
entry is not evidence that a later server policy still authorizes execution.

Undo/redo preserves the same read references. Existing entry clearing/pruning
owns their lifetime. No independent cache or map retains them, and legacy
history without capabilities avoids the additional preparation basis array.
The supported read schema currently covers procedural material V2; historical
PNG/V1 delivery is not newly authorized by this unit.

Verification: all ten oplog suites passed (104 tests), then the three
OperationLog suites passed (47 tests) after the legacy-allocation adjustment.
The five new read tests passed again with undo/redo retention checks. They cover
actual soft source material, local versus server numbering, shared references,
serialization separation, pre-mutation rejection, pending and duplicate
confirmation, atomic historical preparation and epoch-change rejection.
Scoped lint and combined web TypeScript checks pass (including the concurrent
explicit V2 outer-composition implementation); the receipt is
fixes-v52/generic-sc4-common-web-tsc.log. No active editor, physical storage,
network delivery, native brush identity or device smoothness claim follows.

No browser, service, disposable runtime or dependency copy was created by this
history unit. Diagnostic logs are in fixes-v52/canonical-log-*.log.
