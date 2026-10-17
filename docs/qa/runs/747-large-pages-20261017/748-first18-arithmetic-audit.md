# First18 CPU arithmetic audit and bounded control ladder

Read-only audit of runtime509fb989 and materialagent external `748-native-unit-arithmetic`; no app or kernel changes. CPU oracle is an **ideal byte recurrence for this fixture**, not a WebGL/GLES universal UNORM conversion proof.

## Confirmed from sources and retained captures

- `paperLoader.ts:249–266,414–426`: flat is constant2×2 LUMINANCE_ALPHA, H255/catch128; harness awaits engine.paperReady. The captured pressure17 G is255 at every field pixel. Constant height makes `hj-height(neighbor)` zero; finite noise-modulated climb has no edge effect in this fixture.
- `WatercolorPasses.ts:202–212` and `discreteGridSampling.ts:5–25`: actual pass carries discreteGrid=true, S1, integer stride1; source cost and coverage samplers are scoped NEAREST and restored afterward. Capture metadata reporting a destination base filter LINEAR is **not** the filter used to sample the input during that draw. Paper/noise keep their original filters.
- `WatercolorPasses.ts:230–266`: actual native uniforms costMax100/dry48/climb30/floor.85, origin0, no foreign; fullscreen field2048×1536. `AccumulationBuffer.ts:425–433` sets matching viewport and disables BLEND. DITHER is not disabled by this path.
- `WatercolorSettlePlan.ts:577–618`: pressure seed, outward relaxation, then inward; coverage is extended only after inward. Therefore the independently captured pre-front coverage is still valid at outward18. CPU scan finds coverage alpha only0/255. ForeignWet0 makes foreign sampler irrelevant to film.
- `shaders.ts:3016–3023,4127–4167`: interpolated v_uv, eight neighbor samples, skip uv outside[0,1], skip ci>=.999, min cost, then output normalized R=`min(best,max)/max`. No explicit output-byte quantization. Five samplers are plain declarations in baseline, despite float highp.
- Matched input17 and coverage bytes/SHA are identical across devices. Pressure17 includes padding rows. Binary coverage and constant paper are checked from actual retained bytes, not assumed from alpha of the original brush.

## What the oracle proves, and what it assumes

Under exact byte lookup (`ci=sourceByte/255`), flat height, binary film, no foreign and round-to-nearest output, wet/dry increments are axis3/122, diagonal4/173. Materialagent exhaustive rational tests and two float32 groupings verify all255 source codes and four edge classes; nearest half threshold is at least.05byte away. Monotone rounding commutes with minimum and integer source shifts here. Source255 sentinel matches ci>=.999 for ideal normalized lookup. Center and neighbor minimum naturally saturates at255.

This does **not** prove actual sampler-return precision, interpolation/addressing, driver arithmetic transformations or RGBA8 output conversion. HIGH_FLOAT23 is a prerequisite observation, not proof of an exact floating instruction sequence. Baseline DITHER is enabled; its actual effect must be tested at this boundary. Earlier whole-pipeline DITHER-off final equality does not rule out a first18 effect masked/combined by later independent causes.

Ideal fragment-center UV maps a neighbor outside the field to a rejected coordinate; oracle excludes that neighbor. With ideal centers, >= versus > at UV1 makes no difference. Actual interpolation was not read back, so the source-level argument is not a hardware addressing proof. Independently, all observed mismatches are >=24pixels from the physical field edge, excluding the simple outer-edge/clamp special case for these pixels.

## Saved-data classification (no new GPU reads)

Baseline Samsung differs from ideal/Intel at2594 R values, all−1, GBA0. Winning ideal branch:2532 wet-axis,62 wet-diagonal. Highp-native sampler control leaves1431 R differences, all−1:1411 wet-axis,20 wet-diagonal. No dry/background or physical-edge mismatch is needed to explain these sets. Thus material/paper/noise and a half-tie are unnecessary causes in this fixture; this does not identify the remaining hardware operation.

External `classification.json` stores20 examples per set, exact decimal-rational numerator/denominator, winning source byte/class, ideal rounding and distance from half. Typical wet-axis case is source100+2.55=102.55; output103 ideal versus Samsung102. This is not a mathematical half tie (.05byte from threshold), but actual normalized sampling/output machinery can still introduce errors. Do not call Samsung wrong solely because it differs from the selected ideal model.

## Smallest next controls, one axis at a time

1. **Native-program-only DITHER off**, original samplers, actual17 equality then18 comparison. Prefix build/jump untouched; exact program-filtered draw wrapper, per-draw DITHER restore/counts. This control is currently separately authorized; no result assumed here.
2. If residual remains, output-only byte-center control: keep all sampling and float recurrence, replace only R output by `floor(clamp(R,0,1)*255+.5)/255`, with native DITHERoff fixed in both arms. This tests implicit-store sensitivity; it is a diagnostic math change, not an approved art fix or universal portable encoding guarantee.
3. Separate source-decode-only control: round only cost sampler values to nearest byte and decode back (`floor(sample*255+.5)/255`), leaving UVs, recurrence and output otherwise unchanged. Compare to the appropriate same-DITHER baseline. Do not silently combine with output rounding.
4. If those are negative, address-only control derives cost-center/neighbor coordinates from fragment pixel centers and integer offsets; validate viewport0/full field and bounds. Paper/film UVs stay unchanged. CPU ideal-address classification alone cannot prove actual GPU address selection.
5. A flat/binary/integer-byte recurrence is a **last fixture-only reference**, guarded by the exact parameter/input predicates above. It bypasses multiple mechanisms, so a match would not by itself distinguish sampler decode from output conversion. Never enable it for textured/fractional/foreign/general material or promote it as renderer policy.

No GPU, browser, service, runtime or harness edits are part of this audit. Separate QA DITHER helper is tracked by its own task. Owned Lanpad keepawake was renewed only with ES_SYSTEM_REQUIRED, bounded30min and ownChrome validation; ledger records old/new requests.

## Subsequent scoped DITHER result

Native-program-only DITHERoff17→18 completed on both devices: actual140matched draws disabled/restored140, prefix17 unchanged, each device18 hash unchanged from its own baseline. Thus this tested first18 drift is not removed by disabling native DITHER; this conclusion follows a new direct boundary control, not the earlier full-pipeline test. Sampler highp alone reduces2594→1431 but does not solve it. Highp residual winning-source histogram and20examples are in companion classification JSON. No quantized-output candidate was run as part of this audit.
