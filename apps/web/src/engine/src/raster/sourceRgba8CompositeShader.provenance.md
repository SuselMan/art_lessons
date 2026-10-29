# Isolated integer RGBA8 shader kernel

No production import, target-format switch, color-space conversion or device
acceptance is implied. This is a GLSL ES3 expression of the existing project CPU
mathematical contract in `presets/sourceColorRgba8.ts::compositeRgba8`.
No new Krita/Qt implementation text is copied. Source-informed provenance and
license review caveats of the existing scalar investigation still apply; this
file does not grant legal clearance.

## Contract/API

Export `SOURCE_RGBA8_COMPOSITE_GLSL` contains declarations and entry function:

```glsl
uvec4 sourceCompositeRgba8(uvec4 source, uvec4 destination,
                          SourceRgba8CompositeControl control);
```

The caller supplies `#version 300 es`, highp integer precision, its own main,
integer source inputs and integer output target. Source and destination are
**straight byte** RGBA, not normalized floats or premultiplied colors. Mode is
0=Over,1=Add,2=creamy AlphaDarken. Host-preflight controls:
`uint opacity, mask, flow, average; bool hasMask, flowIsOne`.
All bytes must be 0..255, mode must be valid. This shader does not validate or
clamp malformed host inputs. `hasMask=false` still requires mask255 because Add
always uses the three-factor law. Host canonicalizer supplies it automatically.

`canonicalizeSourceRgba8Control` validates author controls and resolves each byte
on CPU: f32(v), f32(f32(v*255)+.5), truncation. Average defaults to original
opacity; flow defaults to1; flowIsOne means f32(originalFlow)==1, before byte
rounding. Ink alpha is already a separate source byte and is never replaced by
this function. Its KoColor double alpha-setter law is not float-opacity rounding.

Missing mask is semantically distinct from explicit255: Over uses two-factor
multiplication without mask, three-factor rounding with mask. AlphaDarken first
quantizes masked source alpha, then applies painter opacity. Add always uses
three-factor multiplication and preserves native intermediate byte wrap.

All arithmetic is integer: multiply/multiply3/divide and signed blend. Blend's
negative signed right shift must be arithmetic/sign-extending; it is not unsigned
shift or truncating division. Largest three-factor product plus bias is below
2^25 and signed-blend intermediates are within ±65536, so highp 32-bit integer
arithmetic suffices. Divisors are positive on every reachable valid-input branch.
No floating-point opacity math, FMA or interpolation belongs in this kernel.

## Independent acceptance

Pinned actual native oracle: `presets/fixtures/sourceColorRgba8/scalar.native.json`,
Krita `bd6e8d061d2f0388c5b10278786cf0fe62e3135f`, unchanged scalar RGBA8 composite
headers,384 composite cases with recorded source hashes and C++ reproducer.
Host tests prove canonical byte controls retain all384 native results when used
with the existing independent CPU evaluator. They do **not** execute the GLSL.
Shader compilation and GPU byte equality require the separate actual-device
oracle: write returned straight uvec4 directly to RGBA8UI and compare every byte,
including hidden RGB when alpha0. Test any RGBA16F premultiplied storage/recovery
in a distinct second stage. Alpha0 hidden RGB is not recoverable by ordinary
premultiplied storage and must not be silently removed from the direct test.

The snippet has no grouping, average-opacity state update, mask rasterization,
GPU blending, framebuffer feedback or allocation. Source particle groups must be
composited in order locally, followed by one outer transfer according to source
semantics. A passing scalar kernel does not establish complete brush support.

## Actual device proof (root QA, 2026-10-29)

Samsung Adreno650 executed this exact GLSL snippet:
SHA256 `923ae9a24387c8b6e5949319ed8d7179d4b0dd44861d0c0d363860ce5aaec16f`.
All384 generic native scalar cases match every straight RGBA8UI output byte.
GL error0. Separate RGBA16F premultiplied store/recovery retained all380 cases
whose output alpha is nonzero; four alpha0 outputs with hidden RGB were explicitly
excluded from that storage-recovery assertion, not from direct integer testing.
Evidence: R49/composite-device-result.json and retained root QA body/scripts.

This is generic native scalar-operation proof on this actual device. It does not
establish default optimized Over32 SIMD parity, pixel-format admission, brush
group transfer/state parity or other GPU/device correctness. Production remains
unconnected. The tested GLSL text is frozen; semantic edits require renewed GPU
verification.


## Separate portableF32 point operator

`SOURCE_RGBA8_PORTABLE_OVER_GLSL` transports the independently authored
`sourceOverPortable` point profile to GLSL ES3. Its input opacity remains float32;
it does not reuse genericInteger byte opacity or collapse material mask storage.
It deliberately lacks source CPU packet-wide shortcuts and hardware reciprocal
estimates. It is **not** the default Krita optimized factory or a native packet
operator. The existing integer shader snippet is unchanged.

Actual Samsung SM-T970/Adreno650 isolated WebGL2 proof:512/512 outputs match
portable CPU exactly. Native scalar SSE differs at the same two indices213/253,
maximum one RGB byte; this residual is retained, not hidden by tolerance.
An additional independent65536case opaque source/destination channel midpoint
stress (opacity.5) matches integer nearest-even arithmetic exactly. GL0.
GLSL SHA256 e65eaf0b66a220024ef7e270843c0fa57cfd7f126bdb828b51b6f0eb5989c7e3.
Evidence: worktree temp/device-runs/krita-stroke-20261024/fixes-v49/
portable-device-result.json and exact body/harness. Owncontext/tab/forward disposed.

The current application engine requests WebGL1. These WebGL2 integer probes do
not activate a backend, upgrade its context or establish a layer storage/memory
policy. Packet geometry, reciprocal profile, WebGL2 engine integration and actual
Android Krita whole-buffer parity remain separate gates.
