# ToolSync original image asset readiness

2026-11-01 scoped correction. isBrushAssetReady(id,expectedSide?) legitimately
checks an optional declared side. Passing it directly to Array.every also passed
the array index as expectedSide (first index0), so a fully prepared original
image brush stayed locked. Use an explicit one-ID callback; no asset loading,
engine/source/read/BEGIN/preparation lifecycle or layer policy changes.

Tests-first actual RED: one failure/five passes in useToolSync.test.ts. The
positive case installs validated original Mountains metadata and all four real
SHA-verified decompressed asset byte arrays. It uses the actual importedBrushAssets
and actual two-argument isBrushAssetReady (not an always-true readiness mock).
After completed engine preparation, readiness incorrectly remained false.

The hook host harness also invokes real useLayerStateSync: ready image unlocks
its mock engine's ordinary layer lock, restoring content relocks it, and declared
but missing original pixels stay locked even if the preparation stub returns
ready. Existing stale async availability, empty library and legacy preparation
cases remain covered. This is a hook/lock-flow test, not an actual engine factory
or GPU/pixel claim; ROOT owns immutable UI/device confirmation.

Production change is only `.every(id => isBrushAssetReady(id))`. No fetch,
ad-hoc pixel installation, error clearing, forced unlock, fake original input,
END or ACK is added. No services/devices/runtime started by this unit.

Final HOST gate:19 tests/3 suites PASS (ToolSync, canonical availability and
tool choice); targeted actual-app-options TSC17072 PASS including the actual
hook/lock consumer test; scoped oxlint0 warnings/errors, owned diff check PASS.
