# GL static paper cache: diagnostic-only, production exact gate FAILED

OFF by default. Actual `WatercolorPasses` front/diffuse use separate lazy cached programs; original programs, shaders and Q8 operator order are unchanged when OFF. No WC_FIELD_OP growth (Adreno shader size regression risk). No production recommendation, no hardware speed claim.

Candidate caches original paper height and original front climb into NEAREST Float32. GL2 requires EXT_color_buffer_float/RG32F (1536² ×8 =18MiB). GL1 requires OES_texture_float plus WEBGL_color_buffer_float/RGBA32F (36MiB). Explicit default diagnostic budget18MiB therefore rejects GL1 production size; the fixture opts into36MiB. Fragment highp must expose23bits. Allocation/FBO failure falls back. Cache key includes dimensions, normalized origin, normalized paper size, paper scale, climb and paper/noise-owner identity; baked paper/noise bytes must remain immutable during owner lifetime. Program reinitialization destroys the cache. This diagnostic memory is not yet integrated into production GPU ownership budgets.

## Software evidence

Run `node docs/qa/harness/728-gl-static-paper/build.mjs`, then `node docs/qa/harness/728-gl-static-paper/check.mjs`; production-size primitive uses `GL_STATIC_LARGE=1`.

SwiftShader GL1 and GL2, same actual operators/inputs:

| Field | Front changed bytes/max | Diffuse changed bytes/max |
|---|---|---|
|32×40,31×29;4 origin/scale/radius variants each|0/0|0/0|
|1536×1536;nonzero origin;1 iteration|0/0|28/1|

Repeated cached draws match themselves exactly. GL errors0. Cache actually prepared, no fallback false-positive. Deliberate stale-world-key control changes5,701,651 bytes/max10 at1536, so input is sensitive to paper mapping. Small fixtures are not proof for the canonical size. Raw data remains untracked under `temp/gl-static-paper/software*.json`; compact result below preserves evidence.

## Why this is not an exact mathematical substitution

Baseline neighbor coordinates evaluate `px=v_uv*resolution; neighbor=px+offset`. Cached neighbor height was generated at another fragment's `neighbor_v_uv*resolution`. Real arithmetic gives the same point; Float32 interpolation/multiplication/addition need not give the same bits, especially when1536 has no exact binary reciprocal. The same LINEAR paper lookup can then straddle a Q8 output threshold. Float32 cache storage prevents RGBA8 height loss but cannot fix this coordinate difference. The observed28 one-byte differences are enough to reject promotion; neither rounding nor the physics is silently changed. Hardware arithmetic may add differences. Front-only software success is not a whole pipeline proof.

## Priorities after this negative gate

1. Bound actual dispatch/scissor support without changing coordinates: avoid invocations outside the production active rectangle, with explicit halo proof per stencil; require actual GL same-input fields and whole tape.
2. Remove proven dead full-field copies/uploads or reuse immutable CPU raster inputs with exact key/order; quantify pixels/bytes rather than claiming an equal GPU speedup.
3. Cache stencil-specific height differences only if each baseline `px+offset` expression is generated at the destination pixel, preserving expression order. This requires many Float32 channels/textures and more memory: assess amortization first; no shortcut to a single scalar lattice.
4. Measure actual queue/submission/driver waits separately from shader timings. Native34% front/29% diffuse operator gains do not imply any GL or whole-experience gain.

Expected whole gain for this candidate is currently unsupported (planning0), not a proved lower bound. No device tests ran for this cache.
