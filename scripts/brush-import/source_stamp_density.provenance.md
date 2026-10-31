# Explicit default-auto seeded-density importer lowering

`preset` and `convert_krita` accept the opt-in keyword
`source_material_profile='neon64-f32-fma-seeded-density-v1'`. The default remains
`None`; no CLI, shared capability, server policy, Room, or editor activation changes.
A real configured mapped provider is required. Original raw settings are retained
and compiled once before fallback bitmap allocation. Invalid compilation or any
unsupported final consumer fails closed. Identity is finalized normally from the
original KPP and completed descriptor, never patched from a historical bitmap DTO.

The data predicate validates the complete retained raw/compiled structure first.
Only default auto circle/rectangle, primary, fixed material, plain color, texture
disabled, spikes2/randomness0, density0..1, bounded native geometry and complete
mapped option programs qualify. Ratio below .0625 is closed because the historical
standard lowering clamps it. Native radius/diameter discrepancies also fail the
final geometry agreement check. The historical unsupported array stays unchanged;
only its single density-specific tag may be interpreted after all parameter checks.
A forged density1 tag, duplicate/additional reason, other generator or material
consumer remains closed. Masking, erase, nonnormal outer blend, active texture,
color effects, wet/burnt edges and unsupported dynamics are not admitted.

The only newly inert diagnostic is `PressureTexture/Strength/` when the original
`Texture/Pattern/Enabled` is false, under this explicit domain. Its exclusion occurs
at the corresponding active-dynamics predicate. Other warning tokens are retained;
any remaining unsupported token rejects the new lowering. Existing no-opt-in
warnings and bitmap behavior retain an exact full-result hash witness.

## Original fixture and compiler boundary

`fixtures/marker_dry_density.native.json` contains one deflated original KPP,
not a generated procedural substitute or its thumbnail used as a brush tip:

- Original Krita default bundle member `paintoppresets/e)_Marker_Dry.kpp`, index23,
  43,716 bytes, SHA256
  `16ff0d722e2b958217f33dd3c5dbb74d7d04d67c8f07663e7622e3b2ccc34f5b`.
- Pinned source `bd6e8d061d2f0388c5b10278786cf0fe62e3135f`; original169 XML
  parameters,92 retained source parameters. Rectangle35,ratio.5,fades.9/.9,
  antialiasfalse,density.8,randomness0,angle1.5708,spacing.04 are preserved.
- Two nonlinear source curves: Opacity `0,0.0100503;0.38191,0.140704;1,1;`
  and Flow `0,0.00502513;0.550725,0.221106;1,1;`. Fixture retains their exact
  source points/corners and16 float64 coefficients, including signed-zero bits.
  Little-endian coefficient-byte SHA256
  `2ce579f4ecd2986e8badda83fc86c1891e847ee17d9fdc85230c110ea43adaf1`.
- Verified earlier provider67: `eigen-5.0.1-mapped-arm64-f64-v3`, build
  `5c6b74ca30b91f2c2529e6096f4230bec55e5056550b306734b2e9934a35d097`,
  binary SHA256 `7c1994d302412b2dde62e552a0f384a739cdbe57d18f3bfa549c012a0750d542`.

**Unit tests mock only `compile_mapped_source_stamp`**, checking the exact original
curve request and returning the earlier verified coefficients. Production has no
mock/fallback compiler. These tests do not claim a fresh provider invocation, native
random-stream identity, native whole-stroke identity, or GPU/online readiness.
Source mode remains the original PaintOpAction2; no test composition override is
introduced. Density uses the explicit deterministic behavior profile, not a claim
that native per-pixel RNG ordering matches.

Provider67's archive,408 extracted headers, overlay, tool/binary and temporary
catalog were removed by the registered cleanup lifecycle. This unit creates no
provider resources, services, browser contexts, device forwards or new runtime.
Test temporary catalogs are removed with `TemporaryDirectory` cleanup.

## Validation

Tests-first RED: new keyword was absent. Final new suite11 PASS, including normal
preset/KPP and bundle conversion, exact old-default result hash, no fallback CAS
asset, failed conversion without publication, provider/build/curve failures,
material/geometry closure and precise warning behavior. Focused source suites56
run:49 PASS,7 provider-dependent existing skips. Existing Krita suites166 PASS.
Python syntax compilation3/3 PASS and scoped `git diff --check` PASS. The project
has no configured Python static type/lint gate for these files; no unrelated
TypeScript/common build is claimed.

Broader `test_source_stamp*.py` exploration exposed the existing
`test_original_decoded_tip_scope_survives_png_texture_filename_shadow` expectation
that a GIH sourceStamp is absent. It fails identically with the original HEAD
importer loaded in memory, following earlier GIH retention. That unrelated test
was not changed or hidden; the broad group is not claimed wholly green.
Receipts are in R52 `marker-dry-importer-{red,green,focused,source-regression,
krita-regression,preexisting-failure}.log`.

## Remaining real integration prerequisite

A fresh **unmocked** normal-import integration needs a separately authorized bounded
rebuild of the already cleaned pinned provider: official Eigen5.0.1 archive with
hard16MiB/SHA verification; only408 lock-listed regular headers (64MiB extracted,
128MiB leaf caps); exact existing g++13/toolchain lock; one registered disposable
TTL leaf and strict final cleanup. Then normal opt-in import must feed its actual
result through the new shared capability, descriptor/author/adapter/encoder and
same executor with replay/chunk invariance. No hand-editing the tip, retained
coefficients as a production fallback, old3.4 grant, native/GPU claim or online
policy activation substitutes for that next proof.
