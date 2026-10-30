# Native source data tags, importer/compiler boundary

The existing nine option programs, raw settings/curve text/points/corners, native coefficient dictionary and bounded portable reconstruction remain one contract. New payloads are version2 with explicit `source.kind=image|defaultAuto`; version1 missing source tag means legacy image only. Version1 with a tag and version2 without a tag reject. No auto is represented as PNG/CAS, and unsupported Gaussian/soft generators do not gain sourceStamp data or an execution identity in this slice. Their original KPP/brush definition is not rewritten; the importer emits an explicit unsupported source-data note.

`sourceStampSourceKind` is the shared discriminator. PNG execution capability checks it before CAS/material logic; consequently the existing descriptor→PNG SourceStrokeAuthor factory rejects auto. Curve dictionary validation/compiler functions are profile-neutral and do not grant raster capability. `extractDefaultAutoSourceDataCapability` is explicitly `status=source-data-only,rasterReady=false`. It is not a source author program, canonical material recipe, renderer admission or server permission. The legacy descriptor's procedural profile remains separate from these raw data; no bitmap sampler or active renderer hook was added.

## Source-reader law and independent inputs

Pinned official source `bd6e8d061d2f0388c5b10278786cf0fe62e3135f`, `libs/brush/kis_auto_brush_factory.cpp` lines35–76 and181–184, SHA256 `2914c58effc5a0d4c7a73c56b834a954b16b7e7a93cafd139ef4f2e2e5a3e9e8`. Independently implemented data-reading law; no source code copied/adapted. The factory reads raw angle, spacing(default1), autoSpacing, randomness/density and generator parameters. It ignores XML scale and BrushVersion; initial native auto scale is1. Image BrushVersion1 scale×2 therefore remains image-only. Legacy radius takes precedence over diameter; non-circle names map to Rectangle, including serialized rct. Raw source values/settings remain retained rather than reconstructed from normalized legacy hardness/aspect. Initial integer width/height clamp-to1 and truncation reuse the source-proven geometry constructor law; closed capability requires spikes2/randomness0/density1 and unit material consumers.

Fixture `fixtures/sourceDefaultAutoData/stock.native.ts` contains only seven real production-imported descriptors plus KPP hashes and tool/source hashes, no KPP previews, CAS planes or executable C++ copy. All source-lock files were integrity-checked in the existing pinned cache before extracting KPPs. Indices4/8/17/18/19/21/67 use the actual importer `preset()` and existing nine-option reader, not stock-ID-specific lowering. An asset callback that throws proves no synthetic CAS asset was created. Effective nonlinear curve counts are0/2/2/1/0/3/4.

Those real inputs were compiled with the existing independently authored Eigen3.4.0 SparseLU tool, ffp-contract=off, explicit trusted executable only. Each complete descriptor then passed portable RECOMPILE and exact dictionary comparison; forged auto coefficients reject. The standalone curve compiler/native67curve proof is unchanged. The tracked fixture pins compiler executable/source, Eigen archive, auto factory and importer/reader hashes. Optional provider tests were run explicitly with the real compiler: full Python suite250PASS, zero skips before tool cleanup; the final post-cleanup suite251PASS has six explicit provider-dependent skips (tool already removed); shared PNG/auto and existing web author regressions pass. Legacy image v1 and new image v2 capabilities are compared directly.

Portable source validation still reconstructs normalized data from raw settings through the existing bounded KPP XML reader before any CAS installation. Unknown/default-generator parameter capabilities fail closed without inventing another author DTO. New auto source metadata fits the existing2048byte fixed metadata allowance; variable raw settings/curves still use ≤1MiB per descriptor and ≤16MiB per library before asset loading. Disabled saved nonlinear curves remain retained without requesting unnecessary compiler work.

The temporary compiler/header build was registered as disposable `auto-source-curve52-20261030`; it was removed by the standard privileged strict-reference cleanup after provider tests. Input/output hashes and receipt `auto-source-curve-resource-cleanup.json` are retained in ignored fixes-v52. The final decimal-only auto reader guard additionally rejects Python-only numeric spellings; all seven raw-source reconstructions were repeated unchanged after that guard. No new service/runtime, device/context/forward, author strategy, canonical codec or room activation was created by this unit.

## Gaussian retention extension

Version2 additionally retains explicit gaussianAuto/generator gauss/circle,
with raw diameter, ratio, both fades, AA, spikes, randomness and density.
Initial metrics and storedScale1 use the SAME auto factory reading law.
The new extractor reports source-data-only/rasterReady false. Unsupported
spikes/random/density, missing programs, texture/material consumers remain
closed. Existing PNG/default-auto extractors reject Gaussian by identity; no
new material tag, renderer policy, room grant or client-selected coefficients
is introduced by this data slice. Legacy approximate round/bitmap descriptor
shape is not treated as an exact Gaussian source or tool/eraser permission.

The actual13 Gaussian fixture was generated from pinned original KPPs through
production preset(), explicit unchanged Eigen3.4/off sensor compilation and
independent portable recompile. It contains source/descriptor/compiler hashes;
no coefficient lookup or Gaussian radial authority is implied. Required sensor
program counts are3/1/2/2/3/3/1/3/2/2/2/0/1. All13 source payloads validate.
Only #2/5/6/7/10/11/22 pass the conservative data capability. #12/68/70 retain
material-consumer fences; #38/39/40 retain dual/mask fences. Legacy bitmap CAS
planes are not copied into this source fixture. Nine asset-free round descriptors
also pass library validation; all13 reject image/default-auto capabilities.
No Gaussian author/wire/prepass grant is introduced yet.

