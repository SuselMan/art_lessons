# Nested GL owner cleanup

Implementation: `8ae79a700`. Scope: existing WatercolorPasses, RibbonPasses,
ShapePass, Exporter, SmudgePainter, ScratchSlot and ScratchFreeList. No new
resource owner, pool, renderer or cache was introduced.

Teardown detaches owned names/collections before callbacks, attempts each
remaining child even after failures, and rethrows the first failure. It
unbinds only a currently bound owned program. A known lost context retires
names without deleting them. If the context-status query itself throws,
cleanup still attempts the remaining resources and preserves that first error.
SmudgePainter clears its own CPU mip cache only; a supplied mip cache stays
with its caller. Idle scratch and checked-out reservoirs retain separate owners.

`nestedOwnerCleanup.test.ts`: 23 lifecycle/fault cases, including reentrant
teardown, repeated destroy, first and later throwing children, status/query
failure, optional-program release, foreign binding/cache, and context loss.
Together with four existing Smudge/Exporter suites and engine initialization
rollback: 43 tests passed, maxWorkers=2. Scoped oxlint and diff check passed.
Combined web application and service-worker typecheck run 39608 passed.
The earlier failing common typecheck contained only concurrently edited tests
outside this change; it is not counted as a successful gate.

These tests establish retirement and deletion attempts, not reclamation of JS
or driver/compiler memory. A throwing driver deletion has no retry through a
retired owner. Context loss during a cleanup call is not preemptible.
No device session was required for this lifecycle unit.
