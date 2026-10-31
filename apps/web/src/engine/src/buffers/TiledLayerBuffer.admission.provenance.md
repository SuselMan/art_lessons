# Direct tile storage admission (2026-10-31)

withPaintTargets is a bounded synchronous borrow in the SAME TiledLayerBuffer.
It validates safe tile geometry/fanout before enumeration, claims existing actual
target identities, reserves only absent direct-tile base bytes through the SAME
ContextStorageOwner, and passes that exact reservation through existing fine and
recovery allocation into AccumulationBuffer. Resident/mip bytes are not charged
twice. Target retention and any unused ticket retire on both callback and
allocation failure; source draw/lifetime checks remain their own authority.

The pure storageOwnerCurrent getter checks this buffer's migrated lease owner
without GL queries; a forgotten context epoch cannot authorize stale resident
reuse. Rebuild-session scratch and coarse allocations retain their existing
independent charges. There is no second owner, pool, registry or global budget.
The method does not preserve caller GL state or authorize a room/source profile;
it belongs inside the existing synchronous rendering ownership boundary.

Eight new finite-cap/lifecycle cases plus46 existing layer/coarse/eviction tests54
PASS, scoped oxlint/diffcheck and combined webapp+SW96712 PASS. Proof cases include
exact84B resident-mip reuse,148B resident+new ticket materialization,147B pre-GL
denial, shared192B scratch/layer capacity, actual evicted recovery, draw/allocation
failure, unsafe bounds/stale owner, and retained-target cap refusal before GL.
MockGL verifies accounting and lifetime, not driver residency or brush pixels.
There is no production executor/engine consumer yet. Finite whole-GPU policy and
active room/source rendering remain gated. No runtime resources were created.
