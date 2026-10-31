# Unpublished historical scratch retirement (2026-10-31)

The actual _makeTileRebuilder factory allocates a scratch layer before preparing
its log prefix and replaying it. Previously an exception before returning the
TileRebuildSession left no session owner able to destroy that scratch. The
factory now retires the unpublished candidate and preserves the original replay
error even if retirement also throws. Successful sessions keep their previous
ownership and synchronous recovery contract.

Two tests-first failures reproduced missing destroy calls. Three focused cases
then pass, including real tile allocation/ContextStorageOwner bytes restored to
baseline, secondary cleanup failure, and successful ownership transfer. Combined
with actual rebuild-spill and tiled failure suites:12tests/3files PASS. Scoped
oxlint --fix reports only pre-existing warnings in engine/index.ts; diffcheck
PASS. Common50933 was concurrent with sibling tests-first and failed ONLY on
its then-missing preparePaintTargetRects; no whole-build PASS is claimed here.
Final combined webapp+SW16268 PASS includes these root paths and the sibling
cooperative physical handoff implementation.

No historical replay slicing, native brush identity or active editor admission
is established. This unit retires the layer itself; replay-cache side-owner
cleanup is a separate audit. No runtime resources were created by these tests.
