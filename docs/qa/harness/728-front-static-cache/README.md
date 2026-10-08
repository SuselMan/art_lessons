# OFF diagnostic static front cache

Same production heightAt/fbm/climb expressions are calculated once into RG32FLOAT, with no Q8/half-float intermediate. Native original uncached shader remains literally unchanged. Cached front loads current height+climb and neighbor height, then evaluates the original relief/edge/min/store in the same order. All RGBA Q8 writes remain, including G height and B source. No dry-domain omission or quality parameter change.

One immutable cache per dispatcher/device: exact key dimensions, paperOrigin, paperTexSize, scale, climb and paper/noise texture identities. Integer stride≥1 required. Different key or fractional stride falls back to original eager shader. This first bounded experiment intentionally avoids reallocating/destroying a texture inside an active encoder. Thus later differently bounded jobs can fall back: counters report prep/hits/fallbacks. Cache size1536 is18MiB; retained immutable uniforms64bytes. Device loss/destruction retires the cache; explicit destroy is permitted only after completion. No new GPU fence/readback in production dispatch.

RG32FLOAT write-only storage and textureLoad are supported by core WebGPU/WGSL format tables, not a float-filtering feature. Software actually validates this format/pipeline. Reference: https://www.w3.org/TR/webgpu/#plain-color-formats . No sampler is used for float cache; paper remains the original manual LINEAR_REPEAT formula.

Root controlled Surface gate in existing captured bundle:

```
await runEndToEnd({suppliedTape:originalTape,stages:'pressure',sameInputFront:true,staticFrontOracle:true,frontIndex:1})
```

`frontOracle.staticCache`:171 exact per-iteration old vs cached Q8 output on actual captured full1536 input/coverage and real baked paper/noise. Separate cachePrepNanoseconds GPUtimestamp, then32 alternating warm old/cached front GPU timestamps after2warmup pairs. Do not compare preparation wall compile cost to shader timestamps. Amortized171 estimate: prepGPU+171×cachedMedian vs171×baselineMedian; real planner schedule still needs whole-tape gate. No foreign film in this captured primitive (explicit existing guard).

Whole tape: same original operations with `diagnosticStaticFrontCache:false` and `true`, compare nativeSha/nativeReplaySha and errors. Report native/replay cache counters to detect fallback. Default false; lazy variant remains false. No promotion from software proof.

Software32×32 mixed wet/dry fixture:8 iterations ALLRGBA diff0/errors[], cache prep1/hits41/fallbacks0, core RG32 pipeline valid. This is not hardware performance or full1536 proof. Run `node docs/qa/harness/728-front-static-cache/check.mjs`.
