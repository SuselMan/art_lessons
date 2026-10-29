# Saved and canonical material: one transformed mask owner

Independent orchestration of existing geometry, no vendor algorithm copied.
No active engine/renderer/importer or operation-schema integration in this unit.

Upstream Krita source pin bd6e8d061d2f0388c5b10278786cf0fe62e3135f.
Source-law numerical owners and their native receipts remain sourcePngGeometry,
sourceImageTransformMetadata, sourceImageTransformPlan/Spans and the fixed16 row
writer. This adapter neither repeats their arithmetic nor evaluates source options,
RNG, cache queries, current pointer state or source material pixels.

Request material is either the unchanged old SourceDabMaterialSpec, an explicit
savedSource wrapper, or canonical{recipe,asset}. Canonical recipe MUST come from
shared decode/admission; asset is trusted original CAS square+crop metadata.
Canonical is not converted into a fictitious SourceDabMaterialSpec/key/color/index.

Canonical recipe normalizes logical/static shape via sourcePngRasterShape once,
then uses the same sourceImageTransformMetadata as server admission. Canonical
plan allocates covered rows only after accepted allocation. Its row writer, pixel
shader, prepared LUT/workspace and cache machinery are the existing service.

Cold CanonicalMaskSourceBank.preparedResources exports immutable original asset,
crop and level index/baseScale/native dimensions for every resident job. There
are no reads/allocations of pixel planes in that method. Existing resources()
texture-handle API is unchanged. Existing 512-byte/job metadata allowance covers
small scalar/crop records and their cold prepass snapshots; this is a declared
metadata estimate, not a claim about vendor/JavaScript allocator overhead.

Prepass.prepare validates and copies each supplied canonical binding before GL;
legacy resources can omit it, but cannot then service canonical recipes. On each
canonical request, asset identity/size/crop, metadata.index/baseScale/native W/H
and actual bordered source W/H must agree with that cold binding and resident
key/texture. The level is not selected again from rotated bounding dimensions.
Bindings are trusted preparation inputs; they do not certify arbitrary pixel
content or make client-authored metadata an attestation. Full CAS pixel provenance
and opaque-gray admission remain caller responsibilities.

Cache revisions contain sampler profile, prepared source key, trusted original
asset identity/crop and exact finite F64 shape/subpixel/allocation values.
ECMAScript number serialization uniquely round-trips finite binary64; -0 gets an
explicit distinct marker. The revision therefore does not round recipe channels.
Placement and post-raster mirrors are separate view fields; mirror/position changes
reuse raster pixels and never apply tip geometry a second time. Mutable/newly
decoded recipe objects recompute the revision; no unsafe reference shortcut.
All request geometry/bindings/row capacity validate before slot/GL mutations.

Tests cover canonical versus saved plan equality, native existing row fixtures,
signed-zero and adjacent-F64 revision distinctions, fresh-object/placement/mirror
hits, changed-recipe misses, malformed crop/asset/source/handle/allocation rejection
before GL, cold binding snapshots, unbound legacy resource rejection and old API
compatibility. Bank tests prove cold metadata export adds no reads/uploads.

Additional ignored host audit uses actual17 real importer descriptors with40
varying-pressure inputs each, collecting ALL begin/accept/finish chunks. All680
inputs/3256 draws/203 shared-decoded chunks pass exact production canonical
metadata versus bank index/baseScale/native/bordered/CAScrop checks. It allocates
no pixel planes and is not GPU/native-app identity evidence. Compact audit and
full packed stream retained in QA fixes-v52; no huge fixture is copied into Git.

## Real stock-author canonical whole-stroke device gate

Actual Samsung SM-T970 / Adreno650 WebGL1 highp23, frozen3047f6635/a70d8c2e0
geometry/composition sources:17 retained real descriptors,680 author inputs,
203 decoded canonical chunks,3256 draws. Real original CAS bytes pass SHA/size
validation; finite source banks are prepared, canonical recipes bind original
crop and level. Sixteen wash strokes use local scalar AlphaDarken plus final
portable scalar Over against immutable base; one buildup stroke uses Over.

Every final512x256 RGBA target byte matches the independent host calculation;
all per-chunk local FNV checkpoints agree (additional diagnostic, not a
cryptographic equivalence claim). Hot uploads0, GL errors empty, GL state
restored and leases balanced. Maximum tracked brush GPU4648212B and CPU
reservations1267440B; external surfaces and driver allocations are separate.
Cleanup releases all owned contexts/textures/reservations and restores original
three Samsung tabs. Private scripts/receipts: fixes-v52/run-canonical-stock-
strokes.mts, canonical-stock-strokes-body.js, canonical-stock-strokes-device-
result.json, canonical-stock-device-cleanup.json.

This is explicit scalar-profile end-to-end conformance, not installed native
FMA/SIMD or active PM storage/wire/undo identity. It is also not a responsiveness
pass: heavily instrumented test took69.7s across17 strokes, maxrAF133.8ms,
maxworkturn138.1ms. Separate phase/guard A/B profiling is required before
attributing these timings to production engine work or claiming smoothness.
