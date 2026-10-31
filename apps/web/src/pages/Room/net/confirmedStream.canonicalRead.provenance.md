# Atomic confirmed procedural read preparation

The existing confirmed-operation handler accepts an optional explicitly captured
room-state read scope. This is preparatory: Room/engine construction and source
rendering guards remain closed, and no caller derives expected epoch from the
incoming attachment. Local socket/room/context generation belongs to isCurrent.

For an attached operation, the shared closed validator runs before review-store
updates, replayGate holds, sequence cursors, outbox confirmation or painting.
The same existing replay gate retains a normalized frozen payload containing the
complete capability. Release goes through the same handler and checks scope
again. No second queue, dictionary or cross-operation capability cache is added.
Existing remote-apply and own-confirm callbacks receive the prepared read as an
optional argument. Their legacy call signatures remain unchanged when absent.

The captured procedural lane requires both scope and attachment. Missing,
corrupt or mismatched authority requests the existing full resync before any
mutation. A stale captured scope silently drops the old delivery. Historical
PNG/material-V1 without an attachment keeps its old handler path; the new
procedural read schema does not authorize it. Actual Room wiring, cold/history
scope delivery and passing read metadata through the real engine remain gates.

Verification: confirmed stream, new capability cases and existing replay gate
passed together (21 tests). New cases use real packed soft material and cover
pre-review/pre-queue/pre-cursor rejection, immutable remote and own callbacks,
complete held payload preservation despite original-object mutation, stale
scope on release, missing scope and missing capability. Scoped lint and combined
web application/service-worker TypeScript checks passed. No active editor,
physical storage or device responsiveness claim follows from these host tests.

No browser, service, disposable build or dependencies were created by this unit.
Receipts: fixes-v52/confirmed-read-atomic-tests.log and
fixes-v52/generic-sc4-common-web-tsc.log (combined check owner).


Captured scope uses the shared read-scope type, including an optional explicit
raster profile. The handler copies and freezes its room/epoch/profile/function
at construction, so later caller-object mutation cannot change authority. The
current-lifetime callback is still rechecked for each use and replay release.
A mutation regression test and explicit V2 log propagation pass in the combined
28-test run; common app TypeScript checks pass.
