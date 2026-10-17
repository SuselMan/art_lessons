# #747: pre-guard material zero invariant and conservative fixed-window skip

Read-only audit of worktree `747-single-rect`, base HEAD `e0ba9553eb3b591d5796158392136fd78d8e25f5` (other agents had uncommitted changes). This document and the external candidate do not enable a runtime optimisation. No browser/GPU was opened for this audit.

## Material invariant, not zero auxiliary fields

Let S contain every nonzero RGBA channel of captured raw inkLoad, inkColor, solventLoad, foreignSolventLoad, combined water and coverage. Original presentation RGB is deliberately excluded. The native window creates fresh settled references from these captured P/C and global contrast; it does not import unrelated prior settled fields. In a general settle caller, independently supplied inkSettled/colorSettled must also belong to S.

For finite arithmetic, all P/C-producing operations preserve zero when every material donor they read is zero. Paper, pressure and masks change coefficients but do not inject P/C:

- `PagedContrastPhase.ts`, split shader: local C=0 gives excess/mobile=0; optical output is zero. Local P=0 multiplies `(1-q)` and remains zero, even with nonzero global background/regionKeep. Background/selection themselves remain global and need not be zero.
- `PuddleTarget.ts:118–145`: clones captured inkLoad/inkColor; aligns P.b from C.a; makes fresh settled references through contrast. `WatercolorSettlePlan.ts:413–477` stitches material and settled material, not `entry.original`.
- `raster/shaders.ts:3749–3803`: modes0/1/2/3 are material differences/sums/scales. Streak/fibre noise only multiplies material.
- Modes7/8/9/13/14/17/18 multiply material by gates or redistribute material. Divisor floors prevent zero denominators. Mode15/16 carry (`:3438–3512`) starts from `a`, removes a multiple of a and adds a multiple of neighbouring aj. Capacity is positive for the approved parameters; zero material does not become a cost value.
- `WC_DIFFUSE_FRAG`, `:3949–4008`: starts from ink and adds/subtracts donor ink. Height changes give/take coefficients only.
- `WatercolorSettlePlan.ts:1362–1460`: group tide seeds auxiliary cost, then gathers existing paint and redistributes it. The temporary COST fields are not material outputs. Explicit zero-material branches clear final P/C (`:1027`, `:1442`).

P/C may become nonzero **outside its original support** by finite-distance transport. The invariant is absence of generation beyond the dependency cone, not an unchanged footprint. `M70WindowPolicy.test.ts` traces the approved radius40/S1 graph, including sampling support, to612px; shader hash pins and parameter/branch restrictions are part of that certificate. A different schedule, reference reconstruction, parameter set or untraced shader invalidates admission.

Auxiliary pressure is explicitly nonzero on empty dry paper: mode10 seeds cost1 (`shaders.ts:3603`), modes12/19 write nonzero alpha. Do not initialise arbitrary auxiliary intermediates to zero and call that equivalent.

Coverage is handled more conservatively than P/C in the proposed skip. `PuddleTarget.ts` copies raw source coverage to `contour`; `publish()` always copies contour to output coverage. It does not expose the extended intermediate front coverage. Thus skipped groups can copy exact raw RGBA coverage, without proving all intermediate coverage fields zero. Retained groups remain entirely unchanged.

## Global phases and final guard

`PuddleTarget.ts:189` applies background before guard. `PagedPuddleTarget.ts:97` calls global `background.prepareSolved` before reconstruction/guard. Do not crop or independently solve global contrast, retained-component selection, eligibility, coarse gather, smoothing or background reconstruction.

Final guard has `wet=smoothstep(0,.03,initialWater.a*4)` and `mix(raw,result,wet)`: where sampled water.a=0, final P/C is raw. This preserves dry material; it does **not** justify discarding nonzero pre-guard solver outputs needed by global background.

A valid zero-fill before global coarse is restricted to points outside S⊕612. To compute the entire S⊕612 output using newly introduced cropped fields would require an additional612px field guard. The supplied candidate avoids new field boundaries entirely: it retains the existing `m70WindowGroups` field/core geometry and skips only whole groups whose every core misses S⊕612. Kept groups are not cropped or rebased. Original full-grid background receives the full logical solved fields, with only proven empty P/C pages left zero.

## External, unapplied candidate

`candidates/fixed-window-skip.patch` contains:

1. Capture support from already-read clipped material RGBA bytes. No extra GL readPixels; original RGB excluded. Scan includes every channel and water-only/optical-only records.
2. A guarded keep predicate with explicit GL-bottom-up→world-top-down conversion. Unknown metadata, invalid/nonfinite/out-of-page values and invalid cores keep full computation. Known empty capture is distinct from unknown.
3. `PagedPuddleInspection.skipEmptyFixedWindows`, default false, for QA A/B only. It changes no product UI and no field/core origin, size, halo, schedule or shader. Whole skipped groups leave P/C zero and copy raw coverage for their cores. Global phases still execute normally.

The patch was generated from the existing files without applying it. Base/candidate file SHA256 values are in `fixed-window-skip-manifest.json`; `git apply --check` passes against that snapshot. Re-check after concurrent changes before review/apply.

CPU verification: `node --import tsx docs/qa/runs/747-large-pages-20261017/candidates/fixed-window-properties.mts` passes3211 assertions: independent sparse byte support oracle,1000 independent integer pixel-distance intersection cases, odd301 capture coordinates, each RGBA channel, known-empty/unknown distinction, invalid/NaN/Infinity fallback and geometry immutability. Additional real fixed-group coverage ownership test checks every GL-row pixel exactly once and exercises both kept and skipped groups. These tests prove planning/ownership, not shader numerical equivalence.

## Remaining GPU admission gates

The source proof assumes zero-valued shader output remains RGBA8 zero, finite arithmetic and identical coordinate/filter/raster semantics. Existing tests use MockGL; they do not prove this on drivers with DITHER enabled. Keep the candidate OFF until native baseline/optimised comparisons pass:

- Read pre-guard P/C and raw contour coverage, global coarse fields, final P/C and actual target, not only presentation RGB.
- Same immutable raw fixture, same GPU, baseline full grid vs skipped grid; native DITHER state recorded. Zero channels must stay exactly zero. Do not disable DITHER as an unreviewed product fix.
- All-zero, water-only, optical-only, one-pixel/byte fringe; old dry RGB background; two far washes plus bridge; supports at612/613 boundary distances; finite edges and incomplete pages; A4/A3/A2 in both orientations.
- Exact fixed origins/cores must remain identical. The candidate introduces no odd301 window origins. Integer/multiple256 alignment alone is not a byte-exact proof of interpolation, shader math or dithering.
- Verify the immutable captured revision, approved radius40/S1 parameters and shader/schedule certificate before admitting metadata. Unknown provenance must use the full path.

No cross-GPU determinism fix is claimed. Existing full-grid runtime remains unchanged.
