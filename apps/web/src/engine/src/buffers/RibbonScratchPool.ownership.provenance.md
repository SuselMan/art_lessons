# Shared scratch-pool GPU ownership metadata

This change uses the existing ONE RibbonScratchPool. It adds no pool, quota,
renderer hook or device resource. `gpuAllocationSnapshot()` reports frozen unique
records `{buffer,state:'live'|'free',bytes}` for buffers currently owned by this
pool. It reads `AccumulationBuffer.storageByteLength` without GL queries,
allocation, raster recovery, mip generation or ownership transfer. Creating the
returned metadata array/records is ordinary CPU allocation, not a hard JS heap
bound.

`bytes.live/free` also reads current storageByteLength: a caller may generate
mips AFTER acquire. Those levels remain charged after content invalidation until
buffer destruction. Moving live to free changes classification, not physical
charge. Trim/release idle ceilings retain the existing 64MiB and per-key24 limits,
now applied to mip-aware bytes. trimToCeiling snapshots free bytes once and
subtracts each destroyed allocation, avoiding a full-ledger rescan per deletion.
Encoding/filter/size key semantics are unchanged.
These are requested texture-storage bytes, excluding driver overhead and delayed
physical reclamation by the browser GPU process.

An identity ledger follows acquire/reuse/release/trim/destroy/forget. Unknown,
already-free and old-lifetime release reject before free-list mutation or GL.
This closes duplicate free-list aliasing: one FBO must not be borrowed twice.
No implicit foreign adoption API is introduced. Audited production callers:
RibbonStrokeScratch fields/secondary/spill atlases acquire from their pool;
whole spill entries move those same borrowed buffers and keep their identity;
snapshot restoration copies nonpool snapshots into pool-acquired storage.
StraightLayerPresentation and CanonicalFrameExecutor release their own acquisitions.
Cross-pool ownership transfer is not supported by this API.

Existing destroy semantics remain: destroy idle allocations, forget outstanding
borrowed identities without deleting borrowers' handles. Borrowers remain
responsible for handles; late release now rejects instead of resurrecting the
pool. Context-loss forget clears identities without delete calls. A later acquire
can start a fresh lifetime; an old release cannot affect its entries. This is a
metadata ownership boundary, not a new context-restoration coordinator.

Focused tests use MockGL for lifecycle/identity and actual byte metadata, not
pixel claims. They cover growth after acquire, stale-mip charge, immutable
snapshot, live/free/reuse, distinct encoding/filter resources, mip-aware idle
ceiling and holding trim, idle-only trim/destroy, forget without GL deletion,
and unknown/duplicate/late release rejection. Existing presentation/executor and
watercolor caller regressions are run separately. No actual GPU run is required
for metadata arithmetic; previous Samsung pixel receipts are not relabelled as
proof of this new source revision. Global ownership aggregation, reservations
and canonical activation remain separate work.


Validation logs are retained privately under fixes-v52/pool-ownership-*.log:
31 focused tests (ownership/encoding, actual executor and presentation callers),
97 other watercolor caller tests, and the three settle-plan lifetime tests pass.
The lifetime test's synthetic scratch is not a registered engine owner: after
engine.destroy triggers the original running-solver cancellation, its test-only
handles are forgotten and destroyed directly, not released to the destroyed pool.
No production engine teardown order was changed. Lint and web type checking are
required before committing this unit; this document makes no GPU pixel claim.
