# Installed HSY in the existing canonical composite pass

The internal `colorHsyInstalled` operation accepts only `colorHsy` with explicit
`krita-installed-arm64-generic-hsy-u8-fused-fpcr0-v1`. Preparation selects the
opt-in numerical library in the existing source/geometry shader template; draw
uploads canonical byte controls and local fixed-stage uniform12. GenericSC U8
still admits only Multiply/Lighten/ColorDodge/Overlay. Its lightweight shader
and generic byte canonicalizer remain unchanged and reject Color. No room,
wire, executor dispatch, brush capability or full native brush grant is added.
The source-separated HSY profile stays CPU-only.

The same existing scratch/VBO, BrushTextureCache, BrushMipCache reservation,
context-storage tokens, external lifetime leases, GL batch and rollback paths
are used. No second renderer/cache/ledger or hot shader compilation exists.
The existing three-program limit remains; HSY is one explicitly prepared
program. Scratch budget is width*height*4+48bytes and CPU estimate is
48+8192bytes per program. This estimates owned metadata, not compiler/driver
heap usage or total JavaScript retained memory.

Four new host tests cover explicit-only preparation, exact controls/stage12,
no hot compile, unchanged generic shader selection, cross-profile rejection
before leases/copy, state restoration, and failed preparation rollback. Together
with the existing composite-pass suite28 tests pass; the numerical old/new
focused suite1237 tests and local lint pass. Combined web TSC is coordinated
separately; no earlier snapshot failure is labeled a current pass.

The compact receipt is
`fixtures/CanonicalRgba8CompositePass/hsy-samsung.native.json`. It preserves
actual source/bundle/input/body hashes, complete532 draw durations, aggregate
actual output SHA256, three slowest calls, ownership and cleanup receipts.
The actual pass source tested has SHA256
967201d598de114e89c4e7c02f2846be6e35671137ab8dfcc99090bf93b5937c.
Numerical helper source hashes are pinned independently in the receipt.

On Samsung SM-T970/R52RB0JXVSY, Chrome156, Adreno650/ANGLE, highp23, all266
original installed full-vtable oracle cases pass through BOTH straightRGBA8 and
maskRGB source views:532 draws,2128 RGBA bytes, max difference0. The798 external
leases acquire/release exactly, samplers and GL state restore, no hot uploads or
buffer writes occur, and GL errors are0. The original oracle is installed ARM64
instruction emulation with original Qt/LUT init, not physical Krita GUI proof.

A separate context prepares600x600 capacity once and composites the original
native600 A8 mask (SHA256
f6f0a7e51e6ce862d468e200f7ebf16a73830b436c82343f18eea8c2ba274e8b).
There is no mask resize. Declared source crops are (200,40) for64x64, (172,0) for
256x256, and (0,0) for600x600. Input pigment is[130,191,28], opacity1, no external
mask. Eight distinct destination RGB/alpha tuples repeat in a deterministic
pattern. Independent CPU installed-HSY lookup tables supply first and second
feedback outputs for all256 source alpha values; their hashes are pinned.
The lookup tables are ephemeral harness inputs, not production caches.

Coverage is nontrivial:64 crop has27 alpha values, all4096 pixels partial;
256 crop has99 values/62184 partial pixels;600 has103 values/276032 partial
pixels. Two feedback draws per size verify859264 pixels/3437056 RGBA bytes,
with no mismatches, state/sampler/lease errors or hot uploads. The point
compositor's zero-alpha quantization behavior remains included; no claim about
an outer native painter skipping pixels outside the mask is inferred.

Context-first preparation took3297.4ms for the native-vector suite and2449.4ms
for600-capacity throughput. These include compilation/allocation and may use
browser/driver caches; they are not proved uncached compilation times. Source/
target setup plus finish took16.9/17.0/29.5ms by size. Standalone pass draw+finish
first/second times were64:29.2/8.3ms,256:3.0/4.9ms,600:2.7/4.2ms. The532
one-pixel native draws had median6.8ms/max45.0ms. These nonmonotonic measurements
include existing GL state/query costs and only two large draws per size. They
do not prove a frame budget, responsive compile, active-UI latency, or large-
brush executor throughput. In particular preparation still blocks for seconds
and the first64 draw exceeds a16ms frame; shader microprobe0.2ms is not reused
as a whole-pass latency claim.

Before cleanup the pass-owned resident metadata is1440048 GPU bytes/8240 CPU
estimated bytes for600 capacity; source cache resources are discarded per trial,
and external target allocations are separately owned by the harness. After
reset/cache clear both counters are0. All own raw target/source/FBO handles are
deleted, context lost, own CDP child closed and forward19236 removed. Original
three tabs3761/3631/3643 are preserved. No service, process, child, forward,
temporary build or native library copy remains.
