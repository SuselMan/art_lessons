# Lightweight coherent PACK-only control

New `webgpu/macro19-coherent-dither.ts` exports coherentDitherDefinitions,
id `wgsl-macro-coherent-safe-dither`, same256phase controls as V16:
gain3/eddy16/curl0; gain3/eddy16/curl128; gain6/eddy24/curl128.
Coherent factory adds ONLY optional fourth packSourceOverride; absent override
continues using the exact old MACRO10_LOCAL_PACK. Pair source, field creation,
water/material equations, upload/bindings and output geometry unchanged.

PACK derives from macro15's safe integer bytefold remainder implementation,
replacing global fallback with local stationary-alpha fallback, exactly as
V10. No fullrange u32%257/%65792 instructions. Shared integer threshold for
all4channels maintains monotonicity/premul, including nearest pixels beside
literal fixed pigment. Threshold<denominator: zero carrier remains zero;
whole dry literal is exact. Capacity proof remains local nearest at stationary
pixels, convex bilinear elsewhere, with no clamp. Stochastic display rounding
is NOT a globally mass-exact algorithm and can change individual bytes.

Packing hash seed is FIXED0, explicitly in metadata.packingHashSeed and
packingSeedPolicy. It uses EXISTING packing phase0 uniform, never a new seed
uniform. Streamfunction still uses input.seed and paper; operation-field
metadata/SHA remain unchanged. This is deliberately a distinct display-control
seed policy from input-seeded fine-paper pack. No physics change is claimed.

No new GPU buffers, uniforms, dispatches, fine-init/deposit arrays or12fine
steps. Same11allocations and257dispatches at256phase setup. This distinguishes
cheap quantization effects from the ~84MiB additional smooth-fine model.
Banding reduction/quality improvement are hypotheses pending actual images.

9focused CPU tests PASS sequential1worker, strict/noUnused0. Tests compare
actual base and variant pair strings, ALL upload words (including ψaux), field
SHA, allocations, phase0 value and output ownership: only PACK source differs.
Input seed17 proves field is not accidentally replaced by fixed packing0.
100000 CPU hash/threshold/capacity cases, zero/dry/fallback and monotonicity
PASS. Mock compiles JS only, not WGSL; real GPU/artifact/crossdevice gate
remains mandatory. No GPU/browser/device/service/tempbuild created by author.
