# Macro40: four exact program variants for current DT4 Lite

Export currentExactSearchDefinitions, ID wgsl-macro-current-exact-program. Fixed current physicalDtSource(3,4),64steps/e8/c64; incompatible explicit parameter values reject before GPU allocation. Program0 literal current shader;1 existing fastDivideSource;2 existing coalescedSinglePairSource from38;3 fastDivideSource(coalescedSinglePairSource(3)). These are four actual compiled shader programs, not four ignored parameter rows. Physics, field, CPU reducer, Lite PACK, buffers and host phase schedule unchanged. Fine wrapper deliberately not added without a real device gain.

## Applicability of existing bounded divider

Uses existing exact-program.ts transform and unchanged EXACT_BOUNDED_DIVIDE, not a new division approximation. Its stated domain is1<=den<=65535, u32 numerator, floor(n/den)<=65535. Float quotient estimate is used only to propose an integer; final products/comparisons correct at mostone quotient unit under the existing bounded f32 accuracy contract. GPU/compiler validation remains mandatory. See [original proof and limits](../exact-division.md), exact-bounded-divide.ts and its primary WGSL accuracy reference. CPU Math.fround is not universal shader-driver proof.

| Actual substituted context | Denominator | Current DT4 bound |
|---|---|---|
| m[c]*mixAlpha+den/2 | max(m.a,1) | effective mixing k<=120; alpha=floor(Ma*k/256)<=30719, quotient<=alpha |
| c.m.a*absorbed+den/2 | max(c.w,1) | absorbed<=floor(W/32); quotient<=2048 before deposition share |
| c.m[k]*adsorbedAlpha+ma/2 | max(c.m.a,1) | deposited alpha<=donor Ma, quotient<=alpha |
| donor.m.a*q+den/2 | max(donor.w,1) | final q<=floor(.8W); quotient<=52428 (including rounding), receiver capacity may reduce further |
| donor.m[k]*carriedAlpha+ma/2 | max(donor.m.a,1) | alpha<=donor Ma, quotient<=alpha |

All numerators fit conservative65535²+floor65535/2=4,294,868,992 <2^32; actual first/adsorption bounds are smaller. Correction max product(65535+1)*65535=4,294,901,760 <2^32. Timestep changes q request, but final donor0.8 and capacity clamps remain and preserve this domain. Zero denominators use existing max(value,1); no new hidden clamp/domain workaround. No other division/precision/order changed. Coalesced pair endpoint exactness/purity obligations are inherited from33/38; not assumed for arbitrary future shaders.

CPU3PASS:100k valid random material-context sets (five ratio calls each), independent BigInt floor comparison and denominator/quotient/numerator checks, explicit0/max/tie cases; all five anchors present in current raw/coalesced shaders, reverse substitution restores source literally, four unique program SHA, source drift/reapply rejects; actual factory selected pairSHA matches program and every other source/uploaded word/fieldSHA/dispatch/buffer allocation unchanged across four programs, prealloc fixedconfig validation and owned cleanup. Transitive strict/noUnused TypeScript0. Mock pipeline does not compile real WGSL; device equality comes first.

## Measurement plan / no result extrapolation

Durable macro40-gpu-cases.json:8 primary requests, programs0..3 × mini/two-strokes, optical-density, repeats3 with5s idle, exportRaw/full carrier, no GPU profiler enabled. Require fullRGBA and complete coarse RGBA/W ledgers equal program0, repeated samples/source/input exact, then balanced scheduling/timing. Initial eight requests are a gate, not enough to declare stable speed winner; ABBA/BAAB paired follow-up if any apparent gain. Old macro9 division/single-pair negative timing does not establish performance on current coherent/DT4 shader. Macro33's negative result also does not prove coalesced38/divider40 outcome.

Optional GPU timestamp run must be a separate report/requests copy with profileGPU:true and supported timestamp-query; never pool its times with unprofiled primary. totalReady includes CPU upload/reduction/readiness, runToDependent includes submission/completion overhead; neither blindly called pure GPU. This finite4-program exact-source search is not a formal universal superoptimizer or proof of optimal code, and no artistic-score/new-physics claim. Root owns registry/configKeys (program plus fixed coarse keys)/build. No GPU/device/service/worker launched by this agent.
