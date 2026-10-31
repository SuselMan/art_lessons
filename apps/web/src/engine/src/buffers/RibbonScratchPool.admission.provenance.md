# Same-pool scratch storage admission (2026-10-31)

prepareAcquisition snapshots a bounded validated request plan, claims idle
allocations in this pool and reserves only missing base bytes from the existing
ContextStorageOwner. take materializes from that exact StorageReservation through
the existing AccumulationBuffer constructor. Resident/mip storage is counted once.
There is no second pool, registry, physical budget or numeric no-op reservation.

close returns only untaken claims and releases unused reservation. Taken buffers
remain ordinary borrower-owned allocations. Failed acquisition retires the plan;
stale pool/context epochs cannot return old buffers to a new owner or retry after
uncertain driver storage. Lost-context cleanup makes no stale GL deletions.

Verification: pool admission/ownership/encoding/context suite32 PASS; final10
admission cases PASS, scoped oxlint and web typecheck. Exact finite-cap cases cover
resident mip reuse, mixed resident/new handoff, denial before allocation, overlapping
plans, cancel, failure, destruction, loss and orphan charge. MockGL proves ownership,
not GPU pixels. This is a partial migrated physical domain (complete:false), not a
whole-GPU or device memory cap. Presentation/executor consumers require explicit
handoff integration before active source rooms. No new runtime/temp resources.
