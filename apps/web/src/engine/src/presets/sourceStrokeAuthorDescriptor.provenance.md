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

The raw schema is separate from a future durable compiled-data version. `compileCurve({text,points{x,y,corner}})` is an explicit optional author capability, returning version `native-sparselu-v1` and finite native interval coefficients. Identity curves need no provider. Nonidentity without that provider returns `native-curve-compiler-unavailable:<slot>:<sensorSlot>`, never silently substituting a legacy uniform curve. Coefficients are validated by the existing exact polynomial transfer compiler. Provider provenance/attestation is its caller's responsibility; this is not a network trust or legal-clearance assertion.

## Limits and tests

Opaque unchanged inverse-gray PNG/GBR source grids only, verified against existing tip.imageSampling CAS asset/rectangle and original dimensions. Nonunit dynamic material consumers, texture, image adjustments, colored/material/GIH paths and masking master-size ownership remain explicitly unsupported candidates. Child raw data still survives; the adapter does not guess master-size semantics. CAS bytes themselves are validated/loaded by the existing library path, not by this pure adapter. Context supplies current native color identity, LOD and optional captured native effective scale.

`sourceStrokeAuthorDescriptor.imported.json` is self-authored3×5 grayscale PNG + KPP passed through the **real importer**, including an arbitrary nonlinear curve. It is production-reader regression data, not a native pixel oracle. Tests cover raw common/per-sensor selection, source order, curveMode, corner flags, float32 law inputs, legacy scale, precision names, unsupported source IDs, portable tampering, explicit compiler refusal/capability, CAS guards and execution of the existing owner. No device/pixel parity or full-brush admission is claimed.

No temporary processes, runtime copies, dependencies or device resources were created by this unit.

## Bounded data contract

Both runtimes use the same accounting: UTF-8 settings keys/values + all selected common/sensor curve texts +32 bytes per knot +64 per option/sensor +source-ID/reason strings +2048 metadata allowance. Maximum1MiB per sourceStamp and16MiB per library, including masking descriptors. This measures source data independently of runtime-specific JSON float formatting. Shared preflight runs before detailed curve validation; portable preflight runs before CAS payload decoding or installation. Python charges selected curve text before parsing its knots; exceeding the normalized budget preserves bounded raw settings with an explicit unsupported candidate. Numeric curve syntax is finite decimal/exponent only, rejecting hex/underscores equally in Python and TS.

Evidence `fixes-v49/source-descriptor-budget.json`: pinned118 source inventory,117 with brush_definition (Basic-1 roundmarker has none). Source normalization with1×1 placeholder metrics to isolate data overhead: total compact JSON941680B, largest10236B (WaterC_Basic_Round-Grunge), including3679B raw settings,561B normalized curve text and58 knots. This is a source-settings budget survey, not regeneration or admission of118 descriptors. Existing CAS/library size limits remain unchanged. Tests include repeated-curve expansion, aggregate18-descriptor overflow and proof that a rejected portable manifest never reaches CAS decoding.
