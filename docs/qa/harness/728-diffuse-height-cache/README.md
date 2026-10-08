# OFF diagnostic cached diffusion height

Real Surface front-cache evidence (separate primitive, unchanged originalmodel):1536²,171 per-iteration wholeRGBA comparisons exact0/errors[]. Cache prep1.703936ms;32 alternating GPU samples baseline median4.325376ms (min4.25984,p954.653056,max4.718592), cached median2.850816ms (min2.752512,p952.883584,max3.080192). Amortized repeated171 estimate739.64→489.19ms including preparation; not whole-stroke measured improvement. Distribution is stable and separates beyond tail overlap. Full original-tape OFF/ON gate is root controlled, not yet claimed here. Lazy branch experiment was slower and remains OFF.

Diffusion experiment: original CANONICAL_DIFFUSE_WGSL unchanged. Separate cached variant substitutes ONLY heightAt(px) and heightAt(px+o) with float textureLoad. Ink/wet gates, neighbor order, give/take arithmetic, out4 mutations/clamp and Q8 storage remain identical. Radius is already prepared positive integer; axis/knight offsets are integers. With world-top q, neighbor cache coordinate is(q.x+o.x,q.y−o.y). Existing uvj bound guard runs before height load. Valid neighbor is a field pixel centre; integer/half-integer arithmetic is exact within supported native dimensions, so precomputed px+paperOrigin matches old heightAt(px+o) position. No clamping or out-of-domain wrapping substitution.

Reuse existing RG32 front cache if dimensions/paperOrigin/texSize/scale and actual paper/noise identities match. Diffusion ignores cached climb key/value and readsR only. If no cache yet, same prep computes heights once with climb0; subsequent front with different climb falls back instead of using wrongG. Geometry mismatch falls back eager; counters disclose this bounded1cache/device behavior. Float precision, original paper LINEAR_REPEAT formula, Q8 boundaries and source inputs preserved. New flag diagnosticStaticDiffuseHeight defaultsfalse independently of frontflag.

Root Surface primitive gate, captured bundle:

```
await runEndToEnd({suppliedTape:originalTape,stages:true,staticDiffuseOracle:true})
```

Requires actual `first:diffuseInput/Gate` snapshots and actual diffuse metadata (preparedRadius/knight/world/paper size). `diffuseOracle` returns171 per-iteration ALLRGBA comparisons, separate prepGPU and32 warm alternating GPU timestamps baseline/cached. No pressure/coverage probe because those deliberately omit diffuse-input capture. This repeats one operator; it is not a new planner schedule. Whole tape later: diagnosticStaticDiffuseHeight:false/true with SAME original operations, compare native/nativeReplay hashes and errors. Frontflag stays unchanged.

Software32²8step radius1 axis mixed wet/dry actualkernels: exact0/errors[],prep1/hits41/fallback0. Not full1536/hardware/performance proof. `node docs/qa/harness/728-diffuse-height-cache/check.mjs`.
