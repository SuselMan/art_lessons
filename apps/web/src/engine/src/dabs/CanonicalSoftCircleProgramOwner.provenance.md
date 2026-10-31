# Bound soft-circle preparation ownership

One `CanonicalSoftCircleProgramOwner` owns one fixed tip/native polynomial basis.
It reserves through the existing `BrushMipCache.reserve` before calling the
existing `prepareSourceSoftCircleProgram`. There is no independent budget, cache,
renderer, solver or arithmetic implementation. `advance(maxValues)` uses that
same bounded cursor; all leases receive the same immutable completed program.

Estimated charge is `16 * maxTableValues + 512 + 1024 + 128 * (knots + tuples)`:
number-array storage/growth allowance, existing64-F64 staging, continuation/tip
metadata allowance and copied polynomial metadata. The allowance deliberately
uses the supplied table bound throughout preparation and residency. It is an
estimate of reachable working storage under the existing brush allowance, not
a measurement or proof of JS heap usage, allocator behavior or prompt GC.

`acquire` is only legal after preparation completes. The consumer retains the
explicit lease until its evaluator completes or is cancelled. `retire` prevents
new work and borrows, cancels preparation, and releases immediately only if no
lease remains. Otherwise the last idempotent lease release returns the charge.
JavaScript cannot revoke an immutable program reference retained by arbitrary
code: borrowed references must stop being used before their lease is released.
These APIs do not claim that garbage collection has reclaimed escaped objects.

Construction/advance failures retire ownership and preserve the original error
even when cleanup throws. Release bookkeeping is detached before invoking the
release callback, so cleanup is never attempted twice. This source owner has
no active author, executor, wire or painter integration yet; eventual integration
must retain the lease across yielded evaluator work until completion/cancel.

Validation: `CanonicalSoftCircleProgramOwner.test.ts` (6 tests) checks all five
unchanged original native table constructors through cuts1/7/64/3/129, one
reservation and one program per owner, snapshot isolation, admission before
staging allocation, incomplete admission, retirement with two live leases,
repeated release, unfinished cancellation, prepare/advance rollback and primary
error preservation when cleanup throws after returning the reservation, exact
metadata charge with a companion reservation/mip eviction, and throwing last-lease
release notification with no repeated cleanup.
`npx vitest run apps/web/src/engine/src/dabs/CanonicalSoftCircleProgramOwner.test.ts --maxWorkers=2`
passed. No browser, service, dependency, device or temporary runtime was created.
