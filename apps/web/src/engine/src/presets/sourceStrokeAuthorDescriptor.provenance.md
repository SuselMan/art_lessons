# Native author data boundary (not activation)

`BrushDescriptor.sourceStamp` version1 / reader `krita-bd6e8d0-v1` is additive **source data**. It does not change the existing behavior/admission paths. Existing descriptors remain valid and get `legacy-descriptor-no-source-data` from the new adapter. New imports hash the complete retained data through existing `finalize_identity`; no existing catalog was regenerated, renderer/version or recorded-operation schema changed.

This unit moves production KPP input into the already existing author owner. No stock-ID lookup, coefficient fixture lookup, extra KPP/archive reader, spline approximation, or second stroke planner is used. Python receives the bounded existing XML reader. The adapter never parses XML or loads assets.

## Source laws

Krita pin `bd6e8d061d2f0388c5b10278786cf0fe62e3135f`, independently implemented settings/data normalization (no copied vendor function bodies):

- [KisKritaSensorPack.cpp](https://github.com/KDE/krita/blob/bd6e8d061d2f0388c5b10278786cf0fe62e3135f/plugins/paintops/libpaintop/KisKritaSensorPack.cpp#L113): source-slot ordering; checkability; source XML order decides last-read common curve, while execution order uses fixed sensor slots; legacy Custom/Curve override; useSameCurve, pressure fallback, native strength and curveMode. Original selected setting text, selected curve text and individual points/corner flags are retained. No uniform sampling alters these inputs.
- [KisStandardOptionData.h](https://github.com/KDE/krita/blob/bd6e8d061d2f0388c5b10278786cf0fe62e3135f/plugins/paintops/libpaintop/KisStandardOptionData.h#L10): Opacity and Flow are NotCheckable, including prefixed forms. Other selected nine slots use their native checkability and ranges; Scatter legacy Amount fixup/range0..5 follows KisScatterOptionData.
- [KisSensorData.cpp](https://github.com/KDE/krita/blob/bd6e8d061d2f0388c5b10278786cf0fe62e3135f/plugins/paintops/libpaintop/KisSensorData.cpp#L67): fade default1000; distance/time30; integer periodic fields; drawing angle offset is parsed to float32, with native fan/lock data retained.
- [kis_predefined_brush_factory.cpp](https://github.com/KDE/krita/blob/bd6e8d061d2f0388c5b10278786cf0fe62e3135f/libs/brush/kis_predefined_brush_factory.cpp#L89): default spacing.25, angle0, scale1; BrushVersion default1 doubles saved scale. The new source data applies that native compatibility law without modifying legacy geometry.
- [kis_precision_option.h](https://github.com/KDE/krita/blob/bd6e8d061d2f0388c5b10278786cf0fe62e3135f/plugins/paintops/libpaintop/kis_precision_option.h#L13) and corresponding cpp: exact property names, defaults5/false. Based-paintop and brushop constructor combine Mirror/Texture then Scatter/Rotation/Airbrush for imprecise-position capability.
- Existing `sourceOptionProgram`, `sourceCurve`, `sourceStrokeAuthor`, cache/distance/material kernels remain the sole compiler/execution laws. `curve_transfer.py` remains the legacy offline approximation and is deliberately **not** used by this adapter.

## Compiler boundary

Raw source data remains independent of `sourceStamp.compiled` version1. The optional dictionary binds reader `krita-bd6e8d0-v1` and compiler profile `eigen-3.4.0-sparselu-f64-no-fma-v1` to unique selected NONidentity curves, in first option/source-slot encounter order. Each entry stores exact selected text, points/corner flags and global polynomial interval coefficients. The required set includes only checked && useCurve consumers; disabled saved nonlinear curves remain losslessly retained but do not require compilation. Identity detection reuses the existing native predicate now shared with `sourceCurve`; the legacy Python approximation's rounding expression remains unchanged.

`sourceStrokeAuthorDescriptor` consumes the validated dictionary by default. `compileCurve({text,points{x,y,corner}})` remains an optional explicit author capability returning `native-sparselu-v1` coefficients. A used nonlinear curve without either capability returns `native-curve-compiler-unavailable:<slot>:<sensorSlot>`. No source-text/stock fixture lookup, uniform-table fallback or approximate spline compilation occurs.

Generic `compileSourceOptionProgram` preserves provided exact coefficients even for unchecked direct component probes, retaining the original567 native component fixtures unchanged. When inactive coefficients are absent, `bind` attaches a lazy unavailable-transfer guard to the bound sensor. Apply skips it; useCurve=false returns before reading it. An accidental direct component consumer throws before RNG draws, rather than receiving a silent identity curve. This guard is transient and never part of author checkpoints/JSON.

The real Python importer/portable CLI receives an explicit trusted absolute compiler argument (`--native-curve-compiler`), never a path from KPP/JSON/environment. The existing optional `compile_curves` provider enforces64 unique curves/4096 knots/15seconds; raw and compiled budget checks apply. Missing/failed compiler leaves raw candidate data with an explicit unsupported compatibility note and keeps legacy behavior. No automatic build/download/SDK/runtime or renderer activation occurs.

Portable import performs raw reconstruction, dictionary binding/shape and aggregate-library budget checks first, then **recomputes every present dictionary using the configured native compiler before any CAS decoding/install**. Matching profile text is not attestation. Compiled bundles without the explicit trusted provider are rejected; raw-only/old bundles remain valid. Shared/client validation is structural plus raw binding, relying on the existing trusted server/import pipeline for numerical provenance; it does not pretend to prove arbitrary client-supplied coefficient values.

Compiler/source implementation and actual native coefficient provenance are recorded in `scripts/brush-import/native_curve_compile.py/.cpp` and the existing source-curve native fixtures. No legal-clearance assertion is made.

## Limits and tests

Opaque unchanged inverse-gray PNG/GBR source grids only, verified against existing tip.imageSampling CAS asset/rectangle and original dimensions. Nonunit dynamic material consumers, texture, image adjustments, colored/material/GIH paths and masking master-size ownership remain explicitly unsupported candidates. Child raw data still survives; the adapter does not guess master-size semantics. CAS bytes themselves are validated/loaded by the existing library path, not by this pure adapter. Context supplies current native color identity, LOD and optional captured native effective scale.

`sourceStrokeAuthorDescriptor.imported.json` is self-authored3×5 grayscale PNG + KPP passed through the **real importer**, including an arbitrary nonlinear curve. It is production-reader regression data, not a native pixel oracle. Tests cover raw common/per-sensor selection, source order, curveMode, corner flags, float32 law inputs, legacy scale, precision names, unsupported source IDs, portable tampering, explicit compiler refusal/capability, CAS guards and execution of the existing owner. No device/pixel parity or full-brush admission is claimed.

No temporary processes, runtime copies, dependencies or device resources were created by this unit.

## Bounded data contract

Both runtimes use the same accounting: UTF-8 settings keys/values + all selected common/sensor curve texts +32 bytes per knot +64 per option/sensor +source-ID/reason strings +2048 metadata allowance. Maximum1MiB per sourceStamp and16MiB per library, including masking descriptors. This measures source data independently of runtime-specific JSON float formatting. Shared preflight runs before detailed curve validation; portable preflight runs before CAS payload decoding or installation. Python charges selected curve text before parsing its knots; exceeding the normalized budget preserves bounded raw settings with an explicit unsupported candidate. Numeric curve syntax is finite decimal/exponent only, rejecting hex/underscores equally in Python and TS.

Evidence `fixes-v49/source-descriptor-budget.json`: pinned118 source inventory,117 with brush_definition (Basic-1 roundmarker has none). Source normalization with1×1 placeholder metrics to isolate data overhead: total compact JSON941680B, largest10236B (WaterC_Basic_Round-Grunge), including3679B raw settings,561B normalized curve text and58 knots. This is a source-settings budget survey, not regeneration or admission of118 descriptors. Existing CAS/library size limits remain unchanged. Tests include repeated-curve expansion, aggregate18-descriptor overflow and proof that a rejected portable manifest never reaches CAS decoding.

## Compiled dictionary proof

Explicit-provider verification:244 Python tests PASS with **zero skips**, including all32 stock and35 arbitrary native coefficient sets (130 corners,256-knot cases),67 raw-source→compiled dictionary→portable roundtrips and a finite coefficient forgery for every nonidentity case rejected before CAS decoding. Work-budget overflow is rejected before invoking the provider. Real KPP import tests confirm missing/failed/explicit provider paths preserve the same legacy behavior and only compiled output changes identity.

Focused TS56 tests /5 files PASS, including the original567 component comparisons, shared raw/compiled guards, actual real-importer compiled fixture default adaptation, disabled nonlinear/no-provider/no-RNG behavior and accidental direct-consumer fail-before-RNG. `sourceStrokeAuthorDescriptor.compiled.json` is an independently compiled self-authored input, not a native pixel or device parity claim. The renderer remains independently off.

## Actual stock integration (reader fixes)

A real118-presets in-memory import with the explicit compiler produced40 primary sourceStamp records and17 CPU-author-ready descriptors:9,24,25,26,27,28,74,75,76,79,82,83,84,86,95,111,112 in the established catalog53 index order. All17 completed three synthetic packets; all238 CAS hashes/metadata remain unchanged. The nine audited primary option fixtures have zero raw-data differences and21 active native coefficient comparisons exact. This is not renderer/device acceptance or catalog activation. Reproducers/reports/ready descriptors are retained under `fixes-v49/source-author-stock-*`.

Two reader bugs found by that integration were fixed generically: static-image capability now comes from the original decoded tip branch, so a later PNG texture filename cannot relabel GIH as a static source; materialFixed1 accepts only the proven unit constant for checked Softness/LightnessStrength with UseCurve=false/Value exactly1 (or native unchecked return1). `KisStandardOptions.h:28–31` and `KisCurveOption.cpp:102–168` prove the early guard/no-sensor/no-RNG constant law; Sharpness/color/texture guards remain unchanged. New tests include saved fuzzy curves, both unit material options, genuine nonunit/active consumers and one/two-frame GIH with PNG texture.246 Python PASS with explicit provider/zero skips.

Full candidate manifest2139546B exceeds the existing2MiB file gate by42394B; no limit was changed or lossless data removed. The ready17 descriptor payload is330945B; it is not a served catalog. Exact file/field/CAS accounting is retained in `fixes-v49/source-author-size-accounting.json`. No output catalog directory or CAS/runtime copies were created.

## Typed default-auto author programs

Version2 defaultAuto source records now build the SAME nine-program SourceStrokeAuthor under explicit coverage profile and default-auto-fixed1-rng-free policy. No asset context is required or synthesized; identity is descriptorID@version, raw tip data and initial integer brush metrics remain separate. Existing version1 image programs and new version2 image programs retain PNG policy/geometry. The actual compiled seven-descriptor fixture is exercised with30 pressure packets and every-yield reconstructed checkpoints; no stock-ID dispatch exists in production. Auto material cannot enter image canonical encoding/prepass until the separate typed recipe exists. Source/cache audit and limitations are in sourceDabCache.auto.provenance.md.

## Explicit native GUI spacing/timing refresh policy

For `inputProfile='krita-freehand-no-smoothing-v1'`, the descriptor now uses the retained `PaintOpSettings/updateSpacingBetweenDabs` and `PaintOpSettings/isAirbrushing` settings. Canonical strings `true` enable the corresponding50ms refresh; `false` or a missing property use the existing SOURCE_LONG_TIME=320000000000ms. Other strings reject before curve compilation. The raw airbrush setting must agree with the existing normalized timing.enabled value. No sourceStamp field, importer, curve, mask, cache, distance/interpolation formula or rendering pipeline changed. Undefined/historical inputProfile retains its existing50/50 policy and fixtures.

Pinned native source bd6e8d061d2f0388c5b10278786cf0fe62e3135f: `kis_tool_freehand_helper.cpp`323–331 selects spacing and timing refresh independently via `KisResourcesSnapshot::needsSpacingUpdates/needsAirbrushing`; `kis_paintop_settings.cpp`498–516 reads the two properties with defaultfalse. `kis_timing_information.h`15 defines the finite LONG_TIME constant. The inspected residual-loop/reset/updateSpacing law agrees with the existing implementation; it was not patched to fit pixels.

Actual retained Basic5 Size/Opacity40 runtime KPP and portable source settings both have these flagsfalse. The old unconditional50ms policy inserted nonpainting endpoint queries and changed variable-size placements. Separate HOST diagnostic with ONLY the source-derived refresh intervals changed eliminated the full native512² mismatch (previous1352 alpha pixels/max128): SAME author/adapter/encoder and original raster kernels now match the native whole-RGBA hash exactly,26dabs/149 diagnostic frames, including every-yield resume. The actual Size/Opacity GUI regression/input/native hash belongs to the independently retained sizeGui fixture. No brush-ID branch, pressure/geometry fitting or native device action is added by this fix.

Older DefaultGUI/GaussianGUI/pressure57 fixtures only change derived diagnostic frame counts (185→143,183→159,198→132); original inputs/KPP/provider/native RGBA hashes and draw counts remain immutable and whole native comparisons are rerun. Source audit and selected evidence: fixes-v52/size60-spacing-refresh-audit-plan.md and size60-spacing-refresh-source-evidence.json. Production/room/read guards are not activated by this policy correction.


## Explicit primary-texture V3 source consumer (not online activation)

Explicit primaryTexture context selects the SAME shared semantic extractor on the
ORIGINAL descriptor and declared assets; old context still refuses textures. No
textureEnabled=false descriptor copy is used. The compiled primary role retains
textureEnabled=true, exact pressure-identity-v1 program and a distinct
png-pressure-texture-v1 policy/program-id suffix. Missing original raw program or
native curve compiler still refuses. No BEGIN/room/asset authenticity is granted.

Consumer gates:137 tests/7 suites PASS against shared SOURCE, maxWorkers1;
actual app-options targeted12-root TypeScript noEmit exit0, scoped oxlint0 and
diff-check PASS. Baseline RAM-only Git pin of the five old producer modules
failed six new consumer tests (59 prior tests PASS); no production file was
replaced for this diagnostic. One extended RNG-control assertion initially had
a different fixture initial angle0 vs.3; equal inputs corrected, production
math unchanged. Shared capture/cost APIs are tested in the same joined run.
No online activation, runtime/device/shared-dist/dependency/commit change; no
own background process or temporary service remains.
