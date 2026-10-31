# Explicit seeded-density author/material law — phase A

This unit adds only opt-in source program/material behavior. It does not execute
random masks, activate server policy/Room/UI or replace any existing raster path.
Coverage must explicitly equal neon64-f32-fma-seeded-density-v1; defaultAuto only,
primary-only single-role. The corresponding policy is
`default-auto-fixed1-seeded-density-v1` (fixed softness/lightness, not density).
Old profiles still reject density!=1 and keep their program IDs/behavior unchanged.
New profile programId has an explicit coverage suffix, so historical checkpoints
cannot silently acquire this policy. No new wire/checkpoint RNG fields are added.

Descriptor uses the separate shared DATA capability and preserves actual density.
SourceDabGeometry validation permits finite[0,1] only under this new defaultAuto
coverage; Gaussian/soft remain unchanged. Constructor checks exact policy/profile
pairing and caching. Density!=1 requires supportsCaching:false; direct planSourceDab
also rejects forged caching true. Existing no-cache law regenerates each accepted
physical material request and never reuses saved random content as Copy. Density1
uses the existing cache eligibility, with no newly introduced RNG consumption.
Checkpoint validation already compares saved geometry/profile/source against the
program and now receives the distinct new programId suffix.

Material adapter verifies matching new policy/source pin and original numeric
density in static comparisons/recipe generation. No geometry projection to density1.
Its pre-encoding incremental estimate charges FULL work/output for each newprofile
physical draw even when recipes deduplicate, matching committed shared accounting.
It splits before exceeding a cold chunk budget; existing old-profile interning is
unchanged. Physical mask generation is still explicitly fail-closed in Plan until
phase B consumer exists. The uncommitted seed helper remains unused WIP.

Fixture scope is deliberately synthetic: a validated retained Basic2 stock
descriptor, with only density mutated to.8 in its source data. It is NOT the real
Marker_Dry preset and does not claim its original option curves or a native GUI
stroke match. Retained raw KPP material exists, but no ready retained Marker_Dry
mapped coefficient/provider output was found in the task evidence; previous mapped
provider build receipts have paired cleanup. No new provider/runtime/dependency was
created merely to turn this behavior test into a native arithmetic claim.

Tests-first RED3 against old descriptor rejection, then final50 tests/5 suites PASS
(maxWorkers1): four new tests plus unchanged descriptor/defaultGUI/material/cache
suites. New tests exercise normal descriptor→SourceStrokeAuthor→MaterialAdapter→
Encoder, every-yield author checkpoint resume, frame packing variations, exact
retained density in decoded V2 code4 recipes, all material requests Dab, density1/.8
same option/perStroke RNG snapshots (zero draws), old profile rejection, forged
cache/policy/pin/checkpoint rejection and one-dab cold work-budget splitting.
Existing default GUI proof is unchanged and passes; this is not a new nativewhole
or pixel-density proof. Scoped lint0/diff PASS. Logs R52/density-author-first-red.log
and density-author-regression.log. App TypeScript pending coordinated ROOT gate.
No browser/device/process or new resource owner remains.
