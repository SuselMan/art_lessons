# Exact scissor dispatch localization

`CanonicalBrushContact` paired/single and `CanonicalFieldOps` previously launched
8×8 workgroups over the whole texture, then returned for every invocation outside
the production scissor. They now launch only its pixel-centre rectangle. No
backend, source phase, pass order, Q8 boundary, texture sampling or model changes.

For a GL-bottom-up scissor [x,y,w,h], packed to f32 exactly as before, surviving
integer GL columns are [ceil(x-.5), ceil(f32(x+w)-.5)). Rows use the same formula
and map to native top-down offset H-upperRow. Clamp these intervals to the output
extent and treat reversed/empty intervals as empty. A vec4u uniform supplies
native offset and extent; the kernel reconstructs GLOBAL q=tid.xy+offset. All
subsequent pixel centres, UVs, donor samples, texture dimensions, scissor predicate
and stores remain the original global expressions. Rounded workgroup overhang is
rejected before sampling. No support halo is needed: only WRITES are localized;
all neighbour READS continue to sample the unchanged full input textures.

Run the small software gate:

```sh
node docs/qa/harness/728-dispatch-scissor/check.mjs
```

The gate builds frozen actual kernels from git9d6f41f1 and current actual kernels.
Same-input rgba8unorm32×40 fixtures cover field modes1/6 (including LINEAR inputs),
paired contact and single P/C across full, odd, clipped, fractional and empty
scissors:40 cases. Every output byte matches; outside bytes retain their sentinel.
All positive cases perform real changed writes. Actual recorded workgroups for
scissor7×9 are4×5 →1×2. Validation/errors0. Output is
`temp/dispatch-scissor/latest.json`; software proof, not hardware/time proof.

Additional gates:30 existing GL/native field mode cases exact on SwiftShader
(plus meaningful LINEAR negative control), CPU exhaustive original f32 predicate
checks across259 rectangles/331520 pixel centres, app+SW typecheck and oxlint.
For field1536² and scissor100×200 the launched invocation budget becomes20800
instead of2359296. That is an INVOCATION count reduction, not a measured speedup.
Root owns actual Samsung/Surface quality and performance checks.
