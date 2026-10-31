# Samsung GenericSC U8 GPU gate

2026-10-31. Samsung SM-T970 / R52RB0JXVSY, Adreno 650, Chrome 156.

- Actual `CanonicalRgba8CompositePass`, WebGL1: 260 source-law native vectors + 4 absent-mask MULT3 witnesses, each straightRGBA and cache-owned maskRgb: **528 draws PASS**, 0 differing bytes, maxDelta 0. Each of multiply/lighten/colorDodge/overlay has 65 fixture vectors plus one MULT3 witness per source lane.
- Existing WebGL2 integer shader helper: **264 cases PASS**, 0 differing bytes, maxDelta 0. Separate helper parity, not a WebGL2 pass claim.
- Branch/alpha/mask and float32 control quantization inputs retained exactly from fixture; controls canonicalized by existing helper. Source masks include present mask0 and partial byte masks, with explicit hasMask.
- GL errors 0; WebGL1 sentinel GL state and awkward source samplers restored, leases balanced, no upload/buffer write during draw. Final cache GPU and CPU reservation charges 0.
- Source-law oracle scope: pinned native C++ GenericSC/Base/Maths/IntegerMaths + extracted functor bodies/interfaces; **not installed ARM/GUI oracle, not room execution grant**.

See `generic-sc-u8-samsung-result.json` for source/bundle/body/fixture hashes and `generic-sc-u8-samsung-cleanup.json` for cleanup. Tested memory bundle sourced from combined worktree HEAD 72d839629; production files were not modified by this task. No disk bundle, QA frontend/backend, dependency install, or new service. Only owned browser child and ADB forward were created; both removed, all three original tabs id+URL unchanged.

Two harness-only preflight failures preceded this passing run: invalid 1x1 view bounds (old padded helper), then removed `cache.put` API. Fixed bounds and used actual `allocateOwnedBrushTexture` + manifest + `putOwned`; production validation unchanged. Failure cleanup receipts retained, no forward/child leaked. Final run exited 0.
