# Portable float32 Over: explicit approximation boundary

This fixture is 512 actual calls of the unchanged `compositeOnePixelScalar`
from pinned Krita `bd6e8d061d2f0388c5b10278786cf0fe62e3135f`, together with
unchanged `OptiRound::roundScalar` and `OptiDiv::divScalar`. Sources and SHA256
are in `source-lock.json`. `scalar-driver.cpp` provides data/Qt traits only.
`assemble.py --source-dir <pinned-source-directory> --output <temporary.cpp>`
reads those independently retrieved pinned files. It preserves upstream
SPDX headers in generated source. Build with existing g++:
`-std=c++17 -O2 -fno-fast-math -ffp-contract=off` on x86 SSE.
The generated executable is not retained.

This is NOT a receipt of the Android installed binary, active factory dispatch,
SIMD packets, FMA, NEON, profile conversion, or the complete paint pipeline.
Native bodies retain LGPL-2.1-or-later (`KoStreamedMath.h`) and LGPL-2.0-or-later
(`KoOptimizedCompositeOpOver32.h`); see their pinned SPDX headers. The ARM32
rounding branch also contains upstream MIT sse2neon notice. No upstream native
implementation text is copied into the production TypeScript kernel.

The separate portable kernel is an authored float32 model using exact IEEE
single-precision division and nearest-even byte stores. It exactly matches510
of512 SSE scalar receipts and alpha for all512. Cases213/253 differ by1 RGB
because native scalar SSE uses hardware reciprocal estimate. These residuals
are explicitly asserted, not fitted or dismissed as native identity. The
integer fallback remains a separate model and existing rendering is unchanged.

Mask application at material storage and a composite mask are different:
source alpha128 with mask1 stores alpha1; painting that with opacity.99 keeps1.
Passing mask1 only to the float composite gives alpha0. The helper assumes the
caller has already performed every required material storage stage.

## Explicit NEON64 scalar point profile

`sourceOver32Scalar.ts` is the single shared CPU point evaluator for old portable
IEEE-division and explicit `optimized32-neon64-scalar-frecpe-rne-v1`.
Old public portable API remains a thin wrapper. The original512 outputs retain
SHA2566f0678bc1aab2b0efaf0b69c2a49e12ae26efdd6f16fc6aa8368d964ad00bf56
(JSON array of RGBA); residuals against native SSE remain exactly213/253.

The actual unchanged ARM `OptiDiv::divScalar` duplicates divisor/dividend, uses
ONE vrecpeq_f32(divisor), then vmulq_f32(estimate,dividend), then lane0. No Newton
step/refinement/division replacement occurs. Native NEON64 round performs
vrndiq_f32 then vcvtnq_s32_f32; this explicit profile pins FPCR nearest-even,
gradual values and no FMA. No packet shortcut or factory dispatch is implied.

`scalar-neon-semantic.native.json` retains2048 executions of the SAME unchanged
source scalar, rounding and division bodies, compiled on HOST with typed ARM
instruction semantic shims. This is NOT an actual ARM composite receipt.
FRECPE shim implements the mathematical instruction model, without estimate
lookup tables; the production primitive was independently matched against155636
actual Samsung instruction records (sourceArmFrecpe fixtures/provenance).

Reproduce using original assembler command plus `--neon-semantic`, then compile
with -std=c++17 -O2 -fno-fast-math -ffp-contract=off and execute. Original assembler
mode/driver and512nativeSSEreceipt remain unchanged. `neon-semantic-proof.json`
pins source inputs, generated CPP and shim/driver/output hashes.
The instruction model is authored, while unchanged source bodies occur only in
disposable oracle output with original license notices. TypeScript evaluator is
source-informed, not clean-room. Source alpha already includes material coverage;
optional byte mask remains ADDITIONAL composite selection, never folded early.