## Soft-circle raw retention

Version2 adds explicit softAuto/generator soft/circle with the same auto geometry
and a bounded softnessCurve text/points/corner payload. Python and TS account its
UTF8 text plus32bytes/knot in the existing descriptor/library budget. Portable
Python validation reconstructs it from raw brush_definition; malformed curve,
unknown identity/shape and metric changes fail closed. Source kind is never
inferred from a bitmap fallback. Existing image/default/Gaussian predicates do
not admit this new kind; sourceStrokeAuthorDescriptor explicitly rejects it with
soft-auto-raster-author-unavailable before any image fallback. Old sensor compiled
profile is unchanged and does not claim to compile the radial source curve.

Pinned kis_auto_brush_factory.cpp read/create law retains radius precedence and
uses0,1;1,0 when curveString is empty. Both the new reader and existing legacy soft
mask path now use this fallback (previous legacy default0,0;1,1 was reversed).
The earlier identity-coverage test now specifies0,0;1,1 explicitly, preserving its
independent squared-radius arithmetic witness; a separate fallback test checks
the factory curve and center-to-edge coverage direction. Authored nonempty curves
are unchanged. This is data retention and fallback correction, not an exact soft
raster/compiler/room activation grant.

Tests: full Python259 total,252 passed/7 provider-dependent skips after original
tools cleanup; focused shared/author26 tests5files passed; shared build and actual
web tsconfig.app typecheck passed. The initial noEmit command against the root web
references-only tsconfig is NOT counted as source typechecking. Durable receipts
are fixes-v52/soft-retention-{python-full,tests,shared-build,web-app-tsc}.log.
No new runtime, dependency copy or device context was created for this unit.

Original soft stock retention witness: stock.native.ts in sourceSoftAutoData
contains10 roles (primary3/44/47/59–63/72, masking52) reconstructed from SHA-verified
original KPP PNG metadata in pinned bundles/files, not reconstructed from legacy
bitmap tips. Mask52 uses the actual MaskingBrush/Preset/ prefix settings. All10
pass portable raw-settings reconstruction and the shared validator; Python and TS
budget counts match exactly (largest8189bytes). Color-smudge44 is a raw common
reader witness only; the paintbrush importer does not acquire a color-smudge
source author capability. Source payloads preserve flags without asserting they
are implemented. No original pixels or KPP archives are embedded in this fixture.
Source inputs are Krita GPL-2.0-or-later at the pin in the fixture. Reproduction:
fixes-v52/retain-soft-stock52.py; original KPP hashes, reader hash and plan hash
are retained in fixture/proof. soft-stock-shared.log covers all4 tests in this file.

## Distinct mapped dictionary admission

Compiled version2 binds eigen-5.0.1-mapped-arm64-f64-v3 and a64hex buildId to
stable required sensor sources, plus a mandatory separate radialCurve for soft
sources. Raw sensor identity bypass remains separate from radial compilation.
All source text/point/corner bindings, interval counts,2..9knot/end-corner grammar,
64curve/4096knot limits and aggregate source budgets are checked in Python and TS.
The original version1/3.4 profile remains unchanged. Shape validation is not
compiler attestation: portable import regenerates through an explicit trusted
MappedCurveProvider and compares coefficient bits, including signed zero, before
CAS payload decoding/installation. Unknown fields/build mismatch/nonfinite or
changed coefficients fail closed; no old-provider fallback is performed.

The existing author descriptor adapter selects installed-arm64-fused-v1 sensor
arithmetic from the actual selected coefficient origin. Mapped retained entries
or an explicit mapped callback use the proven fused law; a legacy callback that
overrides a mapped saved entry keeps its declared separate law. No arithmetic is
inferred just from the descriptor source kind. Real Gaussian descriptor inputs
exercise this path against independently captured original sensor samples.

KPP, bundle, nested masking import and portable_bundle accept explicit mapped
provider configuration. CLI requires both --mapped-curve-compiler ABSOLUTE_PATH
and --mapped-curve-build-id HEX64, mutually exclusive with the old compiler flag.
Brush data/environment never select an executable. Default conversion, active
room policy and QA49 deployment are unchanged; soft author/material remains
closed despite its independently verified radial coefficients.

Gates: mapped-profile-tests.log29tests6files PASS; shared TSC97435 PASS; actual
common web TSC9249 PASS includes this frozen unit and Pointer lifecycle changes.
Full Python278total/271passed/7 explicit old-provider skips with actual mapped
provider; includes all10 original soft raw role portable verifications, actual
KPP/CLI/portable roundtrip and coefficient forgery rejected before CAS decoding.
Scoped lint/diff passed. Initial root common22456 failed on in-flight Pointer
DOM typing; it is not counted as a pass. The CLI test first looked for library.json
instead of the real manifest.json; that harness typo was corrected and full suite
rerun. No new service/device context or dependency runtime copy was introduced.

Soft data readiness is exposed separately by extractSoftAutoSourceDataCapability.
It requires the schema-bound mapped v2 radial entry even when no sensor curve
requires compilation, and retains source-data-only/rasterReady=false. Historical
unsupported reasons, mask/dual sources, AA, texture, nonunit material controls,
randomness/density and unsupported tool consumers remain closed. This structural
check is neither compiler attestation nor author/material/wire/server permission;
it does not remove the historical soft frontier or activate editor rendering.
Tests use explicitly synthetic dictionaries for readiness and preserve rejection
of all ten historical original source roles.
