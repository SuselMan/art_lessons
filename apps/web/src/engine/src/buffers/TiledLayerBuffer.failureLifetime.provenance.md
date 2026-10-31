# Layer tile failure lifetime (2026-10-31)

The existing layer owner now retains newly created fine/recovery/coarse buffers
until their initial clear succeeds. Recovery retains an unpublished candidate
through read/upload/scan, retires it on failure, and always closes its existing
TileRebuildSession. A cleanup error cannot replace the triggering read/upload
error. Earlier successfully recovered tiles keep their content and coarse debt
when a later candidate fails; the failing key remains evicted/recoverable.

clear/destroy detach all owned fine/coarse allocations before attempting every
child retirement, with first-error propagation and no repeated retirement. The
retained-target refusal stays before mutation. An eviction victim becomes
recoverable before its destructor is called, so a cleanup failure cannot leave
a retired texture published as resident. There is no recovery mirror or new pool.

Verification: six lifecycle fault tests plus40 ordinary layer/coarse/eviction
regressions46 PASS; scoped oxlint/diffcheck. Tests first reproduced the new clear,
recovery-session and multi-child destruction leaks. Extra cases cover partial
recovery coarse debt, failed coarse allocation publication and retry after an
eviction retirement fault. These are ownership/content-bookkeeping tests with
MockGL; no native brush pixels or actual device failure recovery claim. Storage
counters refer only to migrated domains and remain complete:false. No runtime
process, service, dependency copy or disposable build was created by this unit.
