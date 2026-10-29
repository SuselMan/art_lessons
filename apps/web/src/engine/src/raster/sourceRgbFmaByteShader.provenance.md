# Exact RGB fused-to-byte diagnostic specialization

Source-informed arithmetic, sharing the derivation in `sourceRgbFmaByteModel.provenance.md`. The GLSL implementation uses bounded integer-valued highp float limbs, not a general80-bit FMA per channel. Coefficient decomposition is shared across RGB. Caller supplies the components of the SAME finite F32 coefficient in [0,2] and byte channels. Alpha remains the general exact FMA kernel.

Actual Samsung SM-T970 / Adreno650 WebGL1 highp23: all7961 independent original installed FMADD→FRINTI→FCVTNS instruction oracle cases byte exact, GL0. The instruction oracle is machine-code emulation, not an active Krita GUI dispatch receipt. It includes negative/out-of-range intermediate results and low8 wrap. Native wholeOver8 overshoot witnesses and CPU threshold tests remain in the adjacent fixtures/model test.

Private joined RGB-only esbuild transformation preserved all scalar alpha, controls and tiny branches:102 Alpha trials/306 draws and64 Over trials/192 draws exact against independent CPU fused scalar point references; general A/B also exact. All GL state, sampler, lease, cache and cleanup checks passed. No production hook was changed for these receipts.

Warm mixed-texture draw+gl.finish p50/p95 milliseconds: Alpha specialized2.4/4.2 vs general3.1/7.8; Over specialized3.7/8.7 vs general4.9/25.7. First specialized paired-program prepare9.29s, warm1.16–1.41s; previous general cold27.02s, same-session warm2.21–2.41s. Sequential driver cache/order and state-save overhead limit this observation: not batched throughput, active FPS or native packet/GUI identity. Compilation remains too expensive for synchronous UI use. Actual KHR_parallel_shader_compile unavailable.

Compact immutable results: `fixtures/sourceRgbFmaByte/shader-device-proof.json`. Private full receipts/transformation hashes/scripts remain in fixes-v52. Original3 tabs restored, own contexts/GL/jobs/forward removed. No new runtime/resource; parent-owned Unicorn retained separately.

Integrated scalar profiles subsequently used this same helper directly (no virtual transform). Actual production imported GitHEAD1af700338 replay102Alpha/64Over,498 ordered draws: all pixels exact, GL0 and cleanup/state/cache checks passed. Bundles were byte identical to the private A/B bundles. See `production-device-proof.json`. Focused12tests and full web app TSC passed. These diagnostic profiles retain their explicit installed scalar graph names; the change does not activate the app renderer or assert tile/vector/native GUI identity.
